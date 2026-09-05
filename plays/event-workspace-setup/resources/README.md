# Event Workspace Setup

Prepare a repository for any upcoming or ongoing Calendar event: an interview,
a planning meeting or a hackathon deadline. Clone it if missing, install its
dependencies, and open your editor and relevant HTTPS links.

Requires Rote 0.80.0+, Deno, Git and a desktop editor/browser. Authenticate Calendar:

```sh
rote registry adapter pull modiqo/calendar --yes
rote oauth setup google --adapter calendar --scopes calendar.events.readonly
```

If using the inbox Play too, use its Calendar authorization helper instead so
both read and owned-event write scopes are retained.

Create the approved parent directory, then configure a repository you trust:

```sh
play=https://play.modiqo.ai/siiddhantt/event-workspace-setup@0.2.2
rote play run "$play" mode=setup project_roots='["/home/me/projects"]' \
  project=/home/me/projects/project repository_url=https://github.com/you/project \
  install_dependencies=true editor=code browser=default
rote play run "$play" horizon_hours=168 project=/home/me/projects/project dry_run=true
rote play run "$play" horizon_hours=168 project=/home/me/projects/project remember=true
```

Add `event_id=CALENDAR_EVENT_ID` to target an event; otherwise the next eligible
event is selected. `remember=true` saves your explicit project choice for matching
future events. A preview does not clone, install, launch or save mappings.
Without a confident project match, event links can still open without a repo.

Automatic installation supports npm lockfiles, pnpm, declared Yarn versions,
uv, Deno, Cargo and Go. Other manifests need a trusted `setup_argv` JSON argument
array. For a missing repo, detection happens after cloning. Dependency setup may
run lifecycle scripts; email cannot authorize repositories or commands.

Existing files are preserved. Mismatched origins, ambiguous matches, incomplete
scans and failed installs stop preparation. Installations run again to respect
changed dependencies. Launch failures are reported. Settings live under your
user config directory (`EVENT_READY_WORKSPACE_CONFIG_DIR` can override it).
Rote traces may contain private Calendar data. Live verified on macOS; launch
adapters also support Linux, Windows and WSL.
