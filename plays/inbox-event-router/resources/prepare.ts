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

const [
  mode = "collect",
  calendarId = "primary",
  lookbackRaw = "7",
  batchRaw = "25",
  mailboxId = "",
] = Deno.args;
if (mode !== "collect" && mode !== "apply") {
  throw new Error("mode must be collect or apply");
}
if (!calendarId.trim() || calendarId.length > 512) {
  throw new Error("calendar_id must be a non-empty string");
}
const lookbackDays = integer(lookbackRaw, "lookback_days", 1, 30);
const state = await readState();
if (state.mailbox_id && state.mailbox_id !== mailboxId) {
  throw new Error(
    "Gmail account differs from this state; use a separate EVENT_READY_STATE_DIR",
  );
}
if (state.calendar_id && state.calendar_id !== calendarId) {
  throw new Error(
    "calendar_id differs from this state's Calendar; use a separate EVENT_READY_STATE_DIR",
  );
}
const batchSize = integer(batchRaw, "batch_size", 1, 100);
const now = new Date();
const nowEpoch = Math.floor(now.getTime() / 1000);
const queryEpoch = state.cursor_epoch_seconds === null
  ? null
  : Math.max(0, state.cursor_epoch_seconds - 300);
// Freeze both bounds while walking pages so newly arriving mail cannot shift them.
const query = state.scan?.query ??
  `after:${
    queryEpoch ?? nowEpoch - lookbackDays * 86400
  } before:${nowEpoch} -in:spam -in:trash`;
const calendarMin = new Date(now.getTime() - 30 * 86400_000).toISOString();
const calendarMax = new Date(now.getTime() + 400 * 86400_000).toISOString();

console.log(JSON.stringify({
  mode,
  calendar_id: calendarId,
  mailbox_id: mailboxId,
  lookback_days: lookbackDays,
  query,
  page_token: state.scan?.page_token ?? "",
  batch_size: batchSize,
  collected_at: now.toISOString(),
  next_cursor_epoch_seconds: state.scan?.next_cursor_epoch_seconds ?? nowEpoch,
  needs_listing: mode === "collect" && state.pending === null,
  pending: mode === "collect" ? state.pending : null,
  calendar_min: calendarMin,
  calendar_max: calendarMax,
}));
