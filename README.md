# Event Ready

Two public [Rote Plays](https://www.modiqo.ai/blog/the-playoffs): turn email into
Calendar events, then prepare the right workspace when it is time to act.

| Play | Purpose |
| --- | --- |
| [Inbox Event Router · 0.3.1](https://play.modiqo.ai/siiddhantt/inbox-event-router@0.3.1) | Review new Gmail messages, create or update private events and reminders, and retain a resumable cursor and searchable history. |
| [Event Workspace Setup · 0.2.2](https://play.modiqo.ai/siiddhantt/event-workspace-setup@0.2.2) | Choose an upcoming or ongoing event, clone a configured missing repo, install dependencies, and open its editor and links. |

Works with interviews, appointments, submission deadlines and other events.
No repository clone is needed to run either published Play.

## Inbox → Calendar

Requires Rote, Deno, Python 3.10+, an authenticated Codex account, Gmail read
access and Calendar owned-event write access. Complete the short
[account setup](plays/inbox-event-router/resources/README.md) once.

```sh
rote registry play pull siiddhantt/inbox-event-router --yes
runner="$HOME/.rote/flows/siiddhantt/inbox-event-router/resources/runner.py"
python3 "$runner" run
python3 "$runner" history
python3 "$runner" history --search interview --since 2026-09-01 --json
```

On Linux, `python3 "$runner" schedule --minutes 15` installs a user timer and the
`event-ready` command. Use `event-ready status`, `event-ready history --all`, or
`event-ready run`. The scheduler invokes the versioned public Play; local state,
authentication and systemd units live outside this repository.

## Calendar → workspace

Requires Git, Deno, a desktop editor/browser and Calendar read access. Choose a
repository you trust; dependency installation can execute its lifecycle scripts.
Create the parent directory first and replace these example paths and URL:

```sh
play=https://play.modiqo.ai/siiddhantt/event-workspace-setup@0.2.2
rote play run "$play" mode=setup project_roots='["/home/me/projects"]' \
  project=/home/me/projects/project repository_url=https://github.com/you/project \
  install_dependencies=true editor=code browser=default
rote play run "$play" horizon_hours=168 project=/home/me/projects/project dry_run=true
rote play run "$play" horizon_hours=168 project=/home/me/projects/project remember=true
```

Add `event_id=CALENDAR_EVENT_ID` to select a particular event. Otherwise the Play
selects the next eligible event. [Package instructions](plays/event-workspace-setup/resources/README.md)
cover account setup, dependency support and saved mappings.

## Development

```sh
deno task check
deno task test
deno task lint:plays
deno task test:classifier  # Real Codex, synthetic mail; no Gmail/Calendar calls
```

The router verifies complete decisions and Calendar acknowledgments before
advancing its cursor. Failed batches remain retryable. Queryable receipts stay
private; Rote execution traces may contain email bodies. Classification sends
email evidence to your authenticated AI provider. Ambiguous or attachment-only
dates require review; unusually late indexed mail can fall outside the five-minute
overlap. Past reminder times cannot be delivered retroactively.
