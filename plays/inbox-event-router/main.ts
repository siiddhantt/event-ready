#!/usr/bin/env -S rote play run
/**
 * @rote-frontmatter
 * ---
 * name: inbox-event-router
 * description: Collects bounded new Gmail messages for mandatory agent classification, then safely upserts verified private Google Calendar events and reminders without duplicates.
 * provenance:
 *   author: siiddhantt
 * tags:
 * - typescript
 * - gmail
 * - google-calendar
 * - reminders
 * - event-triage
 * - effect-write
 * discoverability:
 *   tags:
 *   - typescript
 *   - gmail
 *   - google-calendar
 *   - reminders
 *   - event-triage
 *   - effect-write
 * metadata:
 *   rote_version: 0.80.0
 *   version: 0.2.0
 *   status: released
 *   kind: atomic
 *   flow_type: parallel
 *   execution_model: steps_with_presentation
 *   format: typescript
 *   requires_endpoints:
 *   - adapter/gmail
 *   - adapter/calendar
 *   requires_sessions: true
 *   mcp_servers:
 *     adapter/gmail:
 *       fingerprint: mcp_2kLwgdDQH7fxkyDYysCHsbCXLooH
 *       server_info:
 *         name: Gmail API
 *         version: discovery/v1
 *       capabilities:
 *         tools: true
 *         resources: false
 *         prompts: false
 *         logging: false
 *       tool_count: 79
 *       endpoint_name: adapter/gmail
 *       export_uri: https://gmail.googleapis.com/
 *       captured_at: 2026-09-04T06:01:50Z
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
 *     adapter/gmail: modiqo/gmail
 *     adapter/calendar: modiqo/calendar
 *   adapter_credentials:
 *     adapter/gmail:
 *       protocol: google_discovery
 *       credential_names:
 *       - GMAIL_TOKEN
 *       scopes:
 *       - https://www.googleapis.com/auth/gmail.readonly
 *       preflight_step: auth_gmail
 *     adapter/calendar:
 *       protocol: google_discovery
 *       credential_names:
 *       - CALENDAR_TOKEN
 *       scopes:
 *       - https://www.googleapis.com/auth/calendar.events.owned
 *       preflight_step: auth_calendar
 *   discoverability:
 *     tags:
 *     - typescript
 *     - gmail
 *     - google-calendar
 *     - reminders
 *     - event-triage
 *     - effect-write
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
 *   default: collect
 *   description: Collect new email evidence for an agent, or apply one complete agent decision envelope.
 *   valid_values:
 *   - collect
 *   - apply
 * - name: calendar_id
 *   param_type: string
 *   required: false
 *   default: primary
 *   description: Google Calendar ID selected during setup.
 * - name: lookback_days
 *   param_type: integer
 *   required: false
 *   default: 7
 *   description: First-run Gmail lookback from 1 to 30 days; later runs use the local cursor.
 * - name: decisions_json
 *   param_type: string
 *   required: false
 *   default: ''
 *   description: Schema-v1 agent decision envelope or @file:/absolute/path, required in apply mode.
 * - name: batch_size
 *   param_type: integer
 *   required: false
 *   default: 25
 *   description: Messages per resumable page, from 1 to 100.
 * steps:
 *   prepare:
 *     type: process.exec
 *     depends_on:
 *     - mailbox
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - '@resource{prepare.ts}'
 *     - $mode
 *     - $calendar_id
 *     - $lookback_days
 *     - $batch_size
 *     - '@mailbox{.emailAddress}'
 *   auth_gmail:
 *     type: adapter.auth.ensure
 *     endpoint: adapter/gmail
 *     on_missing: authorize
 *     on_expired: refresh
 *     on_unreadable: reauthorize
 *   auth_calendar:
 *     type: adapter.auth.ensure
 *     endpoint: adapter/calendar
 *     on_missing: authorize
 *     on_expired: refresh
 *     on_unreadable: reauthorize
 *   mailbox:
 *     endpoint: adapter/gmail
 *     method: gmail.users.getProfile
 *     depends_on:
 *     - auth_gmail
 *     params:
 *       userId: me
 *   list_messages:
 *     endpoint: adapter/gmail
 *     method: gmail.users.messages.list
 *     depends_on:
 *     - prepare
 *     - auth_gmail
 *     params:
 *       userId: me
 *       q: '@prepare{.stdout.text | fromjson | .query}'
 *       maxResults: '@prepare{.stdout.text | fromjson | .batch_size}'
 *       pageToken: '@prepare{.stdout.text | fromjson | .page_token}'
 *     execution:
 *       mode: deferred
 *       condition:
 *         all:
 *         - compare:
 *             left:
 *               step: prepare
 *               path: $.stdout.text | fromjson | .mode
 *             op: eq
 *             right: collect
 *         - compare:
 *             left:
 *               step: prepare
 *               path: $.stdout.text | fromjson | .needs_listing
 *             op: eq
 *             right: true
 *   save_pending:
 *     type: process.exec
 *     depends_on:
 *     - list_messages
 *     - prepare
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - --allow-write
 *     - '@resource{save-pending.ts}'
 *     - '@list_messages{.}'
 *     - '@prepare{.stdout.text}'
 *   details_new:
 *     endpoint: adapter/gmail
 *     method: gmail.users.messages.get
 *     depends_on:
 *     - save_pending
 *     for_each: $.stdout.text | fromjson | .message_ids
 *     max_concurrency: 8
 *     params:
 *       userId: me
 *       id: $item
 *       format: full
 *   details_pending:
 *     endpoint: adapter/gmail
 *     method: gmail.users.messages.get
 *     depends_on:
 *     - prepare
 *     - auth_gmail
 *     for_each_source: prepare
 *     for_each: $.stdout.text | fromjson | .pending.message_ids
 *     max_concurrency: 8
 *     params:
 *       userId: me
 *       id: $item
 *       format: full
 *     execution:
 *       mode: deferred
 *       condition:
 *         all:
 *         - compare:
 *             left:
 *               step: prepare
 *               path: $.stdout.text | fromjson | .mode
 *             op: eq
 *             right: collect
 *         - compare:
 *             left:
 *               step: prepare
 *               path: $.stdout.text | fromjson | .needs_listing
 *             op: eq
 *             right: false
 *   calendar_snapshot:
 *     endpoint: adapter/calendar
 *     method: calendar.events.list
 *     depends_on:
 *     - prepare
 *     - auth_calendar
 *     params:
 *       calendarId: $calendar_id
 *       timeMin: '@prepare{.stdout.text | fromjson | .calendar_min}'
 *       timeMax: '@prepare{.stdout.text | fromjson | .calendar_max}'
 *       maxResults: '2500'
 *       singleEvents: 'true'
 *       showDeleted: 'true'
 *       orderBy: startTime
 *     execution:
 *       mode: deferred
 *       condition:
 *         compare:
 *           left:
 *             step: prepare
 *             path: $.stdout.text | fromjson | .mode
 *           op: eq
 *           right: collect
 *   validate_decisions:
 *     type: process.exec
 *     depends_on:
 *     - prepare
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - '@resource{validate-decisions.ts}'
 *     - $decisions_json
 *     - $calendar_id
 *     execution:
 *       mode: deferred
 *       condition:
 *         compare:
 *           left:
 *             step: prepare
 *             path: $.stdout.text | fromjson | .mode
 *           op: eq
 *           right: apply
 *   lookup_owned:
 *     endpoint: adapter/calendar
 *     method: calendar.events.list
 *     depends_on:
 *     - validate_decisions
 *     - auth_calendar
 *     for_each_source: validate_decisions
 *     for_each: $.stdout.text | fromjson | .event_decisions
 *     max_concurrency: 6
 *     params:
 *       calendarId: $calendar_id
 *       privateExtendedProperty: eventReadyKey=$event_key
 *       maxResults: '2'
 *       showDeleted: 'true'
 *   lookup_nearby:
 *     endpoint: adapter/calendar
 *     method: calendar.events.list
 *     depends_on:
 *     - validate_decisions
 *     - auth_calendar
 *     for_each_source: validate_decisions
 *     for_each: $.stdout.text | fromjson | .event_decisions
 *     max_concurrency: 6
 *     params:
 *       calendarId: $calendar_id
 *       timeMin: $window_min
 *       timeMax: $window_max
 *       maxResults: '2500'
 *       singleEvents: 'true'
 *       showDeleted: 'false'
 *   plan_operations:
 *     type: process.exec
 *     depends_on:
 *     - validate_decisions
 *     - lookup_owned
 *     - lookup_nearby
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - '@resource{plan-operations.ts}'
 *     - '@validate_decisions{.stdout.text}'
 *     - '@lookup_owned{.}'
 *     - '@lookup_nearby{.}'
 *   insert_events:
 *     endpoint: adapter/calendar
 *     method: calendar.events.insert
 *     depends_on:
 *     - plan_operations
 *     for_each: $.stdout.text | fromjson | .inserts | map(.request_body)
 *     max_concurrency: 4
 *     params:
 *       calendarId: $calendar_id
 *       sendUpdates: none
 *       __requestBody__: $item
 *   patch_events:
 *     endpoint: adapter/calendar
 *     method: calendar.events.patch
 *     depends_on:
 *     - plan_operations
 *     for_each: $.stdout.text | fromjson | .patches | map(.request_body)
 *     max_concurrency: 4
 *     params:
 *       calendarId: $calendar_id
 *       eventId: $id
 *       sendUpdates: none
 *       __requestBody__: $item
 *   commit:
 *     type: process.exec
 *     depends_on:
 *     - plan_operations
 *     - insert_events
 *     - patch_events
 *     argv:
 *     - deno
 *     - run
 *     - --allow-env
 *     - --allow-read
 *     - --allow-write
 *     - '@resource{commit.ts}'
 *     - '@plan_operations{.stdout.text}'
 *     - '@insert_events{.}'
 *     - '@patch_events{.}'
 * presentation_fixtures:
 *   mailbox: resources/presentation-fixtures/mailbox/fixture.yaml
 *   prepare: resources/presentation-fixtures/prepare/fixture.yaml
 *   list_messages: resources/presentation-fixtures/list_messages/fixture.yaml
 *   save_pending: resources/presentation-fixtures/save_pending/fixture.yaml
 *   details_new: resources/presentation-fixtures/details_new/fixture.yaml
 *   details_pending: resources/presentation-fixtures/details_pending/fixture.yaml
 *   calendar_snapshot: resources/presentation-fixtures/calendar_snapshot/fixture.yaml
 *   validate_decisions: resources/presentation-fixtures/validate_decisions/fixture.yaml
 *   lookup_owned: resources/presentation-fixtures/lookup_owned/fixture.yaml
 *   lookup_nearby: resources/presentation-fixtures/lookup_nearby/fixture.yaml
 *   plan_operations: resources/presentation-fixtures/plan_operations/fixture.yaml
 *   insert_events: resources/presentation-fixtures/insert_events/fixture.yaml
 *   patch_events: resources/presentation-fixtures/patch_events/fixture.yaml
 *   commit: resources/presentation-fixtures/commit/fixture.yaml
 * write_permissions:
 * - tool: calendar.events.insert
 *   adapter: calendar
 *   mode: audit
 * - tool: calendar.events.patch
 *   adapter: calendar
 *   mode: audit
 * writes:
 * - Owner-private cursor, pending-batch metadata, and audit receipts under the user state directory.
 * - Private events in the selected Google Calendar; no guests, messages, RSVPs, registrations, or deletes.
 * source: https://github.com/siiddhantt/event-ready/tree/harden-event-ready/plays/inbox-event-router
 * ---
 */

