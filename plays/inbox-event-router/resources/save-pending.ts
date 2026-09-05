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
if (listing.error) {
  throw new Error("Gmail listing failed; cursor was not advanced");
}
const nextPageToken = typeof listing.nextPageToken === "string"
  ? listing.nextPageToken
  : "";
const nextCursor = prepare.next_cursor_epoch_seconds;
if (typeof nextCursor !== "number" || !Number.isInteger(nextCursor)) {
  throw new Error("Prepared cursor is invalid");
}

const result = await withStateLock(async () => {
  const state = await readState();
  if (state.pending) return { status: "pending", ...state.pending };
  if (state.calendar_id && state.calendar_id !== prepare.calendar_id) {
    throw new Error("Calendar changed before collection");
  }
  if (
    state.scan &&
    (state.scan.query !== prepare.query ||
      state.scan.page_token !== prepare.page_token)
  ) {
    throw new Error("Scan changed before collection; collect again");
  }
  state.calendar_id = String(prepare.calendar_id);
  state.mailbox_id = String(prepare.mailbox_id ?? "");
  state.scan = {
    query: String(prepare.query),
    page_token: nextPageToken,
    next_cursor_epoch_seconds: nextCursor,
  };
  const processed = new Set(state.processed_message_ids);
  for (const entry of listed) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Malformed Gmail message listing");
    }
    const item = entry as ListedMessage;
    if (
      typeof item.id !== "string" || !item.id ||
      typeof item.threadId !== "string" || !item.threadId
    ) {
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
    if (!nextPageToken) {
      state.cursor_epoch_seconds = Math.max(
        state.cursor_epoch_seconds ?? 0,
        nextCursor,
      );
      state.scan = null;
    }
    await writeState(state);
    await appendAudit({
      at: new Date().toISOString(),
      action: "collect",
      outcome: "idle",
      cursor: nextCursor,
    });
    return {
      status: nextPageToken ? "page_complete" : "idle",
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
    next_page_token: nextPageToken,
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
