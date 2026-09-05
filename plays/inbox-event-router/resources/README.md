# Inbox Event Router

A Gmail email says your interview moved. This Play collects the evidence and
lets your agent review it, then validates the resulting Calendar update and
keeps a resumable cursor. Several explicit deadlines in one message can become
separate milestones. Unclear dates are ignored with a review reason.

## First run

Requirements: Rote 0.80.0, Deno, Gmail read access and Google Calendar
owned-event write access. The package declares the Gmail and Calendar adapters.
A person must complete Google consent for their own accounts. Rote 0.80.0 needs
the Calendar scope correction described in the
[setup guide](https://github.com/siiddhantt/event-ready/blob/harden-event-ready/docs/raspberry-pi.md).
The helper is included at `resources/authorize-calendar.py`.

```sh
rote play run ./main.ts mode=collect calendar_id=primary batch_size=25 --output=json
```

Give the result to your agent. Follow its `decision_contract` to return one
decision per message and the same `run_token`. Save the JSON outside the
package:

```sh
rote play run ./main.ts mode=apply calendar_id=primary decisions_json=@file:/absolute/path/decisions.json --output=json
```

`collect` makes no Calendar writes. `apply` creates or updates only private
events and verifies actual Calendar acknowledgments before committing the
cursor. It never invites guests, sends email, RSVPs, registers you or deletes
events. Unrelated existing events are preserved. Repeating a failed batch
rechecks Calendar and uses deterministic IDs. Older source mail cannot undo a
newer timestamped update.

For automatic collect → Codex → apply cycles and a 15-minute Raspberry Pi timer,
use the runner and systemd files in the
[source repository](https://github.com/siiddhantt/event-ready/tree/harden-event-ready).
The Play itself does not embed an AI provider or create a schedule
automatically.

## State and limits

The default state directory is `~/.local/state/event-ready/inbox-event-router`
on Linux/macOS; Windows uses `%LOCALAPPDATA%\Event Ready\inbox-event-router`.
`EVENT_READY_STATE_DIR` selects another location. State is bound to the Gmail
account and chosen Calendar. A failed pending batch must be retried, not
cleared.

Rote retains local execution traces that may include full emails. Keep them
private and out of recordings. Your agent receives the email evidence. The
five-minute overlap is bounded polling, not Gmail history sync; very late
imported mail may need a separate lookback scan. Attachment-only or ambiguous
dates require review. Calendar reminder delivery depends on the phone's sync and
notifications; past reminder times cannot be delivered retroactively.

[Tests and live verification](https://github.com/siiddhantt/event-ready/blob/harden-event-ready/docs/verification.md)
·
[Two-minute demo](https://github.com/siiddhantt/event-ready/blob/harden-event-ready/docs/demo.md)
