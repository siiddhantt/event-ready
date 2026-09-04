import {
  CalendarEvent,
  CalendarOperation,
  EventPoint,
  UpsertDecision,
} from "./types.ts";

function pointMillis(value: EventPoint): number {
  return "date" in value
    ? new Date(`${value.date}T00:00:00Z`).getTime()
    : new Date(value.dateTime).getTime();
}

function normalized(value: unknown): string {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function eventStart(event: CalendarEvent): number | null {
  const value = event.start as Record<string, unknown> | undefined;
  const raw = typeof value?.dateTime === "string"
    ? value.dateTime
    : typeof value?.date === "string"
    ? `${value.date}T00:00:00Z`
    : "";
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function eventReadyKey(event: CalendarEvent): string | null {
  const extended = event.extendedProperties as
    | Record<string, unknown>
    | undefined;
  const privateValues = extended?.private as
    | Record<string, unknown>
    | undefined;
  return typeof privateValues?.eventReadyKey === "string"
    ? privateValues.eventReadyKey
    : null;
}

export function deterministicEventId(eventKey: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(eventKey))
    .then((digest) => {
      const hex = [...new Uint8Array(digest)].map((value) =>
        value.toString(16).padStart(2, "0")
      ).join("");
      return `er${hex.slice(0, 40)}`;
    });
}

export function defaultReminders(kind: UpsertDecision["kind"]): number[] {
  return kind === "meeting" || kind === "interview" || kind === "appointment"
    ? [1440, 60, 10]
    : [10080, 2880, 360, 60];
}

export function effectiveReminders(
  decision: UpsertDecision,
  now: Date,
): number[] {
  const start = pointMillis(decision.start);
  const future = (decision.reminders_minutes ?? defaultReminders(decision.kind))
    .filter((minutes) => start - minutes * 60_000 > now.getTime())
    .slice(0, 5);
  return future.length === 0 && start > now.getTime() ? [0] : future;
}

export function eventBody(
  decision: UpsertDecision,
  now: Date,
): Record<string, unknown> {
  const reminders = effectiveReminders(decision, now);
  const sourceUrl = `https://mail.google.com/mail/u/0/#all/${
    encodeURIComponent(decision.source_thread_id)
  }`;
  const prefix = decision.cancelled
    ? "[Cancelled] "
    : decision.needs_confirmation
    ? "[Needs confirmation] "
    : "";
  const evidence = decision.evidence.map((item) => `- ${item}`).join("\n");
  const description = [
    decision.description,
    decision.meeting_url ? `Meeting: ${decision.meeting_url}` : undefined,
    `Source email: ${sourceUrl}`,
    `Agent evidence:\n${evidence}`,
  ].filter(Boolean).join("\n\n");
  const privateProperties = Object.fromEntries(
    Object.entries({
      eventReadyKey: decision.event_key,
      eventReadySourceMessage: decision.message_id,
      eventReadySourceThread: decision.source_thread_id,
      eventReadyKind: decision.kind,
      eventReadyCompany: decision.company ?? "",
      eventReadyProjectHint: decision.project_hint ?? "",
      eventReadyMeetingUrl: decision.meeting_url ?? "",
      eventReadyStatus: decision.cancelled
        ? "cancelled"
        : decision.needs_confirmation
        ? "needs_confirmation"
        : "active",
    }).filter(([, value]) => value !== ""),
  );
  const body: Record<string, unknown> = {
    summary: `${prefix}${decision.title}`,
    description,
    location: decision.location,
    start: decision.start,
    end: decision.end,
    visibility: "private",
    transparency: "opaque",
    reminders: {
      useDefault: false,
      overrides: reminders.map((minutes) => ({ method: "popup", minutes })),
    },
    extendedProperties: {
      private: privateProperties,
    },
  };
  if (decision.meeting_url) {
    body.source = { title: "Meeting link", url: decision.meeting_url };
  }
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  );
}

export function semanticDuplicate(
  decision: UpsertDecision,
  candidates: CalendarEvent[],
): CalendarEvent | null {
  const targetStart = pointMillis(decision.start);
  const title = normalized(decision.title);
  for (const event of candidates) {
    if (eventReadyKey(event) === decision.event_key) continue;
    const start = eventStart(event);
    if (start === null || Math.abs(start - targetStart) > 15 * 60_000) continue;
    const existingTitle = normalized(event.summary);
    if (!existingTitle) continue;
    if (
      existingTitle === title ||
      (Math.min(existingTitle.length, title.length) >= 8 &&
        (existingTitle.includes(title) || title.includes(existingTitle)))
    ) return event;
  }
  return null;
}

export async function planOperation(
  decision: UpsertDecision,
  owned: CalendarEvent[],
  nearby: CalendarEvent[],
  now: Date,
): Promise<
  { operation: CalendarOperation | null; result: Record<string, unknown> }
> {
  const matching = owned.find((event) =>
    eventReadyKey(event) === decision.event_key && typeof event.id === "string"
  );
  if (matching && typeof matching.id === "string") {
    return {
      operation: {
        message_id: decision.message_id,
        event_key: decision.event_key,
        action: "patch",
        event_id: matching.id,
        request_body: { id: matching.id, ...eventBody(decision, now) },
      },
      result: {
        message_id: decision.message_id,
        outcome: "update_planned",
        event_id: matching.id,
      },
    };
  }
  if (decision.cancelled) {
    return {
      operation: null,
      result: {
        message_id: decision.message_id,
        outcome: "cancelled_without_owned_event",
      },
    };
  }
  if (pointMillis(decision.end) <= now.getTime()) {
    return {
      operation: null,
      result: {
        message_id: decision.message_id,
        outcome: "expired_event_ignored",
      },
    };
  }
  const duplicate = semanticDuplicate(decision, nearby);
  if (duplicate && typeof duplicate.id === "string") {
    return {
      operation: null,
      result: {
        message_id: decision.message_id,
        outcome: "existing_event_preserved",
        event_id: duplicate.id,
      },
    };
  }
  const eventId = await deterministicEventId(decision.event_key);
  return {
    operation: {
      message_id: decision.message_id,
      event_key: decision.event_key,
      action: "insert",
      event_id: eventId,
      request_body: { id: eventId, ...eventBody(decision, now) },
    },
    result: {
      message_id: decision.message_id,
      outcome: "create_planned",
      event_id: eventId,
    },
  };
}
