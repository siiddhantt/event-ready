#!/usr/bin/env -S rote play run
/**
 * @rote-frontmatter
 * ---
 * name: event-workspace-setup
 * description: Selects an upcoming Calendar event, clones an explicitly configured missing repository, installs its locked dependencies, and opens the correct editor and event links inside approved roots.
 * provenance:
 *   author: siiddhantt
 * tags:
 * - typescript
 * - google-calendar
 * - workspace
 * - editor
 * - meetings
 * - effect-local-write
 * discoverability:
 *   tags:
 *   - typescript
 *   - google-calendar
 *   - workspace
 *   - editor
 *   - meetings
 *   - effect-local-write
 * metadata:
 *   rote_version: 0.80.0
 *   version: 0.2.2
 *   status: released
 *   kind: atomic
 *   flow_type: parallel
 *   execution_model: steps_with_presentation
 *   format: typescript
 *   requires_endpoints:
 *   - adapter/calendar
 *   requires_sessions: true
 *   mcp_servers:
 *     adapter/calendar:
 *       fingerprint: mcp_39UEoxu3DX9zayEgtzXN8HtJxnxy
 *       server_info:
 *         name: Calendar API
 *         version: discovery/v1
 *       capabilities:
 *         tools: true
 *         resources: false
 *         prompts: false
 *         logging: false
 *       tool_count: 37
 *       endpoint_name: adapter/calendar
 *       export_uri: https://www.googleapis.com/calendar/v3/
 *       captured_at: 2026-09-04T06:01:50Z
 *   adapter_sources:
 *     adapter/calendar: modiqo/calendar
 *   adapter_credentials:
 *     adapter/calendar:
 *       protocol: google_discovery
 *       credential_names:
 *       - CALENDAR_TOKEN
 *       scopes:
 *       - https://www.googleapis.com/auth/calendar.events.readonly
 *       preflight_step: auth_calendar
 *   discoverability:
 *     tags:
 *     - typescript
 *     - google-calendar
 *     - workspace
 *     - editor
 *     - meetings
 *     - effect-local-write
 *   contract:
 *     atomic: true
 *     input:
 *       type: none
 *     output:
 *       format: json
 *       destination: stdout
 *     composable: true
 * parameters:
 * - name: mode
 *   param_type: string
 *   required: false
 *   default: run
 *   description: Save one-time configuration or prepare the next event workspace.
 *   valid_values:
 *   - setup
 *   - run
 * - name: project_roots
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: JSON array of approved project root directories, required only for setup.
 * - name: editor
 *   param_type: string
 *   required: false
 *   default: code
 *   description: Editor selected during setup.
 *   valid_values:
 *   - code
 *   - cursor
 *   - zed
 *   - custom
 * - name: editor_command
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: User-selected executable name or absolute path when editor is custom.
 * - name: browser
 *   param_type: string
 *   required: false
 *   default: default
 *   description: External browser selected during setup.
 *   valid_values:
 *   - default
 *   - chrome
 *   - edge
 *   - firefox
 *   - safari
 * - name: calendar_id
 *   param_type: string
 *   required: false
 *   default: primary
 *   description: Google Calendar ID to read.
 * - name: horizon_hours
 *   param_type: integer
 *   required: false
 *   default: 24
 *   description: Upcoming event window from 1 to 168 hours.
 * - name: event_id
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: Optional exact Calendar event ID.
 * - name: project
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: Optional exact repository path inside an approved root.
 * - name: remember
 *   param_type: boolean
 *   required: false
 *   default: false
 *   description: Remember the explicit project override for this event's company or title.
 * - name: dry_run
 *   param_type: boolean
 *   required: false
 *   default: false
 *   description: Preview the exact app and link launches without opening anything.
 * - name: repository_url
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: GitHub HTTPS repository URL explicitly authorized during setup; never taken from email.
 * - name: install_dependencies
 *   param_type: boolean
 *   required: false
 *   default: false
 *   description: During setup, authorize dependency installation for the configured repository.
 * - name: setup_argv
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: Optional JSON array of a trusted dependency setup command and arguments; otherwise use a supported lockfile.
 * steps:
 *   configure:
 *     type: process.exec
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - --allow-write
 *     - '@resource{configure.ts}'
 *     - $mode
 *     - $project_roots
 *     - $editor
 *     - $browser
 *     - $editor_command
 *     - $repository_url
 *     - $project
 *     - $install_dependencies
 *     - $setup_argv
 *   auth_calendar:
 *     type: adapter.auth.ensure
 *     endpoint: adapter/calendar
 *     on_missing: authorize
 *     on_expired: refresh
 *     on_unreadable: reauthorize
 *   window:
 *     type: process.exec
 *     argv:
 *     - deno
 *     - run
 *     - '@resource{window.ts}'
 *     - $horizon_hours
 *     execution:
 *       mode: deferred
 *       condition:
 *         compare:
 *           left:
 *             param: mode
 *           op: eq
 *           right: run
 *   events:
 *     endpoint: adapter/calendar
 *     method: calendar.events.list
 *     depends_on:
 *     - auth_calendar
 *     - window
 *     params:
 *       calendarId: $calendar_id
 *       timeMin: '@window{.stdout.text | fromjson | .time_min}'
 *       timeMax: '@window{.stdout.text | fromjson | .time_max}'
 *       maxResults: '100'
 *       singleEvents: 'true'
 *       showDeleted: 'false'
 *       orderBy: startTime
 *     execution:
 *       mode: deferred
 *       condition:
 *         compare:
 *           left:
 *             param: mode
 *           op: eq
 *           right: run
 *   scan:
 *     type: process.exec
 *     depends_on:
 *     - configure
 *     argv:
 *     - deno
 *     - run
 *     - --allow-read
 *     - '@resource{scan.ts}'
 *     - '@configure{.stdout.text}'
 *     execution:
 *       mode: deferred
 *       condition:
 *         compare:
 *           left:
 *             param: mode
 *           op: eq
 *           right: run
 *   select:
 *     type: process.exec
 *     depends_on:
 *     - configure
 *     - events
 *     - scan
 *     argv:
 *     - deno
 *     - run
 *     - --allow-read
 *     - '@resource{select.ts}'
 *     - '@configure{.stdout.text}'
 *     - '@events{.}'
 *     - '@scan{.stdout.text}'
 *     - $event_id
 *     - $project
 *     - $remember
 *     execution:
 *       mode: deferred
 *       condition:
 *         compare:
 *           left:
 *             param: mode
 *           op: eq
 *           right: run
 *   bootstrap:
 *     type: process.exec
 *     timeout_ms: 900000
 *     depends_on:
 *     - configure
 *     - select
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - --allow-run
 *     - '@resource{bootstrap.ts}'
 *     - '@configure{.stdout.text}'
 *     - '@select{.stdout.text}'
 *     - $dry_run
 *     execution:
 *       mode: deferred
 *       condition:
 *         compare:
 *           left:
 *             param: mode
 *           op: eq
 *           right: run
 *   launch:
 *     type: process.exec
 *     depends_on:
 *     - configure
 *     - select
 *     - bootstrap
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - --allow-run
 *     - '@resource{launch.ts}'
 *     - '@configure{.stdout.text}'
 *     - '@select{.stdout.text}'
 *     - $dry_run
 *     execution:
 *       mode: deferred
 *       condition:
 *         compare:
 *           left:
 *             param: mode
 *           op: eq
 *           right: run
 *   remember_mapping:
 *     type: process.exec
 *     depends_on:
 *     - select
 *     - launch
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - --allow-write
 *     - '@resource{remember.ts}'
 *     - '@select{.stdout.text}'
 *     - $project
 *     execution:
 *       mode: deferred
 *       condition:
 *         all:
 *         - compare:
 *             left:
 *               param: mode
 *             op: eq
 *             right: run
 *         - compare:
 *             left:
 *               param: remember
 *             op: eq
 *             right: true
 *         - compare:
 *             left:
 *               param: dry_run
 *             op: eq
 *             right: false
 * presentation_fixtures:
 *   configure: resources/presentation-fixtures/configure/fixture.yaml
 *   window: resources/presentation-fixtures/window/fixture.yaml
 *   events: resources/presentation-fixtures/events/fixture.yaml
 *   scan: resources/presentation-fixtures/scan/fixture.yaml
 *   select: resources/presentation-fixtures/select/fixture.yaml
 *   launch: resources/presentation-fixtures/launch/fixture.yaml
 *   bootstrap: resources/presentation-fixtures/bootstrap/fixture.yaml
 *   remember_mapping: resources/presentation-fixtures/remember_mapping/fixture.yaml
 * writes:
 * - Owner-private editor, browser, approved-root, and explicit project-mapping configuration.
 * - Clones only explicitly configured repositories inside approved roots and runs their authorized dependency install commands, which may execute package lifecycle scripts.
 * - Opens apps and HTTPS links; never joins meetings or submits forms.
 * source: https://github.com/siiddhantt/event-ready/tree/main/plays/event-workspace-setup
 * ---
 */

