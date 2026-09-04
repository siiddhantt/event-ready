import {
  effectiveReminders,
  planOperation,
  semanticDuplicate,
} from "../lib/calendar.ts";
import { UpsertDecision } from "../lib/types.ts";
import { assert, assertEquals } from "./assert.ts";

const decision: UpsertDecision = {
  message_id: "m1",
  action: "upsert",
  event_key: "gmail.t1",
  source_thread_id: "t1",
  kind: "interview",
  title: "Acme interview",
  meeting_url: "https://meet.google.com/abc-defg-hij",
  confidence: 0.99,
  evidence: ["Exact date and time in source."],
  start: { dateTime: "2026-09-08T10:00:00+05:30", timeZone: "Asia/Kolkata" },
  end: { dateTime: "2026-09-08T11:00:00+05:30", timeZone: "Asia/Kolkata" },
};

Deno.test("plans a deterministic private insert", async () => {
  const first = await planOperation(
    decision,
    [],
    [],
    new Date("2026-09-01T00:00:00Z"),
  );
  const second = await planOperation(
    decision,
    [],
    [],
    new Date("2026-09-01T00:00:00Z"),
  );
  assert(first.operation?.action === "insert");
  assertEquals(first.operation?.event_id, second.operation?.event_id);
  assertEquals(first.operation?.body.visibility, "private");
  assertEquals("attendees" in (first.operation?.body ?? {}), false);
  assertEquals(
    ((first.operation?.body.extendedProperties as Record<string, unknown>)
      .private as Record<string, unknown>).eventReadyMeetingUrl,
    "https://meet.google.com/abc-defg-hij",
  );
});

Deno.test("patches only an event carrying the suite key", async () => {
  const planned = await planOperation(
    decision,
    [{
      id: "owned",
      extendedProperties: { private: { eventReadyKey: decision.event_key } },
    }],
    [],
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals(planned.operation?.action, "patch");
  assertEquals(planned.operation?.event_id, "owned");
});

Deno.test("preserves a matching user-owned event", async () => {
  const nearby = [{
    id: "personal",
    summary: "Acme Interview",
    start: { dateTime: "2026-09-08T04:30:00Z" },
  }];
  assertEquals(semanticDuplicate(decision, nearby)?.id, "personal");
  const planned = await planOperation(
    decision,
    [],
    nearby,
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals(planned.operation, null);
  assertEquals(planned.result.outcome, "existing_event_preserved");
});

Deno.test("does not treat an untitled nearby event as a duplicate", () => {
  assertEquals(
    semanticDuplicate(decision, [{
      id: "untitled",
      start: { dateTime: "2026-09-08T04:30:00Z" },
    }]),
    null,
  );
});

Deno.test("does not create a cancellation without an owned event", async () => {
  const planned = await planOperation(
    { ...decision, cancelled: true },
    [],
    [],
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals(planned.operation, null);
  assertEquals(planned.result.outcome, "cancelled_without_owned_event");
});

Deno.test("does not create an event that has already ended", async () => {
  const planned = await planOperation(
    decision,
    [],
    [],
    new Date("2026-09-09T00:00:00Z"),
  );
  assertEquals(planned.operation, null);
  assertEquals(planned.result.outcome, "expired_event_ignored");
});

Deno.test("drops reminder times already in the past", () => {
  const reminders = effectiveReminders(
    decision,
    new Date("2026-09-08T03:45:00Z"),
  );
  assertEquals(reminders, [10]);
});

Deno.test("keeps an at-start alert when every lead time has passed", () => {
  const reminders = effectiveReminders(
    decision,
    new Date("2026-09-08T04:25:00Z"),
  );
  assertEquals(reminders, [0]);
});
