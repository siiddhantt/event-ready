import {
  appendAudit,
  readState,
  withStateLock,
  writeState,
} from "./lib/state.ts";
import { PendingBatch } from "./lib/types.ts";

type ListedMessage = { id?: unknown; threadId?: unknown };

const [listingRaw = "{}", prepareRaw = ""] = Deno.args;
const listing = JSON.parse(listingRaw) as Record<string, unknown>;
const prepare = JSON.parse(prepareRaw) as Record<string, unknown>;
const listed = listing.messages === undefined ? [] : listing.messages;
if (!Array.isArray(listed)) {
  throw new Error("Gmail messages response must be an array");
}
if (typeof listing.nextPageToken === "string" && listing.nextPageToken) {
  throw new Error(
    "The first scan exceeded 500 messages; reduce lookback_days before retrying",
  );
}
const nextCursor = prepare.next_cursor_epoch_seconds;
if (typeof nextCursor !== "number" || !Number.isInteger(nextCursor)) {
  throw new Error("Prepared cursor is invalid");
}

const result = await withStateLock(async () => {
  const state = await readState();
  if (state.pending) return { status: "pending", ...state.pending };
  const processed = new Set(state.processed_message_ids);
  for (const entry of listed) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as ListedMessage;
    if (typeof item.id === "string" && typeof item.threadId !== "string") {
      throw new Error("Gmail message listing omitted a threadId");
    }
  }
  const messages = listed.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as ListedMessage;
    return typeof item.id === "string" &&
        typeof item.threadId === "string" && !processed.has(item.id)
      ? [{ id: item.id, thread_id: item.threadId }]
      : [];
  });
  const threadIds = Object.fromEntries(
    messages.map((message) => [message.id, message.thread_id]),
  );
  const ids = [...new Set(messages.map((message) => message.id))];
  if (ids.length === 0) {
    state.cursor_epoch_seconds = nextCursor;
    await writeState(state);
    await appendAudit({
      at: new Date().toISOString(),
      action: "collect",
      outcome: "idle",
      cursor: nextCursor,
    });
    return {
      status: "idle",
      token: "",
      created_at: new Date().toISOString(),
      next_cursor_epoch_seconds: nextCursor,
      message_ids: [],
      thread_ids: {},
    };
  }
  const material = `${nextCursor}\n${
    ids.map((id) => `${id}:${threadIds[id]}`).join("\n")
  }`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  const token = [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
  const pending: PendingBatch = {
    token,
    created_at: new Date().toISOString(),
    next_cursor_epoch_seconds: nextCursor,
    message_ids: ids,
    thread_ids: threadIds,
  };
  state.pending = pending;
  await writeState(state);
  await appendAudit({
    at: pending.created_at,
    action: "collect",
    outcome: "pending",
    token,
    message_count: ids.length,
  });
  return { status: "pending", ...pending };
});

console.log(JSON.stringify(result));
