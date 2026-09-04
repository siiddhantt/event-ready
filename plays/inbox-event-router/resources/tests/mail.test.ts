import { normalizeCalendarEvents, normalizeMessage } from "../../lib/mail.ts";
import { assertEquals } from "./assert.ts";

function encoded(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.test("normalizes nested plain text without classifying it", () => {
  const message = normalizeMessage({
    id: "m1",
    threadId: "t1",
    snippet: "fallback",
    payload: {
      mimeType: "multipart/alternative",
      headers: [{ name: "Subject", value: "Interview details" }, {
        name: "From",
        value: "Acme <jobs@acme.test>",
      }],
      parts: [{
        mimeType: "text/plain",
        body: { data: encoded("Meet on Tuesday at 10:00 IST.") },
      }],
    },
  });
  assertEquals(message?.subject, "Interview details");
  assertEquals(message?.body, "Meet on Tuesday at 10:00 IST.");
  assertEquals("classification" in (message ?? {}), false);
});

Deno.test("reads inline calendar evidence and reports truncation", () => {
  const body = `BEGIN:VCALENDAR\n${"A".repeat(16000)}\nEND:VCALENDAR`;
  const message = normalizeMessage({
    id: "m2",
    threadId: "t2",
    payload: {
      mimeType: "multipart/mixed",
      parts: [{
        mimeType: "text/calendar",
        body: { data: encoded(body) },
      }],
    },
  });
  assertEquals(String(message?.body).startsWith("BEGIN:VCALENDAR"), true);
  assertEquals(String(message?.body).length, 16000);
  assertEquals(message?.body_truncated, true);
});

Deno.test("exposes only suite-owned Calendar metadata", () => {
  const events = normalizeCalendarEvents([{
    id: "e1",
    extendedProperties: {
      private: { eventReadyKey: "gmail.t1", unrelatedSecret: "hidden" },
    },
  }]);
  assertEquals(events[0].event_ready, { eventReadyKey: "gmail.t1" });
  assertEquals(JSON.stringify(events).includes("hidden"), false);
});
