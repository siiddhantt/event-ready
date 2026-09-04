import { parseEnvelope } from "../lib/decisions.ts";
import { assertEquals, assertThrows } from "./assert.ts";

function envelope(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: 1,
    run_token: "token",
    decisions: [{
      message_id: "m1",
      action: "upsert",
      event_key: "gmail.t1",
      source_thread_id: "t1",
      kind: "interview",
      title: "Acme interview",
      confidence: 0.97,
      evidence: ["The email states 10:00 IST on 8 September."],
      start: {
        dateTime: "2026-09-08T10:00:00+05:30",
        timeZone: "Asia/Kolkata",
      },
      end: { dateTime: "2026-09-08T11:00:00+05:30", timeZone: "Asia/Kolkata" },
      ...overrides,
    }],
  };
}

Deno.test("accepts one source-grounded timed decision", () => {
  const parsed = parseEnvelope(envelope());
  assertEquals(parsed.decisions[0].action, "upsert");
});

Deno.test("rejects agent confidence below the write threshold", () => {
  assertThrows(
    () => parseEnvelope(envelope({ confidence: 0.89 })),
    "confidence",
  );
});

Deno.test("rejects a timestamp without an explicit offset", () => {
  assertThrows(
    () =>
      parseEnvelope(
        envelope({
          start: { dateTime: "2026-09-08T10:00:00", timeZone: "Asia/Kolkata" },
        }),
      ),
    "explicit offset",
  );
});

Deno.test("rejects a timezone that disagrees with the timestamp offset", () => {
  assertThrows(
    () =>
      parseEnvelope(
        envelope({
          start: {
            dateTime: "2026-09-08T10:00:00+05:30",
            timeZone: "America/New_York",
          },
        }),
      ),
    "match",
  );
});

Deno.test("rejects non-HTTPS meeting links", () => {
  assertThrows(
    () => parseEnvelope(envelope({ meeting_url: "javascript:alert(1)" })),
    "HTTPS",
  );
});

Deno.test("rejects duplicate message decisions", () => {
  const value = envelope();
  value.decisions = [
    ...value.decisions as unknown[],
    ...value.decisions as unknown[],
  ];
  assertThrows(() => parseEnvelope(value), "only once");
});

Deno.test("requires a stable Gmail thread identity", () => {
  assertThrows(
    () => parseEnvelope(envelope({ source_thread_id: undefined })),
    "source_thread_id",
  );
  assertThrows(
    () => parseEnvelope(envelope({ event_key: "unrelated" })),
    "source_thread_id",
  );
});

Deno.test("accepts a dated all-day deadline", () => {
  const parsed = parseEnvelope(envelope({
    kind: "deadline",
    start: { date: "2026-09-08" },
    end: { date: "2026-09-09" },
  }));
  assertEquals(parsed.decisions.length, 1);
});
