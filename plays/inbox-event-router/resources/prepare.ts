import { readState } from "./lib/state.ts";

function integer(
  value: string,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

const [mode = "collect", calendarId = "primary", lookbackRaw = "7"] = Deno.args;
if (mode !== "collect" && mode !== "apply") {
  throw new Error("mode must be collect or apply");
}
if (!calendarId.trim() || calendarId.length > 512) {
  throw new Error("calendar_id must be a non-empty string");
}
const lookbackDays = integer(lookbackRaw, "lookback_days", 1, 30);
const state = await readState();
const now = new Date();
const nowEpoch = Math.floor(now.getTime() / 1000);
const queryEpoch = state.cursor_epoch_seconds === null
  ? null
  : Math.max(0, state.cursor_epoch_seconds - 300);
const query = queryEpoch === null
  ? `newer_than:${lookbackDays}d -in:spam -in:trash`
  : `after:${queryEpoch} -in:spam -in:trash`;
const calendarMin = new Date(now.getTime() - 30 * 86400_000).toISOString();
const calendarMax = new Date(now.getTime() + 400 * 86400_000).toISOString();

console.log(JSON.stringify({
  mode,
  calendar_id: calendarId,
  lookback_days: lookbackDays,
  query,
  collected_at: now.toISOString(),
  next_cursor_epoch_seconds: nowEpoch,
  needs_listing: mode === "collect" && state.pending === null,
  pending: mode === "collect" ? state.pending : null,
  calendar_min: calendarMin,
  calendar_max: calendarMax,
}));