const { FlowOutput, loadPresentationContext, stepName } = await import(
  "__ROTE_PRESENTATION_SDK__"
);
const out = new FlowOutput();
const ctx = await loadPresentationContext();
const mode = ctx.params.mode;
if (mode !== "setup" && mode !== "run") {
  throw new Error("mode must be setup or run");
}

const configureStep = ctx.step(stepName("configure"));
const selectStep = ctx.step(stepName("select"));
const launchStep = ctx.step(stepName("launch"));
const bootstrapStep = ctx.step(stepName("bootstrap"));
const rememberMappingStep = ctx.step(stepName("remember_mapping"));

function processJson(
  step: typeof configureStep,
): Record<string, unknown> | null {
  if (
    step.outcome.status !== "completed" && step.outcome.status !== "restored"
  ) return null;
  const body = step.outcome.output.body as { stdout?: { text?: unknown } };
  return typeof body.stdout?.text === "string"
    ? JSON.parse(body.stdout.text) as Record<string, unknown>
    : null;
}

if (mode === "setup") {
  const configured = processJson(configureStep);
  if (!configured) throw new Error("Setup receipt was unavailable");
  const config = configured.config as Record<string, unknown> | undefined;
  const roots = Array.isArray(config?.roots) ? config.roots.length : 0;
  out.human(`Saved ${roots} approved project root${roots === 1 ? "" : "s"}.`);
  out.summary(
    `Event workspace configured with ${roots} project root${
      roots === 1 ? "" : "s"
    }`,
  );
  out.result(configured);
} else {
  const selected = processJson(selectStep);
  const launched = processJson(launchStep);
  if (!selected || !launched) {
    throw new Error("Workspace preparation receipt was unavailable");
  }
  const remembered = processJson(rememberMappingStep);
  const status = String(launched.status ?? selected.status ?? "unavailable");
  if (status === "ambiguous") {
    const choices = Array.isArray(selected.choices)
      ? selected.choices.length
      : 0;
    out.human(
      `Project match is ambiguous across ${choices} repositories; nothing was opened.`,
    );
  } else if (status === "no_event") {
    out.human("No upcoming Calendar event matched the request.");
  } else if (status === "launch_failed") {
    out.human("The event was selected, but no configured app could be opened.");
  } else if (status === "nothing_to_open") {
    out.human("The event was selected, but it has no safe workspace target.");
  } else if (status === "preview") {
    const commands = Array.isArray(launched.commands)
      ? launched.commands.length
      : 0;
    out.human(
      `Previewed ${commands} app or link launches; nothing was opened.`,
    );
  } else if (status === "partial") {
    const opened = Array.isArray(launched.opened) ? launched.opened.length : 0;
    out.human(
      `Prepared part of the event workspace; ${opened} launches succeeded.`,
    );
  } else {
    const opened = Array.isArray(launched.opened) ? launched.opened.length : 0;
    out.human(
      `Prepared the event workspace with ${opened} app or link launches.`,
    );
  }
  out.summary(`Event workspace: ${status}`);
  out.result({
    setup: processJson(bootstrapStep),
    status,
    plan: selected,
    opened: launched.opened ?? [],
    failures: launched.failures ?? [],
    commands: launched.commands ?? [],
    remembered,
  });
}
