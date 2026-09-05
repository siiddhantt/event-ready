import { assertEquals, assertRejects } from "./assert.ts";
import { eventDecisions, parseEnvelope } from "../lib/decisions.ts";
import { eventBody, planOperation } from "../lib/calendar.ts";

async function run(script: string, args: unknown[], directory: string) {
  const output = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      new URL(`../${script}.ts`, import.meta.url).pathname,
      ...args.map((v) => typeof v === "string" ? v : JSON.stringify(v)),
    ],
    env: { EVENT_READY_STATE_DIR: directory },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) throw new Error(new TextDecoder().decode(output.stderr));
  return JSON.parse(new TextDecoder().decode(output.stdout));
}
async function commitIgnored(
  directory: string,
  pending: { token: string; message_ids: string[] },
) {
  const validated = await run("validate-decisions", [{
    schema_version: 1,
    run_token: pending.token,
    decisions: pending.message_ids.map((message_id) => ({
      message_id,
      action: "ignore",
      reason: "Not an event",
    })),
  }, "primary"], directory);
  const plan = await run("plan-operations", [validated, [], []], directory);
  return await run("commit", [plan, [], []], directory);
}

Deno.test("multiple pages survive a restart and advance the cursor only after the final commit", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const initial = await run("prepare", [
      "collect",
      "primary",
      "7",
      "2",
      "demo@example.test",
    ], directory);
    const first = await run("save-pending", [{
      messages: [{ id: "m1", threadId: "t1" }],
      nextPageToken: "page2",
    }, initial], directory);
    assertEquals(
      JSON.parse(await Deno.readTextFile(`${directory}/state.json`))
        .cursor_epoch_seconds,
      null,
    );
    const restarted = await run("prepare", [
      "collect",
      "primary",
      "7",
      "2",
      "demo@example.test",
    ], directory);
    assertEquals(restarted.pending.token, first.token);
    await commitIgnored(directory, first);
    const page2 = await run("prepare", [
      "collect",
      "primary",
      "7",
      "2",
      "demo@example.test",
    ], directory);
    assertEquals(page2.query, initial.query);
    assertEquals(page2.page_token, "page2");
    assertEquals(
      page2.next_cursor_epoch_seconds,
      initial.next_cursor_epoch_seconds,
    );
    const second = await run("save-pending", [{
      messages: [{ id: "m2", threadId: "t2" }],
    }, page2], directory);
    await commitIgnored(directory, second);
    const state = JSON.parse(
      await Deno.readTextFile(`${directory}/state.json`),
    );
    assertEquals(state.processed_message_ids, ["m1", "m2"]);
    assertEquals(state.cursor_epoch_seconds, initial.next_cursor_epoch_seconds);
    assertEquals(state.scan, null);
    await assertRejects(
      () =>
        run(
          "prepare",
          ["collect", "wrong", "7", "2", "demo@example.test"],
          directory,
        ),
      "calendar_id",
    );
    await assertRejects(
      () =>
        run(
          "prepare",
          ["collect", "primary", "7", "2", "wrong@example.test"],
          directory,
        ),
      "Gmail account",
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("an unconfirmed Calendar response cannot clear pending work", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const prepared = await run(
      "prepare",
      ["collect", "primary", "7"],
      directory,
    );
    const pending = await run("save-pending", [{
      messages: [{ id: "m1", threadId: "t1" }],
    }, prepared], directory);
    await assertRejects(
      () =>
        run("commit", [
          {
            run_token: pending.token,
            inserts: [{ event_id: "expected" }],
            patches: [],
            results: [],
          },
          [{ error: "failed" }],
          [],
        ], directory),
      "expected event ID",
    );
    assertEquals(
      JSON.parse(await Deno.readTextFile(`${directory}/state.json`)).pending
        .token,
      pending.token,
    );
    await assertRejects(
      () =>
        run("plan-operations", [{ decisions: [], event_decisions: [{}] }, [{
          items: [],
          nextPageToken: "more",
        }], [{ items: [] }]], directory),
      "incomplete",
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

const event = {
  message_id: "m1",
  action: "upsert",
  event_key: "gmail.t1.submission",
  source_thread_id: "t1",
  kind: "deadline",
  title: "Submission deadline",
  confidence: 0.99,
  evidence: ["Submit by September 8"],
  start: { date: "2026-09-08" },
  end: { date: "2026-09-09" },
};

Deno.test("confirmed Calendar changes remain pending if the audit cannot be saved", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const prepared = await run(
      "prepare",
      ["collect", "primary", "7"],
      directory,
    );
    const pending = await run("save-pending", [{
      messages: [{ id: "m1", threadId: "t1" }],
    }, prepared], directory);
    const validated = await run("validate-decisions", [{
      schema_version: 1,
      run_token: pending.token,
      decisions: [event],
    }, "primary"], directory);
    const plan = await run("plan-operations", [validated, [{ items: [] }], [{
      items: [],
    }]], directory);
    const acknowledgment = {
      id: plan.inserts[0].event_id,
      htmlLink: "https://calendar.google.com/calendar/event?eid=test",
      reminders: { useDefault: false, overrides: [] },
    };
    await Deno.remove(`${directory}/audit.jsonl`);
    await Deno.mkdir(`${directory}/audit.jsonl`);
    await assertRejects(
      () => run("commit", [plan, [acknowledgment], []], directory),
      "directory",
    );
    const blocked = JSON.parse(
      await Deno.readTextFile(`${directory}/state.json`),
    );
    assertEquals(blocked.pending.token, pending.token);
    assertEquals(blocked.cursor_epoch_seconds, null);
    await Deno.remove(`${directory}/audit.jsonl`);
    const receipt = await run(
      "commit",
      [plan, [acknowledgment], []],
      directory,
    );
    assertEquals(receipt.results[0].outcome, "created");
    const audit = JSON.parse(
      (await Deno.readTextFile(`${directory}/audit.jsonl`)).trim(),
    );
    assertEquals(audit.run_token, pending.token);
    assertEquals(audit.results[0].title, event.title);
    assertEquals(audit.results[0].start, event.start);
    assertEquals(audit.results[0].calendar_url, acknowledgment.htmlLink);
    assertEquals(
      JSON.parse(await Deno.readTextFile(`${directory}/state.json`)).pending,
      null,
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("one email can contain several independently keyed milestones", () => {
  const envelope = parseEnvelope({
    schema_version: 1,
    run_token: "token",
    decisions: [{
      message_id: "m1",
      action: "upsert_many",
      events: [event, {
        ...event,
        event_key: "gmail.t1.demo",
        title: "Demo deadline",
      }],
    }],
  });
  assertEquals(envelope.decisions.length, 1);
  assertEquals(eventDecisions(envelope.decisions).length, 2);
});

Deno.test("cancellations suppress reminders and user-deleted events stay deleted", async () => {
  const decision = eventDecisions(
    parseEnvelope({ schema_version: 1, run_token: "t", decisions: [event] })
      .decisions,
  )[0];
  const body = eventBody(
    { ...decision, cancelled: true },
    new Date("2026-09-01"),
  );
  assertEquals(body.reminders, { useDefault: false, overrides: [] });
  assertEquals(body.transparency, "transparent");
  const plan = await planOperation(
    decision,
    [{
      id: "owned",
      status: "cancelled",
      extendedProperties: { private: { eventReadyKey: decision.event_key } },
    }],
    [],
    new Date("2026-09-01"),
  );
  assertEquals(plan.operation, null);
  assertEquals(plan.result.outcome, "user_deleted_event_preserved");
});

Deno.test("a page of older mail cannot revert a newer reschedule", async () => {
  const decision = eventDecisions(
    parseEnvelope({
      schema_version: 1,
      run_token: "t",
      decisions: [event],
    }).decisions,
  )[0];
  const owned = [{
    id: "owned",
    extendedProperties: {
      private: {
        eventReadyKey: decision.event_key,
        eventReadySourceReceivedAt: "2026-09-05T12:00:00Z",
      },
    },
  }];
  for (const timestamp of [undefined, "2026-09-04T12:00:00Z"]) {
    const result = await planOperation(
      { ...decision, source_received_at: timestamp },
      owned,
      [],
      new Date("2026-09-05"),
    );
    assertEquals(result.operation, null);
    assertEquals(result.result.outcome, "older_update_preserved");
  }
  const newer = await planOperation(
    { ...decision, source_received_at: "2026-09-06T12:00:00Z" },
    owned,
    [],
    new Date("2026-09-05"),
  );
  assertEquals(newer.operation?.action, "patch");
});
