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
  state.cursor_epoch_seconds = state.pending.next_cursor_epoch_seconds;
  state.pending = null;
  await writeState(state);
  const results = Array.isArray(plan.results) ? plan.results : [];
  const output = {
    status: "applied",
    processed: results.length,
    inserted: plannedInserts.length,
    updated: plannedPatches.length,
    results,
  };
  await appendAudit({
    at: new Date().toISOString(),
    action: "apply",
    ...output,
  });
  return output;
});

console.log(JSON.stringify(receipt));
