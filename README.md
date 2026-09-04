# Event Ready

Two small Rote Plays turn event email into a safe Calendar entry, then open the
right workspace when the event begins.

Status: implemented as a draft. Automated checks and live Gmail/Calendar reads
pass. Rote 0.79 currently strips the required Calendar write scope during OAuth
setup, so portable write acceptance is blocked until that setup path is fixed.

| Play                    | Purpose                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inbox-event-router`    | Collects bounded new Gmail messages, requires an agent decision for every message, then creates or updates private Calendar events and phone reminders. |
| `event-workspace-setup` | Matches an upcoming event to a repository inside approved roots, then opens the chosen editor and useful external links.                                |

## Inbox event router

This Play deliberately uses two calls:

1. `collect` returns new messages, existing Calendar evidence, a run token, and
   the exact decision schema. It writes nothing to Calendar.
2. An agent reads every candidate and returns one evidence-backed `ignore` or
   `upsert` decision per message.
3. `apply` validates the complete decision envelope, checks for duplicates
   again, and performs only the approved private Calendar writes.

The Play requires the least-privilege `calendar.events.owned` grant. In Rote
0.79, adapter setup and bare reauthorization currently grant only read access;
do not publish this Play until the write grant works through the normal setup
flow.

```sh
rote play run ./plays/inbox-event-router/main.ts mode=collect calendar_id=primary lookback_days=7
rote play run ./plays/inbox-event-router/main.ts mode=apply calendar_id=primary decisions_json='<agent-envelope>'
```

The Play never stores email bodies, adds guests, sends mail, RSVPs, registers,
or deletes Calendar events. Ambiguous messages must be ignored or explicitly
marked `Needs confirmation`; missing dates, times, or timezones are never
invented.

An always-on Raspberry Pi should schedule an agent harness that completes both
calls. Scheduling `collect` alone cannot create an event because Rote does not
perform the semantic classification inside the Play.

## Event workspace setup

Configure approved roots and app choices once, then run against the next
relevant Calendar event:

```sh
rote play run ./plays/event-workspace-setup/main.ts mode=setup project_roots='["/Users/me/projects"]' editor=code browser=default
rote play run ./plays/event-workspace-setup/main.ts mode=run calendar_id=primary horizon_hours=24
```

Windows, macOS, WSL, and Linux launch adapters are included. Repository
discovery stays inside approved roots. An ambiguous match opens nothing and
returns choices. The Play never changes project files, installs dependencies,
runs project commands, joins meetings, or submits forms.

## Verify locally

```sh
rote play validate ./plays/inbox-event-router/main.ts
rote play validate ./plays/event-workspace-setup/main.ts
deno test -A ./plays/inbox-event-router/resources/tests ./plays/event-workspace-setup/resources/tests
```

Both Plays keep owner-private configuration, cursor, lock, and audit data in the
operating system's user-state directory. Set `EVENT_READY_STATE_DIR` only when
an isolated state location is needed for testing.
