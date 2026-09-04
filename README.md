# Event Ready

Two small Rote Plays turn event email into a safe Calendar entry, then open the
right workspace when the event begins.

Status: draft pending one clean-machine OAuth installation test. Automated and
live Gmail/Calendar acceptance pass on the development machine.

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

The Play requires the least-privilege `calendar.events.owned` grant.

```sh
rote play run ./plays/inbox-event-router/main.ts mode=collect calendar_id=primary lookback_days=7
rote play run ./plays/inbox-event-router/main.ts mode=apply calendar_id=primary decisions_json='<agent-envelope>'
```

The first command is the direct terminal test. It intentionally stops after
collection because Rote executes the Play but does not classify email itself.
An agent must review every returned message and make the second call.

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
rote play run ./plays/event-workspace-setup/main.ts mode=run calendar_id=primary horizon_hours=24 dry_run=true
rote play run ./plays/event-workspace-setup/main.ts mode=run calendar_id=primary horizon_hours=24
```

Use `dry_run=true` first to display the exact editor and HTTPS links without
opening anything. On WSL, use a root such as
`["/mnt/d/Development/Projects"]`; on macOS, use a root such as
`["/Users/me/Developer"]`.

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
