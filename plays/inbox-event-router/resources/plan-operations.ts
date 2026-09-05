import { planOperation } from "./lib/calendar.ts";
import { normalizeFanOut } from "./lib/fanout.ts";
import { CalendarEvent, UpsertDecision } from "./lib/types.ts";

type Lookup = { items?: unknown; nextPageToken?: unknown; error?: unknown };

const [validatedRaw = "", ownedRaw = "[]", nearbyRaw = "[]"] = Deno.args;
const validated = JSON.parse(validatedRaw) as Record<string, unknown>;
const decisions = validated.decisions;
const eventDecisions = validated.event_decisions;
const ownedLookups = normalizeFanOut(JSON.parse(ownedRaw)) as Lookup[];
const nearbyLookups = normalizeFanOut(JSON.parse(nearbyRaw)) as Lookup[];
if (!Array.isArray(decisions) || !Array.isArray(eventDecisions)) {
  throw new Error("Validated decisions are unavailable");
}
if (
  ownedLookups.length !== eventDecisions.length ||
  nearbyLookups.length !== eventDecisions.length
) {
  throw new Error("Calendar lookup count does not match event decisions");
}

const inserts = [];
const patches = [];
const results: Record<string, unknown>[] = decisions.flatMap((decision) => {
  if (
    !decision || typeof decision !== "object" ||
    (decision as Record<string, unknown>).action !== "ignore"
  ) return [];
  const item = decision as Record<string, unknown>;
  return [{
    message_id: item.message_id,
    outcome: "ignored",
    reason: item.reason,
  }];
});

for (let index = 0; index < eventDecisions.length; index += 1) {
  for (const lookup of [ownedLookups[index], nearbyLookups[index]]) {
    if (
      !lookup || lookup.error || lookup.nextPageToken ||
      (lookup.items !== undefined && !Array.isArray(lookup.items))
    ) {
      throw new Error(
        "Calendar lookup is incomplete; no writes are safe until it is complete",
      );
    }
  }
  const decision = eventDecisions[index] as UpsertDecision;
  const owned = Array.isArray(ownedLookups[index]?.items)
    ? ownedLookups[index].items as CalendarEvent[]
    : [];
  const nearby = Array.isArray(nearbyLookups[index]?.items)
    ? nearbyLookups[index].items as CalendarEvent[]
    : [];
  const planned = await planOperation(decision, owned, nearby, new Date());
  results.push({
    ...planned.result,
    event_key: decision.event_key,
    title: decision.title,
    kind: decision.kind,
    start: decision.start,
    end: decision.end,
    source_thread_id: decision.source_thread_id,
    source_received_at: decision.source_received_at,
    cancelled: decision.cancelled === true,
  });
  if (planned.operation?.action === "insert") inserts.push(planned.operation);
  if (planned.operation?.action === "patch") patches.push(planned.operation);
}

console.log(JSON.stringify({
  run_token: validated.run_token,
  inserts,
  patches,
  results,
}));
