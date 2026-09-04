import { planOperation } from "./lib/calendar.ts";
import { CalendarEvent, UpsertDecision } from "./lib/types.ts";

type Lookup = { items?: unknown };

const [validatedRaw = "", ownedRaw = "[]", nearbyRaw = "[]"] = Deno.args;
const validated = JSON.parse(validatedRaw) as Record<string, unknown>;
const decisions = validated.decisions;
const eventDecisions = validated.event_decisions;
const ownedLookups = JSON.parse(ownedRaw) as Lookup[];
const nearbyLookups = JSON.parse(nearbyRaw) as Lookup[];
if (!Array.isArray(decisions) || !Array.isArray(eventDecisions)) {
  throw new Error("Validated decisions are unavailable");
}
if (!Array.isArray(ownedLookups) || !Array.isArray(nearbyLookups)) {
  throw new Error("Calendar lookups are unavailable");
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
  const decision = eventDecisions[index] as UpsertDecision;
  const owned = Array.isArray(ownedLookups[index]?.items)
    ? ownedLookups[index].items as CalendarEvent[]
    : [];
  const nearby = Array.isArray(nearbyLookups[index]?.items)
    ? nearbyLookups[index].items as CalendarEvent[]
    : [];
  const planned = await planOperation(decision, owned, nearby, new Date());
  results.push(planned.result);
  if (planned.operation?.action === "insert") inserts.push(planned.operation);
  if (planned.operation?.action === "patch") patches.push(planned.operation);
}

console.log(JSON.stringify({
  run_token: validated.run_token,
  inserts,
  patches,
  results,
}));
