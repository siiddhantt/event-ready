# Inbox Event Router

Review new Gmail messages, validate agent decisions, and create or update private
Calendar events with reminders. Multiple explicit milestones get separate events.
The published package includes the Codex runner, scheduler and history query.

## Setup

Install Rote 0.80.0+, Deno, Python 3.10+ and Codex; keep their commands on PATH.
Authenticate each account on the machine that will run the Play:

```sh
rote login --provider github
rote deno install
rote registry play pull siiddhantt/inbox-event-router --yes
rote registry adapter pull modiqo/gmail --yes
rote registry adapter pull modiqo/calendar --yes
rote oauth setup google --adapter gmail --scopes gmail.readonly
python3 "$HOME/.rote/flows/siiddhantt/inbox-event-router/resources/authorize-calendar.py"
codex login
```

The Calendar helper corrects Rote 0.80.0's omitted owned-event scope while
preserving Google's consent, PKCE and callback. For a headless host, forward
localhost:8765 over SSH and add `--print-url`; approve with that host's account.

## Run and query

```sh
runner="$HOME/.rote/flows/siiddhantt/inbox-event-router/resources/runner.py"
python3 "$runner" run
python3 "$runner" history
python3 "$runner" history --search interview --since 2026-09-01 --json
python3 "$runner" history --all --limit 100
python3 "$runner" status
python3 "$runner" schedule --minutes 15  # Linux systemd; installs event-ready
```

`run` uses your authenticated Codex session to call the public Play pinned to
0.3.1 in collect and apply modes. The default is four batches of 25 messages;
`--model`, `--calendar` and `--state-dir` are optional. No repository is needed.
`history` lists confirmed changes; `--all` includes ignored/preserved outcomes,
and `--action created` filters one action. JSON includes event keys, times and
Calendar links where available. History and status make no network calls.

The Linux timer persists through logout/reboot and runs a bounded cycle every
15 minutes. Inspect it with `systemctl --user status event-ready-inbox.timer`;
stop it with `systemctl --user disable --now event-ready-inbox.timer`.
Run `schedule` from an installed published package to update its service.

An agent can also call the public URI directly with `mode=collect`, then
`mode=apply decisions_json=@file:/absolute/path/decisions.json`. Collect writes
only local pending state. Apply requires complete message coverage and confirms
Calendar writes before saving history and advancing the cursor. No invitations,
email, RSVPs, registration or Calendar deletion occurs. Older messages cannot
revert newer recorded updates; user-deleted events stay deleted.

State and audit receipts live under `~/.local/state/event-ready/inbox-event-router`
on Linux/macOS. Use a separate state directory for another account or Calendar;
retry pending batches instead of clearing them. Codex receives email evidence,
and Rote retains private local traces that may include full bodies. Keep these
out of recordings. Attachment-only or uncertain dates require review. The
five-minute polling overlap does not cover arbitrarily late indexing, and past
reminders cannot fire retroactively. Phone delivery depends on Calendar sync.
