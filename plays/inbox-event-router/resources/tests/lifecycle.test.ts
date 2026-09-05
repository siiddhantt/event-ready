import { assertEquals, assertRejects } from "./assert.ts";

async function run(
  script: string,
  args: string[],
  stateDirectory: string,
): Promise<Record<string, unknown>> {
  const path = decodeURIComponent(
    new URL(`../${script}`, import.meta.url).pathname,
  );
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", path, ...args],
    env: { EVENT_READY_STATE_DIR: stateDirectory },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) throw new Error(new TextDecoder().decode(output.stderr));
  return JSON.parse(new TextDecoder().decode(output.stdout));
}

Deno.test("collect and all-ignore apply advance one batch exactly once", async () => {
  const stateDirectory = await Deno.makeTempDir();
  const prepared = await run(
    "prepare.ts",
    ["collect", "primary", "7"],
    stateDirectory,
  );
  const pending = await run(
    "save-pending.ts",
    [
      JSON.stringify({ messages: [{ id: "m1", threadId: "t1" }] }),
      JSON.stringify(prepared),
    ],
    stateDirectory,
  );
  assertEquals(pending.status, "pending");
  const resumed = await run(
    "prepare.ts",
    ["collect", "primary", "7"],
    stateDirectory,
  );
  assertEquals((resumed.pending as Record<string, unknown>).message_ids, [
    "m1",
  ]);
  await assertRejects(
    () =>
      run("validate-decisions.ts", [
        JSON.stringify({
          schema_version: 1,
          run_token: pending.token,
          decisions: [{
            message_id: "m1",
            action: "upsert",
            event_key: "gmail.wrong-thread",
            source_thread_id: "wrong-thread",
            kind: "meeting",
            title: "Event",
            confidence: 0.99,
            evidence: ["Exact source evidence"],
            start: {
              dateTime: "2026-09-08T10:00:00+05:30",
              timeZone: "Asia/Kolkata",
            },
            end: {
              dateTime: "2026-09-08T11:00:00+05:30",
              timeZone: "Asia/Kolkata",
            },
          }],
        }),
        "primary",
      ], stateDirectory),
    "source_thread_id",
  );
  const envelope = {
    schema_version: 1,
    run_token: pending.token,
    decisions: [{ message_id: "m1", action: "ignore", reason: "Not an event" }],
  };
  const validated = await run("validate-decisions.ts", [
    JSON.stringify(envelope),
    "primary",
  ], stateDirectory);
  const plan = await run("plan-operations.ts", [
    JSON.stringify(validated),
    "[]",
    "[]",
  ], stateDirectory);
  const receipt = await run(
    "commit.ts",
    [JSON.stringify(plan), "[]", "[]"],
    stateDirectory,
  );
  assertEquals(receipt, {
    status: "applied",
    processed: 1,
    inserted: 0,
    updated: 0,
    results: [{ message_id: "m1", outcome: "ignored", reason: "Not an event" }],
  });
  const state = JSON.parse(
    await Deno.readTextFile(`${stateDirectory}/state.json`),
  );
  assertEquals(state.pending, null);
  assertEquals(state.processed_message_ids, ["m1"]);
  await Deno.remove(stateDirectory, { recursive: true });
});

Deno.test("an empty Gmail listing advances the cursor as idle", async () => {
  const stateDirectory = await Deno.makeTempDir();
  const prepared = await run(
    "prepare.ts",
    ["collect", "primary", "7"],
    stateDirectory,
  );
  const result = await run(
    "save-pending.ts",
    [JSON.stringify({ resultSizeEstimate: 0 }), JSON.stringify(prepared)],
    stateDirectory,
  );
  assertEquals(result.status, "idle");
  assertEquals(result.message_ids, []);
  const state = JSON.parse(
    await Deno.readTextFile(`${stateDirectory}/state.json`),
  );
  assertEquals(state.pending, null);
  assertEquals(state.cursor_epoch_seconds, prepared.next_cursor_epoch_seconds);
  await Deno.remove(stateDirectory, { recursive: true });
});

Deno.test("a singleton Calendar write commits its one-event batch", async () => {
  const stateDirectory = await Deno.makeTempDir();
  const prepared = await run(
    "prepare.ts",
    ["collect", "primary", "7"],
    stateDirectory,
  );
  const pending = await run(
    "save-pending.ts",
    [
      JSON.stringify({ messages: [{ id: "m2", threadId: "t2" }] }),
      JSON.stringify(prepared),
    ],
    stateDirectory,
  );
  const validated = await run(
    "validate-decisions.ts",
    [
      JSON.stringify({
        schema_version: 1,
        run_token: pending.token,
        decisions: [{
          message_id: "m2",
          action: "upsert",
          event_key: "gmail.t2",
          source_thread_id: "t2",
          kind: "meeting",
          title: "Event",
          confidence: 0.99,
          evidence: ["Exact source evidence"],
          start: {
            dateTime: new Date(Date.now() + 86400_000).toISOString(),
            timeZone: "UTC",
          },
          end: {
            dateTime: new Date(Date.now() + 90000_000).toISOString(),
            timeZone: "UTC",
          },
        }],
      }),
      "primary",
    ],
    stateDirectory,
  );
  const plan = await run(
    "plan-operations.ts",
    [
      JSON.stringify(validated),
      JSON.stringify({ items: [] }),
      JSON.stringify({ items: [] }),
    ],
    stateDirectory,
  );
  const receipt = await run(
    "commit.ts",
    [
      JSON.stringify(plan),
      JSON.stringify({
        id: (plan.inserts as Record<string, unknown>[])[0].event_id,
      }),
      "[]",
    ],
    stateDirectory,
  );
  assertEquals(receipt.status, "applied");
  assertEquals(receipt.inserted, 1);
  assertEquals(receipt.updated, 0);
  const state = JSON.parse(
    await Deno.readTextFile(`${stateDirectory}/state.json`),
  );
  assertEquals(state.pending, null);
  assertEquals(state.processed_message_ids, ["m2"]);
  await Deno.remove(stateDirectory, { recursive: true });
});
