import {
  appendAudit,
  readState,
  withStateLock,
  writeState,
} from "./lib/state.ts";
import { normalizeFanOut } from "./lib/fanout.ts";

const [planRaw = "", insertsRaw = "[]", patchesRaw = "[]"] = Deno.args;
const plan = JSON.parse(planRaw) as Record<string, unknown>;
const inserts = normalizeFanOut(JSON.parse(insertsRaw));
const patches = normalizeFanOut(JSON.parse(patchesRaw));
const plannedInserts = Array.isArray(plan.inserts) ? plan.inserts : [];
const plannedPatches = Array.isArray(plan.patches) ? plan.patches : [];
if (inserts.length !== plannedInserts.length) {
  throw new Error("Not every planned insert completed");
}
if (patches.length !== plannedPatches.length) {
  throw new Error("Not every planned update completed");
}
for (
  const [responses, operations] of [[inserts, plannedInserts], [
    patches,
    plannedPatches,
  ]]
) {
  for (let index = 0; index < responses.length; index++) {
    const response = responses[index] as Record<string, unknown>;
    const operation = operations[index] as Record<string, unknown>;
    if (!response || response.error || response.id !== operation.event_id) {
      throw new Error(
        "Calendar did not confirm the expected event ID; pending batch retained",
      );
    }
  }
}
const runToken = plan.run_token;
if (typeof runToken !== "string") throw new Error("Plan run token is missing");

const receipt = await withStateLock(async () => {
  const state = await readState();
  if (!state.pending || state.pending.token !== runToken) {
    throw new Error("Pending batch changed before commit");
  }
  const processed = new Set(state.processed_message_ids);
  for (const id of state.pending.message_ids) processed.add(id);
  state.processed_message_ids = [...processed].slice(-5000);
  const processedCount = state.pending.message_ids.length;
  if (!state.pending.next_page_token) {
    state.cursor_epoch_seconds = Math.max(
      state.cursor_epoch_seconds ?? 0,
      state.pending.next_cursor_epoch_seconds,
    );
    state.scan = null;
  }
  state.pending = null;
  const responses = [...inserts, ...patches] as Record<string, unknown>[];
  const results = (Array.isArray(plan.results) ? plan.results : []).map(
    (result: Record<string, unknown>) => {
      if (
        !["create_planned", "update_planned"].includes(String(result.outcome))
      ) {
        return result;
      }
      const response = responses.find((item) => item.id === result.event_id);
      if (!response) {
        throw new Error("A planned outcome has no Calendar acknowledgment");
      }
      return {
        ...result,
        outcome: result.cancelled
          ? "cancelled"
          : result.outcome === "create_planned"
          ? "created"
          : "updated",
        calendar_url: response.htmlLink,
        reminders: response.reminders,
      };
    },
  );
  const output = {
    status: "applied",
    processed: processedCount,
    inserted: plannedInserts.length,
    updated: plannedPatches.length,
    results,
  };
  await appendAudit({
    at: new Date().toISOString(),
    action: "apply",
    run_token: runToken,
    calendar_id: state.calendar_id,
    ...output,
  });
  // A confirmed write must be durably queryable before its mail cursor advances.
  // Retries share a run token so history can suppress duplicate receipts.
  await writeState(state);
  return output;
});

console.log(JSON.stringify(receipt));
