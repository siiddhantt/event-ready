import { parseState, readState, statePath, writeState } from "../lib/state.ts";
import { assertEquals, assertThrows } from "./assert.ts";

Deno.test("state round trip stores no message bodies", async () => {
  const directory = await Deno.makeTempDir();
  Deno.env.set("EVENT_READY_STATE_DIR", directory);
  await writeState({
    schema_version: 1,
    cursor_epoch_seconds: 42,
    processed_message_ids: ["m1"],
    pending: {
      token: "t",
      created_at: "2026-09-04T00:00:00Z",
      next_cursor_epoch_seconds: 43,
      message_ids: ["m2"],
      thread_ids: { m2: "t2" },
    },
  });
  const value = await readState();
  assertEquals(value.pending?.message_ids, ["m2"]);
  const raw = await Deno.readTextFile(statePath());
  assertEquals(raw.includes("body"), false);
  await Deno.remove(directory, { recursive: true });
});

Deno.test("malformed state fails closed", () => {
  assertThrows(
    () => parseState({ schema_version: 2, processed_message_ids: [] }),
    "unsupported schema",
  );
});
