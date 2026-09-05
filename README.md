# Event Ready

Turn event email into private Calendar entries and reminders, then prepare the
right repository when it is time to work. Two inspectable Rote Plays, with a
Codex runner for an always-on Raspberry Pi.

The fresh-clone workspace flow passed live on macOS. The Pi recovered a failed
Calendar authorization attempt, processed 25 emails with one insert and one
update, then caught up with 41 further messages. A repeat run was idle; Calendar
lookups confirmed one record per event. Its 15-minute systemd timer is enabled.
See the complete [verification ledger](docs/verification.md).

Public Community submissions, each pinned to v0.2.0:

- [Inbox Event Router](https://play.modiqo.ai/siiddhantt/inbox-event-router@0.2.0)
- [Event Workspace Setup](https://play.modiqo.ai/siiddhantt/event-workspace-setup@0.2.0)

Both exact public URIs were installed and run through Rote after publication.
Inspect their contracts and complete account/project setup before running them
with your own data. Setup instructions travel inside each package's
`resources/README.md`.

| Play | What it does |
| --- | --- |
| `inbox-event-router` | Collects resumable pages of new Gmail messages, asks an agent to review every message, validates the decisions, and creates or updates private Calendar events. |
| `event-workspace-setup` | Selects an upcoming or ongoing event, finds its repository inside approved roots, clones an explicitly configured missing repository, installs its dependencies, and opens the editor and event links. |

## Start locally

Install [Rote](https://www.modiqo.ai/blog/the-playoffs), sign in, and install Deno.
Put both `rote` and `deno` on your PATH. The setup Play also requires Git and your
chosen editor/browser. The scheduled classifier requires Python 3.10+ and Codex.

```sh
rote login --provider github
rote deno install
export PATH="$HOME/.local/bin:$HOME/.rote/bin:$PATH"
rote registry adapter pull modiqo/gmail --yes
rote registry adapter pull modiqo/calendar --yes
rote oauth setup google --adapter gmail --scopes gmail.readonly
```

Authorize Calendar with `calendar.events.owned` for the router and
`calendar.events.readonly` for the workspace reader. **Rote 0.80.0 silently omits
the owned scope from its Google setup shorthand.** Follow the tested setup notes
in [Raspberry Pi setup](docs/raspberry-pi.md); a successful read alone does not
prove that Calendar writes are authorized.

## Run the inbox Play

```sh
rote play run ./plays/inbox-event-router/main.ts mode=collect calendar_id=primary lookback_days=7 batch_size=25 --output=json
rote play run ./plays/inbox-event-router/main.ts mode=apply calendar_id=primary decisions_json=@file:/absolute/path/decisions.json --output=json
```

`collect` returns evidence and the decision contract. It makes no Calendar writes.
An agent must return one decision for **every** message: `ignore`, `upsert`, or
`upsert_many` for several explicit milestones in one email. `apply` validates
coverage, Gmail thread identity, explicit timezones, confidence, duplicate
lookups and confirmed write results before committing the cursor.

The scheduled runner completes both calls:

```sh
codex login
python3 scripts/run_inbox.py --batch-size 25 --max-batches 4
```

The runner uses your authenticated Codex account and its default model. An
optional `--model` overrides it. Codex receives the email evidence to classify;
its shell tools, web search and multi-agent tools are disabled. It cannot write
to Calendar directly. The Play owns the writes.

Pagination freezes a query window until every page completes. Failed calls keep
the pending batch; retrying rechecks Calendar and uses deterministic event IDs.
State is bound to the Gmail account and Calendar. Use a separate
`EVENT_READY_STATE_DIR` for another account or Calendar.

## Prepare an event workspace

Configure only repositories and setup commands you trust. Installing dependencies
can execute package lifecycle scripts. These settings come from you, not email.

```sh
rote play run ./plays/event-workspace-setup/main.ts mode=setup \
  project_roots='["/home/me/projects"]' editor=code browser=default \
  repository_url=https://github.com/you/project \
  project=/home/me/projects/project install_dependencies=true

rote play run ./plays/event-workspace-setup/main.ts mode=run \
  horizon_hours=168 project=/home/me/projects/project dry_run=true --output=json

rote play run ./plays/event-workspace-setup/main.ts mode=run \
  horizon_hours=168 project=/home/me/projects/project remember=true --output=json
```

The destination's parent must exist. Existing files are preserved. A different
Git origin, an ambiguous repository match, an incomplete scan or a failed setup
stops preparation. Dry-run previews writes and launches without performing them.
For a missing clone, automatic dependency detection happens after cloning; an
explicit `setup_argv` makes the install command visible even before the clone.

Automatic installation supports npm lockfiles, pnpm, Yarn with a declared
`packageManager`, uv, Deno, Cargo and Go. A package manifest without a supported
lockfile needs an explicit command, for example
`setup_argv='["python3","-m","venv",".venv"]'`. This is an argument array,
not an implicit shell script. Installation runs again on subsequent workspace
preparation so a changed lockfile is not missed.

Editor/browser launch adapters cover macOS, Linux, Windows and WSL; this revision
has been tested on macOS and Linux. Run the workspace Play on your desktop, where
the editor and browser are available. The Pi runs the inbox Play.

## Verify and demonstrate

```sh
deno task check
deno task test
python3 -m unittest discover -s tests -v
rote play validate ./plays/inbox-event-router/main.ts
rote play validate ./plays/event-workspace-setup/main.ts
rote play lint ./plays/inbox-event-router/main.ts
rote play lint ./plays/event-workspace-setup/main.ts
python3 scripts/check_classifier.py
```

The last command uses real Codex against synthetic emails and checks exact
milestones, missing evidence, and an embedded instruction attack. It never calls
Gmail or Calendar. See the [demo script](docs/demo.md),
[Pi operations](docs/raspberry-pi.md), and [hackathon comparison](docs/hackathon.md).

## Data and practical limits

Event Ready keeps owner-private cursor, pending IDs, account identity and audit
receipts. The wrapper uses temporary classification files and ephemeral Codex
sessions. **Rote itself retains local execution traces, which can contain email
bodies and event data.** Keep its workspace directory private and out of Git and
demos. Email evidence is sent to the authenticated AI provider for classification.

The Plays never add guests, send email, RSVP, register you, or delete Calendar
events. Uncertain evidence is ignored with an audit reason. Deleted owned events
stay deleted; explicit cancellations keep a labelled record with no reminders.
Older source timestamps cannot revert a newer recorded update.

Calendar popup delivery depends on your phone's Calendar sync and notification
settings. Date-only deadlines have all-day reminders; a date-only deadline first
found after that day's midnight cannot acquire an already-past alert. Inspect
same-day deadline changes promptly. Timed deadlines without duration use a
clearly labelled one-minute marker at the exact due time.

This is a bounded polling cursor, not Gmail history sync: a five-minute overlap
covers ordinary arrival/indexing races, but unusually late imported or indexed
mail outside the window needs a separate lookback scan. Attachments are flagged
as unavailable; ambiguous or attachment-only dates require review. An AI
confidence score is not a guarantee of factual correctness.