import { decisionContract } from "./lib/contract.ts";
import { normalizeCalendarEvents, normalizeMessage } from "./lib/mail.ts";

const { FlowOutput, loadPresentationContext, stepName } = await import(
  "__ROTE_PRESENTATION_SDK__"
);
const out = new FlowOutput();
const ctx = await loadPresentationContext();
const mode = ctx.params.mode;
if (mode !== "collect" && mode !== "apply") {
  throw new Error("mode must be collect or apply");
}

const prepareStep = ctx.step(stepName("prepare"));
const savePendingStep = ctx.step(stepName("save_pending"));
const detailsNewStep = ctx.step(stepName("details_new"));
const detailsPendingStep = ctx.step(stepName("details_pending"));
const calendarSnapshotStep = ctx.step(stepName("calendar_snapshot"));
const validateDecisionsStep = ctx.step(stepName("validate_decisions"));
const commitStep = ctx.step(stepName("commit"));

function completedBody(step: typeof prepareStep): unknown | null {
  return step.outcome.status === "completed" ||
      step.outcome.status === "restored"
    ? step.outcome.output.body
    : null;
}

function processJson(step: typeof prepareStep): Record<string, unknown> | null {
  const body = completedBody(step) as { stdout?: { text?: unknown } } | null;
  const raw = body?.stdout?.text;
  return typeof raw === "string"
    ? JSON.parse(raw) as Record<string, unknown>
    : null;
}

