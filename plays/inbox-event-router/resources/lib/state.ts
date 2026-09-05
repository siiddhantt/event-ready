import { PendingBatch, RouterState, SCHEMA_VERSION } from "./types.ts";

const EMPTY_STATE: RouterState = {
  schema_version: SCHEMA_VERSION,
  cursor_epoch_seconds: null,
  processed_message_ids: [],
  pending: null,
};

function homeDirectory(): string {
  const value = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (!value) throw new Error("No user home directory is available");
  return value;
}

export function stateDirectory(): string {
  const override = Deno.env.get("EVENT_READY_STATE_DIR");
  if (override) return override;
  if (Deno.build.os === "windows") {
    return `${
      Deno.env.get("LOCALAPPDATA") ?? homeDirectory()
    }\\Event Ready\\inbox-event-router`;
  }
  return `${
    Deno.env.get("XDG_STATE_HOME") ?? `${homeDirectory()}/.local/state`
  }/event-ready/inbox-event-router`;
}

export function statePath(): string {
  return `${stateDirectory()}${
    Deno.build.os === "windows" ? "\\" : "/"
  }state.json`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((item) =>
      typeof item === "string" && item.length > 0
    );
}

function parsePending(value: unknown): PendingBatch | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") {
    throw new Error("State pending batch is malformed");
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.token !== "string" || typeof item.created_at !== "string" ||
    typeof item.next_cursor_epoch_seconds !== "number" ||
    !isStringArray(item.message_ids) || !isStringRecord(item.thread_ids)
  ) throw new Error("State pending batch is malformed");
  const messageIds = item.message_ids as string[];
  const threadIds = item.thread_ids as Record<string, string>;
  if (messageIds.some((messageId) => !(messageId in threadIds))) {
    throw new Error("State pending batch is malformed");
  }
  return {
    token: item.token,
    created_at: item.created_at,
    next_cursor_epoch_seconds: item.next_cursor_epoch_seconds,
    message_ids: [...new Set(messageIds)],
    thread_ids: threadIds,
    next_page_token: typeof item.next_page_token === "string"
      ? item.next_page_token
      : undefined,
  };
}

export function parseState(value: unknown): RouterState {
  if (!value || typeof value !== "object") {
    throw new Error("State file is malformed");
  }
  const item = value as Record<string, unknown>;
  if (
    item.schema_version !== SCHEMA_VERSION ||
    !isStringArray(item.processed_message_ids)
  ) {
    throw new Error("State file has an unsupported schema");
  }
  const cursor = item.cursor_epoch_seconds;
  if (
    cursor !== null &&
    (typeof cursor !== "number" || !Number.isInteger(cursor) || cursor < 0)
  ) {
    throw new Error("State cursor is malformed");
  }
  const scan = item.scan as RouterState["scan"];
  if (
    scan && (typeof scan.query !== "string" || !scan.query ||
      typeof scan.page_token !== "string" ||
      !Number.isSafeInteger(scan.next_cursor_epoch_seconds) ||
      scan.next_cursor_epoch_seconds < 0)
  ) {
    throw new Error("State scan is malformed");
  }
  if (
    item.calendar_id !== undefined &&
    (typeof item.calendar_id !== "string" || !item.calendar_id)
  ) {
    throw new Error("State calendar identity is malformed");
  }
  return {
    schema_version: SCHEMA_VERSION,
    cursor_epoch_seconds: cursor,
    processed_message_ids: [...new Set(item.processed_message_ids)].slice(
      -5000,
    ),
    pending: parsePending(item.pending),
    calendar_id: item.calendar_id as string | undefined,
    mailbox_id: typeof item.mailbox_id === "string"
      ? item.mailbox_id
      : undefined,
    scan: scan ?? null,
  };
}

export async function readState(): Promise<RouterState> {
  try {
    return parseState(JSON.parse(await Deno.readTextFile(statePath())));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return structuredClone(EMPTY_STATE);
    }
    throw error;
  }
}

export async function writeState(state: RouterState): Promise<void> {
  const directory = stateDirectory();
  await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  if (Deno.build.os !== "windows") await Deno.chmod(directory, 0o700);
  const path = statePath();
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const handle = await Deno.open(temporary, {
    createNew: true,
    write: true,
    mode: 0o600,
  });
  try {
    const bytes = new TextEncoder().encode(`${JSON.stringify(state)}\n`);
    let written = 0;
    while (written < bytes.length) {
      written += await handle.write(bytes.subarray(written));
    }
    await handle.sync();
  } finally {
    handle.close();
  }
  if (Deno.build.os !== "windows") await Deno.chmod(temporary, 0o600);
  await Deno.rename(temporary, path);
}

export async function withStateLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const directory = stateDirectory();
  await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  const lockPath = `${directory}${separator}state.lock`;
  // The OS releases this lock after a crash. Never unlink a locked inode.
  const handle = await Deno.open(lockPath, {
    create: true,
    write: true,
    mode: 0o600,
  });
  try {
    await handle.lock(true);
    return await operation();
  } finally {
    handle.close();
  }
}

export async function appendAudit(
  record: Record<string, unknown>,
): Promise<void> {
  const directory = stateDirectory();
  await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  const path = `${directory}${separator}audit.jsonl`;
  await Deno.writeTextFile(path, `${JSON.stringify(record)}\n`, {
    append: true,
    create: true,
    mode: 0o600,
  });
  if (Deno.build.os !== "windows") await Deno.chmod(path, 0o600);
}
