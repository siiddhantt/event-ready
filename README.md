# Event Ready

Two public [Rote Plays](https://www.modiqo.ai/blog/the-playoffs): turn email into
Calendar events, then prepare the right workspace when it is time to act.

| Play | Purpose |
| --- | --- |
| [Inbox Event Router · 0.3.1](https://play.modiqo.ai/siiddhantt/inbox-event-router@0.3.1) | Review new Gmail messages, create or update private events and reminders, and retain a resumable cursor and searchable history. |
| [Event Workspace Setup · 0.5.0](https://play.modiqo.ai/siiddhantt/event-workspace-setup@0.5.0) | A short terminal wizard discovers your defaults, prepares an event’s repository or useful links, and remembers your choices. |

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

```sh
rote play run https://play.modiqo.ai/siiddhantt/event-workspace-setup
```

Confirm discovered defaults once, then ask for `whatever is today`, a named
project, or an older meeting such as `OLake January 2026`. Use the arrow keys
when several results match.
Choose a local repo or clone one, approve dependency installation, and the Play
remembers the association. Events without a repo open useful links; interviews
can include a portfolio discovered from your public GitHub profile.

New machine: use the [install link](https://play.modiqo.ai/install?play=siiddhantt/event-workspace-setup@0.5.0).
Rote handles provider sign-in. Append `mode=setup` to change preferences or
`dry_run=true` to preview. [Package details](plays/event-workspace-setup/resources/README.md)
cover supported tools and agent use.

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
