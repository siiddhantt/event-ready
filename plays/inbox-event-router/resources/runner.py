#!/usr/bin/env python3
"""One bounded collect -> Codex review -> validated apply cycle. Linux/macOS."""
import argparse
from datetime import datetime
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import shlex
import tempfile
import time

RESOURCES = Path(__file__).resolve().parent
PLAY_REFERENCE = "https://play.modiqo.ai/siiddhantt/inbox-event-router@0.3.1"


def command(argv, *, env, cwd, stdin=None, timeout=300):
    proc = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, start_new_session=True)
    try:
        stdout, _ = proc.communicate(stdin, timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate()
        raise RuntimeError(f"{Path(argv[0]).name} timed out; pending batch retained") from None
    if proc.returncode:
        # Provider diagnostics can contain message bodies; never put them in the journal.
        raise RuntimeError(f"{Path(argv[0]).name} failed (exit {proc.returncode}); inspect its private run locally")
    return stdout


def result_json(raw):
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        raise RuntimeError("Command did not return a JSON receipt; pending batch retained") from None
    if not isinstance(value, dict) or value.get("error"):
        raise RuntimeError("Command returned an invalid receipt; pending batch retained")
    return value


def classify(collection, *, env, cwd, codex, model=None):
    instructions = (RESOURCES / "classifier-prompt.txt").read_text()
    output = Path(cwd) / "decisions.json"
    argv = [codex, "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules",
            "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never",
            "-c", 'approval_policy="never"', "-c", 'web_search="disabled"',
            "-c", "features.shell_tool=false", "-c", "features.unified_exec=false",
            "-c", "features.multi_agent=false", "-c", "features.js_repl=false",
            "-c", "developer_instructions=" + json.dumps(instructions),
            "--output-last-message", str(output), "-"]
    if model:
        argv[2:2] = ["--model", model]
    command(argv, env=env, cwd=cwd, stdin=json.dumps(collection), timeout=480)
    if not output.is_file():
        raise RuntimeError("Codex returned no decision envelope")
    envelope = result_json(output.read_text())
    if envelope.get("run_token") != collection.get("run_token"):
        raise RuntimeError("Classifier returned a different run token")
    messages = {m["message_id"]: m for m in collection["messages"]}
    for decision in envelope.get("decisions", []):
        events = decision.get("events", []) if decision.get("action") == "upsert_many" else [decision] if decision.get("action") == "upsert" else []
        for event in events:
            source = messages.get(decision.get("message_id"), {})
            if event.get("source_thread_id") != source.get("thread_id"):
                raise RuntimeError("Classifier changed a message's source thread")
            try:
                received = datetime.fromisoformat(event["source_received_at"].replace("Z", "+00:00"))
                if received.utcoffset() is None:
                    raise ValueError("timestamp needs an explicit offset")
                claimed = received.timestamp() * 1000
                if abs(claimed - source["internal_date_ms"]) > 1:
                    raise ValueError("timestamp mismatch")
            except (KeyError, TypeError, ValueError):
                raise RuntimeError("Classifier changed a message's received timestamp") from None
    os.chmod(output, 0o600)
    return output


def run_cycle(*, state_dir, calendar, lookback, batch_size, max_batches, model=None):
    state_dir = Path(state_dir).expanduser().resolve()
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(state_dir, 0o700)
    env = dict(os.environ)
    env["EVENT_READY_STATE_DIR"] = str(state_dir)
    env["PATH"] = str(Path.home() / ".local/bin") + os.pathsep + env.get("PATH", "")
    rote = shutil.which("rote", path=env["PATH"])
    codex = shutil.which("codex", path=env["PATH"])
    if not rote or not codex:
        raise RuntimeError("Install rote and codex before running the scheduler")
    lock = (state_dir / "runner.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        return {"status": "already_running"}
    try:
        return process_batches(rote, codex, env, state_dir, calendar, lookback, batch_size, max_batches, model)
    finally:
        lock.close()


def process_batches(rote, codex, env, state_dir, calendar, lookback, batch_size, max_batches, model):
    totals = {"batches": 0, "processed": 0, "inserted": 0, "updated": 0}
    play = PLAY_REFERENCE
    # Neither raw emails nor classifier decisions are kept by this wrapper after a run.
    with tempfile.TemporaryDirectory(prefix="event-ready-") as work:
        for _ in range(max_batches):
            collect = result_json(command([rote, "play", "run", play, "mode=collect",
                f"calendar_id={calendar}", f"lookback_days={lookback}", f"batch_size={batch_size}",
                "--yes", "--output=json"], env=env, cwd=work))
            if collect.get("status") == "idle":
                return {"status": "idle" if not totals["batches"] else "caught_up", **totals}
            if collect.get("status") == "page_complete":
                continue
            if collect.get("status") != "needs_agent_decision" or not collect.get("messages"):
                raise RuntimeError("Collection incomplete; no classification or writes attempted")
            envelope = classify(collect, env=env, cwd=work, codex=codex, model=model)
            # The Play revalidates complete coverage, thread identity, dates, confidence,
            # duplicates and every Calendar write before committing the cursor.
            applied = result_json(command([rote, "play", "run", play, "mode=apply",
                f"calendar_id={calendar}", f"decisions_json=@file:{envelope}", "--yes", "--output=json"],
                env=env, cwd=work))
            if applied.get("status") != "applied":
                raise RuntimeError("Apply did not commit; pending batch retained")
            envelope.unlink()
            totals["batches"] += 1
            for key in ("processed", "inserted", "updated"):
                totals[key] += applied.get(key, 0)
    return {"status": "batch_limit_reached", **totals}


def history_rows(state_dir):
    path = Path(state_dir).expanduser() / "audit.jsonl"
    if not path.exists():
        return []
    rows, seen = [], set()
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        record = result_json(line)
        if record.get("action") != "apply" or record.get("status") != "applied":
            continue
        for result in record.get("results", []):
            outcome = result.get("outcome", "unknown")
            action = {"create_planned": "created", "update_planned": "updated"}.get(outcome, outcome)
            identity = (record.get("run_token", record.get("at")), result.get("message_id"), result.get("event_key", result.get("event_id")))
            if identity in seen:
                continue
            seen.add(identity)
            rows.append({"at": record.get("at"), "action": action,
                         **{k: v for k, v in result.items() if k != "outcome"}})
    return sorted(rows, key=lambda r: r.get("at", ""), reverse=True)


def history(args):
    rows = history_rows(args.state_dir)
    if args.action_filter:
        rows = [r for r in rows if r["action"] == args.action_filter]
    elif not args.all:
        rows = [r for r in rows if r["action"] in ("created", "updated", "cancelled")]
    if args.since:
        since = datetime.fromisoformat(args.since.replace("Z", "+00:00"))
        if since.utcoffset() is None:
            since = since.astimezone()
        rows = [r for r in rows if datetime.fromisoformat(r["at"].replace("Z", "+00:00")) >= since]
    if args.search:
        rows = [r for r in rows if args.search.casefold() in json.dumps(r, ensure_ascii=False).casefold()]
    rows = rows[:args.limit]
    if args.json:
        print(json.dumps(rows, ensure_ascii=False))
        return 0
    print(f'{"ACTION":<10} {"EVENT / REASON":<58} WHEN')
    for row in rows:
        start = row.get("start") or {}
        when = start.get("dateTime", start.get("date", ""))
        title = row.get("title") or row.get("reason") or row.get("event_id") or row.get("message_id", "")
        title = " ".join(str(title).split())
        if len(title) > 56:
            title = title[:55] + "…"
        print(f'{row["action"]:<10} {title:<58} {when}')
    print(f"{len(rows)} outcomes. Use --all for ignored/preserved mail, --json for full records.")
    return 0


def status(args):
    directory = Path(args.state_dir).expanduser()
    state_path, last_path = directory / "state.json", directory / "last-run.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    last = json.loads(last_path.read_text()) if last_path.exists() else None
    print(json.dumps({"play": PLAY_REFERENCE, "last_run": last,
                      "cursor_epoch_seconds": state.get("cursor_epoch_seconds"),
                      "pending_messages": len((state.get("pending") or {}).get("message_ids", []))}, indent=2))
    return 0


def unit_argument(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


def unit_contents(state_dir, calendar, minutes):
    if any(c in str(state_dir) + calendar for c in "\n\r\x00"):
        raise ValueError("Schedule paths and Calendar IDs must not contain control characters")
    run_args = [sys.executable, str(RESOURCES / "runner.py"), "run", "--state-dir", str(state_dir), "--calendar", calendar]
    service = "\n".join([
        "[Unit]", "Description=Event Ready published inbox Play", "After=network-online.target", "Wants=network-online.target", "",
        "[Service]", "Type=oneshot", "WorkingDirectory=" + str(state_dir).replace("%", "%%"),
        "ExecStart=" + " ".join(map(unit_argument, run_args)),
        "Environment=PATH=%h/.local/bin:%h/.rote/bin:/usr/local/bin:/usr/bin:/bin",
        "Environment=PYTHONDONTWRITEBYTECODE=1", "UMask=0077", "TimeoutStartSec=14min",
        "KillMode=control-group", "NoNewPrivileges=true", "PrivateTmp=true", ""])
    minute = "00" if minutes == 60 else f"00/{minutes}"
    timer = "\n".join(["[Unit]", "Description=Schedule the published Event Ready inbox Play", "", "[Timer]",
        f"OnCalendar=*-*-* *:{minute}:00", "Persistent=true", "RandomizedDelaySec=30", "AccuracySec=1s",
        "Unit=event-ready-inbox.service", "", "[Install]", "WantedBy=timers.target", ""])
    return service, timer


def schedule(args):
    if sys.platform != "linux":
        raise RuntimeError("Scheduling requires a Linux systemd user session")
    installed = Path(os.environ.get("ROTE_HOME", str(Path.home() / ".rote"))) / "flows/siiddhantt/inbox-event-router/resources"
    if RESOURCES.resolve() != installed.resolve():
        raise RuntimeError("Run schedule from the installed published package, not a repository checkout")
    state_dir = Path(args.state_dir).expanduser().resolve()
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(state_dir, 0o700)
    units = Path.home() / ".config/systemd/user"
    units.mkdir(parents=True, exist_ok=True)
    service, timer = unit_contents(state_dir, args.calendar, args.minutes)
    (units / "event-ready-inbox.service").write_text(service)
    (units / "event-ready-inbox.timer").write_text(timer)
    executable = Path.home() / ".local/bin/event-ready"
    executable.parent.mkdir(parents=True, exist_ok=True)
    executable.write_text("#!/bin/sh\nexport EVENT_READY_STATE_DIR=" + shlex.quote(str(state_dir)) + "\nexec " + shlex.join([sys.executable, str(RESOURCES / "runner.py")]) + ' "$@"\n')
    executable.chmod(0o700)
    import pwd
    for argv in (["systemd-analyze", "--user", "verify", str(units / "event-ready-inbox.service"), str(units / "event-ready-inbox.timer")],
                 ["loginctl", "enable-linger", pwd.getpwuid(os.getuid()).pw_name],
                 ["systemctl", "--user", "daemon-reload"],
                 ["systemctl", "--user", "start", "event-ready-inbox.service"],
                 ["systemctl", "--user", "enable", "--now", "event-ready-inbox.timer"]):
        subprocess.run(argv, check=True)
    print(json.dumps({"status": "scheduled", "play": PLAY_REFERENCE, "every_minutes": args.minutes, "command": str(executable)}))
    return 0


def run_main(args):
    started = time.time()
    try:
        result = run_cycle(**{k: v for k, v in vars(args).items() if k != "command"})
        code = 0
    except Exception as error:
        result = {"status": "failed", "error": str(error)}
        code = 1
    result.update(play=PLAY_REFERENCE, at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), duration_seconds=round(time.time() - started, 2))
    directory = Path(args.state_dir).expanduser()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if result["status"] != "already_running":
        temporary = directory / f"last-run.{os.getpid()}.tmp"
        temporary.write_text(json.dumps(result) + "\n")
        temporary.chmod(0o600)
        temporary.replace(directory / "last-run.json")
    print(json.dumps(result))
    return code


def main():
    parser = argparse.ArgumentParser(description="Run the published inbox Play, schedule it, or query its private history.")
    commands = parser.add_subparsers(dest="command", required=True)
    def command_parser(name):
        child = commands.add_parser(name)
        child.add_argument("--state-dir", default=os.environ.get("EVENT_READY_STATE_DIR",
                           str(Path.home() / ".local/state/event-ready/inbox-event-router")))
        return child
    run = command_parser("run")
    run.add_argument("--calendar", default="primary")
    run.add_argument("--lookback", type=int, default=7, choices=range(1, 31))
    run.add_argument("--batch-size", type=int, default=25, choices=range(1, 101))
    run.add_argument("--max-batches", type=int, default=4, choices=range(1, 21))
    run.add_argument("--model", default=None)
    query = command_parser("history")
    query.add_argument("--all", action="store_true")
    query.add_argument("--action", dest="action_filter")
    query.add_argument("--search", default="")
    query.add_argument("--since", help="ISO date/time; date-only values use the local timezone")
    query.add_argument("--limit", type=int, default=20, choices=range(1, 10001))
    query.add_argument("--json", action="store_true")
    command_parser("status")
    scheduled = command_parser("schedule")
    scheduled.add_argument("--calendar", default="primary")
    scheduled.add_argument("--minutes", type=int, default=15, choices=[5, 10, 15, 20, 30, 60])
    args = parser.parse_args()
    try:
        return {"run": run_main, "history": history, "status": status, "schedule": schedule}[args.command](args)
    except Exception as error:
        print(f"event-ready: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
