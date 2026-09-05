#!/usr/bin/env -S rote play run
/**
 * @rote-frontmatter
 * ---
 * name: event-workspace-setup
 * description: Ask for today, an older meeting or a project by name. Finds Calendar events and local repositories, prepares their workspace or links, and remembers confirmed choices.
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
 *   version: 0.5.0
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
 *   description: Prepare an event, or revisit the short setup wizard.
 *   valid_values:
 *   - run
 *   - setup
 * - name: event
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: Optional request, such as whatever is today, Faff last month, or that galaxy ai project; otherwise ask in the terminal.
 * - name: project
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: Optional repository override inside your saved project folder.
 * - name: dry_run
 *   param_type: boolean
 *   required: false
 *   default: false
 *   description: Preview preparation without cloning, installing or opening apps.
 * - name: settings
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: Optional settings JSON for an agent or unattended setup; terminal users can leave this blank.
 * steps:
 *   configure:
 *     type: process.exec
 *     timeout_ms: 600000
 *     argv:
 *     - deno
 *     - run
 *     - --allow-all
 *     - '@resource{configure.ts}'
 *     - $mode
 *     - $settings
 *   auth_calendar:
 *     type: adapter.auth.ensure
 *     endpoint: adapter/calendar
 *     on_missing: authorize
 *     on_expired: refresh
 *     on_unreadable: reauthorize
 *   window:
 *     type: process.exec
 *     timeout_ms: 600000
 *     depends_on:
 *     - configure
 *     argv:
 *     - deno
 *     - run
 *     - --allow-all
 *     - '@resource{window.ts}'
 *     - $event
 *     - '@configure{.stdout.text}'
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
 *       calendarId: primary
 *       q: '@window{.stdout.text | fromjson | .search_text}'
 *       timeMin: '@window{.stdout.text | fromjson | .time_min}'
 *       timeMax: '@window{.stdout.text | fromjson | .time_max}'
 *       maxResults: '2500'
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
 *     timeout_ms: 600000
 *     depends_on:
 *     - configure
 *     - events
 *     - scan
 *     argv:
 *     - deno
 *     - run
 *     - --allow-all
 *     - '@resource{select.ts}'
 *     - '@configure{.stdout.text}'
 *     - '@events{.}'
 *     - '@scan{.stdout.text}'
 *     - '@window{.stdout.text | fromjson | .raw}'
 *     - $project
 *     - $dry_run
 *     - '@window{.stdout.text}'
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
 * presentation_fixtures:
 *   configure: resources/presentation-fixtures/configure/fixture.yaml
 *   window: resources/presentation-fixtures/window/fixture.yaml
 *   events: resources/presentation-fixtures/events/fixture.yaml
 *   scan: resources/presentation-fixtures/scan/fixture.yaml
 *   select: resources/presentation-fixtures/select/fixture.yaml
 *   launch: resources/presentation-fixtures/launch/fixture.yaml
 *   bootstrap: resources/presentation-fixtures/bootstrap/fixture.yaml
 * writes:
 * - Owner-private setup preferences and confirmed event-to-repository associations.
 * - Clones repositories you choose inside your confirmed project folder, and installs dependencies only after your approval; this can execute package lifecycle scripts.
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

const configuration = processJson(configureStep);
if (configuration?.status === "cancelled") {
  out.human("Cancelled. No workspace was opened.");
  out.result({ status: "cancelled" });
} else if (configuration?.status === "needs_setup") {
  out.human(String(configuration.message));
  out.result(configuration);
} else if (mode === "setup") {
  const configured = configuration;
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
  const remembered = selected.configuration_updated === true;
  const status = String(launched.status ?? selected.status ?? "unavailable");
  if (status === "ambiguous") {
    const choices = Array.isArray(selected.choices)
      ? selected.choices.length
      : 0;
    out.human(
      `Project match is ambiguous across ${choices} repositories; nothing was opened.`,
    );
  } else if (status === "cancelled") {
    out.human("Cancelled. No workspace was opened.");
  } else if (status === "needs_choice") {
    out.human("Several events match; choose an event by title or ID.");
  } else if (status === "no_event") {
    out.human(
      "No Calendar event or local repository matched. Try a shorter name or a date such as 2025-09-01.",
    );
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
  const preparation = selected.preparation as { reason?: string } | undefined;
  if (preparation?.reason) out.human(preparation.reason);
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
