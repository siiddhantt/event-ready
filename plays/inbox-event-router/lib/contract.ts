export function decisionContract(
  runToken: string | null,
): Record<string, unknown> {
  return {
    schema_version: 1,
    envelope: {
      schema_version: 1,
      run_token: runToken,
      decisions: "Exactly one decision for every message_id in this batch.",
    },
    ignore: { required: ["message_id", "action=ignore", "reason"] },
    upsert: {
      required: [
        "message_id",
        "action=upsert",
        "event_key",
        "kind",
        "title",
        "confidence",
        "evidence",
        "start",
        "end",
        "source_thread_id",
      ],
      kinds: [
        "meeting",
        "interview",
        "exam",
        "assessment",
        "test",
        "appointment",
        "registration",
        "deadline",
      ],
      timed: {
        dateTime: "ISO 8601 with explicit offset",
        timeZone: "IANA timezone",
      },
      all_day: { date: "YYYY-MM-DD; end date is exclusive" },
      optional: [
        "company",
        "project_hint",
        "location",
        "meeting_url",
        "description",
        "reminders_minutes",
        "needs_confirmation",
        "cancelled",
      ],
    },
    constraints: [
      "Use ignore when the message is not an event or critical evidence is missing.",
      "Use upsert only with source-grounded evidence and confidence of at least 0.9.",
      "Reuse an existing eventReadyKey for updates or cancellations.",
      "For a new event use gmail.<thread_id>; add a stable source-grounded suffix only when one thread contains multiple events.",
      "Never add attendees, send messages, RSVP, register, or invent a date, time, or timezone.",
    ],
  };
}
