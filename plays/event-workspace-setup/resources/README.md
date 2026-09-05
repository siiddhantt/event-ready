# Event Workspace Setup

Choose a Calendar event. Prepare its project, or open its meeting, source email,
Calendar details and (for interviews) your portfolio.

```sh
rote play run https://play.modiqo.ai/siiddhantt/event-workspace-setup
```

New to Rote? Start with the
[install link](https://play.modiqo.ai/install?play=siiddhantt/event-workspace-setup@0.4.0).
The [official guide](https://www.modiqo.ai/docs/run-your-first-play) covers CLI
installation and sign-in. Rote prepares the Calendar adapter and asks you to
connect your own Google account. Credentials stay on your machine.

On first run, confirm the proposed project folder, installed editor and optional
public GitHub portfolio. Use arrow keys and Enter. Then pick an event by name.
You can choose a local repository, clone a GitHub repository, or open event
links. The Play remembers confirmed repository and dependency-install choices
for future matching events. No Calendar IDs, personal URLs or repo clone are
required to start. Missing information stays optional; the wizard lets you
correct its guesses.

Append `mode=setup` to revisit preferences, `event="interview"` to filter
events, or `dry_run=true` to preview without cloning, installing, opening apps
or saving repo associations. First-run setup still saves preferences you
confirm.

Requires Rote 0.80+, Deno, a desktop browser and an installed editor for repo
work. Git is needed for cloning; dependency tools must be installed. Automatic
setup supports npm, pnpm, declared Yarn versions, uv, Deno, Cargo and Go
lockfiles. Installation can run a repository's scripts, so it asks before
enabling it. Existing files are preserved; conflicting origins and failed
installs stop setup.

Preferences live in your user config directory, outside the Play package. An
agent without a terminal receives proposed defaults and can supply confirmed
`settings` JSON. `EVENT_READY_WORKSPACE_INTERACTIVE=0` disables prompts
explicitly. Rote traces may contain private Calendar data. The interactive flow
is verified on macOS and Linux; native Windows launch support is not an
end-to-end guarantee.
