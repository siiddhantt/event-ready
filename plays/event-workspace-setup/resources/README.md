# Event Workspace Setup

Prepare the repository for an upcoming or ongoing Calendar event. The Play can
clone a missing repository you configured, install its dependencies, and open
your editor and relevant HTTPS event links. An existing repository is reused.

Requirements: Rote 0.80.0, Deno, Git, a desktop editor/browser and Google
Calendar read access. Install the package's declared Calendar adapter and
complete Google consent. Run this on the desktop where you want applications to
open.

## Configure a trusted repository

Create the approved parent directory first. Replace the example paths and URL:

```sh
rote play run ./main.ts mode=setup \
  project_roots='["/home/me/projects"]' editor=code browser=default \
  repository_url=https://github.com/you/project \
  project=/home/me/projects/project install_dependencies=true

rote play run ./main.ts mode=run horizon_hours=168 \
  project=/home/me/projects/project dry_run=true --output=json

rote play run ./main.ts mode=run horizon_hours=168 \
  project=/home/me/projects/project remember=true --output=json
```

Preview reports planned clone/setup commands and application launches. Missing
repository dependency detection takes place after cloning; configure an explicit
`setup_argv` JSON argument array to preview the exact setup command before
clone. The actual run stops on a clone or install failure and reports launch
failures. No matching event returns an idle result; `event_id` selects a
particular event.

Automatic installers cover npm, pnpm, declared Yarn versions, uv, Deno, Cargo
and Go. Unsupported manifests need an explicit trusted command. Installing
dependencies may run package lifecycle scripts. Only the user's saved setup
configuration can authorize a repository or command; an email cannot do so.

The Play preserves existing files, rejects a mismatched Git origin, stays inside
approved roots and refuses ambiguous automatic matches. `remember=true` needs an
explicit project choice; a preview never saves a mapping. Installation runs
again on subsequent preparations so changes to dependencies are not missed.

Settings are stored under the user's config directory, or
`EVENT_READY_WORKSPACE_CONFIG_DIR` when set. Rote execution traces can contain
private Calendar information; keep them out of Git and demos.

Tested with a fresh macOS clone, Deno dependency caching, VS Code and browser
launches, then a second preview that reused the clone. Platform launch adapters
also cover Linux, Windows and WSL; this revision has not had live Windows/WSL
QA.

[Source and full instructions](https://github.com/siiddhantt/event-ready/tree/harden-event-ready)
·
[Verification ledger](https://github.com/siiddhantt/event-ready/blob/harden-event-ready/docs/verification.md)
