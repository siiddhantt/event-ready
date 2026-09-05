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
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


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
    instructions = (ROOT / "scripts/classifier-prompt.txt").read_text()
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
    play = str(ROOT / "plays/inbox-event-router/main.ts")
    # Neither raw emails nor classifier decisions are kept by this wrapper after a run.
    with tempfile.TemporaryDirectory(prefix="event-ready-") as work:
        for _ in range(max_batches):
            collect = result_json(command([rote, "play", "run", play, "mode=collect",
                f"calendar_id={calendar}", f"lookback_days={lookback}", f"batch_size={batch_size}",
                "--output=json"], env=env, cwd=work))
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
                f"calendar_id={calendar}", f"decisions_json=@file:{envelope}", "--output=json"],
                env=env, cwd=work))
            if applied.get("status") != "applied":
                raise RuntimeError("Apply did not commit; pending batch retained")
            envelope.unlink()
            totals["batches"] += 1
            for key in ("processed", "inserted", "updated"):
                totals[key] += applied.get(key, 0)
    return {"status": "batch_limit_reached", **totals}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", default=os.environ.get("EVENT_READY_STATE_DIR",
                        str(Path.home() / ".local/state/event-ready/inbox-event-router")))
    parser.add_argument("--calendar", default="primary")
    parser.add_argument("--lookback", type=int, default=7, choices=range(1, 31))
    parser.add_argument("--batch-size", type=int, default=25, choices=range(1, 101))
    parser.add_argument("--max-batches", type=int, default=4, choices=range(1, 21))
    parser.add_argument("--model", default=None)
    args = parser.parse_args()
    started = time.time()
    try:
        result = run_cycle(**vars(args))
        code = 0
    except Exception as error:
        result = {"status": "failed", "error": str(error)}
        code = 1
    result.update(at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), duration_seconds=round(time.time() - started, 2))
    directory = Path(args.state_dir).expanduser()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if result["status"] != "already_running":
        temporary = directory / f"last-run.{os.getpid()}.tmp"
        temporary.write_text(json.dumps(result) + "\n")
        temporary.chmod(0o600)
        temporary.replace(directory / "last-run.json")
    print(json.dumps(result))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