if (mode === "collect") {
  const prepared = processJson(prepareStep);
  if (!prepared) throw new Error("Collection preparation was unavailable");
  const saved = processJson(savePendingStep);
  const pending = (saved?.status === "pending" ? saved : prepared.pending) as
    | Record<string, unknown>
    | null;
  const detailBody = completedBody(
    saved?.status === "pending" ? detailsNewStep : detailsPendingStep,
  );
  const details = Array.isArray(detailBody)
    ? detailBody
    : detailBody
    ? [detailBody]
    : [];
  const messages = details.flatMap((item) => {
    const normalized = normalizeMessage(item);
    return normalized ? [normalized] : [];
  });
  const calendar = completedBody(calendarSnapshotStep) as
    | { items?: unknown; nextPageToken?: unknown; error?: unknown }
    | null;
  const existingEvents = normalizeCalendarEvents(calendar?.items);
  const expected = Array.isArray(pending?.message_ids)
    ? pending.message_ids
    : [];
  const complete = !pending || (messages.length === expected.length &&
    expected.every((id) =>
      messages.some((message) => message.message_id === id)
    ));
  if (!complete || !calendar || calendar.error) {
    throw new Error(
      "Collection evidence is incomplete; pending batch retained for retry",
    );
  }
  const status = saved?.status === "page_complete"
    ? "page_complete"
    : saved?.status === "idle"
    ? "idle"
    : pending
    ? "needs_agent_decision"
    : "unavailable";
  const result = {
    status,
    run_token: typeof pending?.token === "string" ? pending.token : null,
    messages,
    existing_events: existingEvents,
    calendar_snapshot_complete: !calendar.nextPageToken,
    collected_at: prepared.collected_at,
    decision_contract: decisionContract(
      typeof pending?.token === "string" ? pending.token : null,
    ),
  };
  out.human(
    status === "idle"
      ? "No new Gmail messages need review."
      : `${messages.length} messages require agent classification; no Calendar writes occurred.`,
  );
  out.summary(
    status === "idle"
      ? "Inbox event router: idle"
      : `Inbox event router: ${messages.length} messages awaiting agent decisions`,
  );
  out.result(result);
} else {
  const receipt = processJson(commitStep);
  if (!receipt) {
    const rejected = validateDecisionsStep.outcome.status === "failed";
    const detail = rejected
      ? validateDecisionsStep.outcome.output.message
      : "Apply did not reach its commit step; inspect the run before retrying.";
    out.human(
      rejected
        ? `Agent decisions were rejected: ${detail}\nNo Calendar writes occurred.`
        : detail,
    );
    out.summary(rejected ? `Inbox event router: rejected — ${detail}` : detail);
    out.result({
      status: rejected ? "rejected" : "incomplete",
      stage: rejected ? "validate_decisions" : "apply",
      detail,
      calendar_writes: rejected ? 0 : "unknown",
    });
    Deno.exit(0);
  }
  out.human(
    `Applied ${receipt.processed ?? 0} decisions: ${
      receipt.inserted ?? 0
    } created, ${receipt.updated ?? 0} updated.`,
  );
  out.summary(
    `Inbox event router: ${receipt.inserted ?? 0} created, ${
      receipt.updated ?? 0
    } updated`,
  );
  out.result(receipt);
}
