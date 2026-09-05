import {
  eventDecisions as expandEvents,
  parseEnvelope,
} from "./lib/decisions.ts";
import { readState } from "./lib/state.ts";

const [decisionsRaw = "", calendarId = "primary"] = Deno.args;
if (!decisionsRaw) throw new Error("decisions_json is required in apply mode");
const raw = decisionsRaw.startsWith("@file:")
  ? await Deno.readTextFile(decisionsRaw.slice(6))
  : decisionsRaw;
const envelope = parseEnvelope(JSON.parse(raw));
const state = await readState();
if (state.calendar_id && state.calendar_id !== calendarId) {
  throw new Error("Calendar differs from the collected batch");
}
if (!state.pending) {
  throw new Error("No pending inbox batch exists; run collect first");
}
if (envelope.run_token !== state.pending.token) {
  throw new Error("run_token does not match the pending inbox batch");
}
const expected = [...state.pending.message_ids].sort();
const received = envelope.decisions.map((decision) => decision.message_id)
  .sort();
if (JSON.stringify(expected) !== JSON.stringify(received)) {
  throw new Error("decisions must cover every pending message exactly once");
}
const eventDecisions = expandEvents(envelope.decisions);
for (const decision of eventDecisions) {
  if (
    state.pending.thread_ids[decision.message_id] !== decision.source_thread_id
  ) {
    throw new Error(
      "source_thread_id does not match the collected Gmail message",
    );
  }
}
const eventKeys = eventDecisions.map((decision) => decision.event_key);
if (new Set(eventKeys).size !== eventKeys.length) {
  throw new Error("Each event_key may appear only once per batch");
}
const withWindows = eventDecisions.map((decision) => {
  const startRaw = "date" in decision.start
    ? `${decision.start.date}T00:00:00Z`
    : decision.start.dateTime;
  const endRaw = "date" in decision.end
    ? `${decision.end.date}T00:00:00Z`
    : decision.end.dateTime;
  const start = new Date(startRaw).getTime();
  const end = new Date(endRaw).getTime();
  return {
    ...decision,
    window_min: new Date(start - 86400_000).toISOString(),
    window_max: new Date(end + 86400_000).toISOString(),
  };
});

console.log(JSON.stringify({
  run_token: envelope.run_token,
  calendar_id: calendarId,
  decisions: envelope.decisions,
  event_decisions: withWindows,
}));
