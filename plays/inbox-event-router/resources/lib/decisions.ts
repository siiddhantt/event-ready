import {
  AgentDecision,
  DecisionEnvelope,
  EventPoint,
  UpsertDecision,
} from "./types.ts";

const KINDS = new Set([
  "meeting",
  "interview",
  "exam",
  "assessment",
  "test",
  "appointment",
  "registration",
  "deadline",
]);
const EVENT_KEY = /^[a-z0-9][a-z0-9._-]{2,127}$/;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max = 1000): string {
  if (
    typeof value !== "string" || value.trim().length === 0 || value.length > max
  ) {
    throw new Error(
      `${name} must be a non-empty string of at most ${max} characters`,
    );
  }
  return value.trim();
}

function optionalText(
  value: unknown,
  name: string,
  max = 2000,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, name, max);
}

function dateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function explicitOffsetMinutes(dateTime: string): number {
  if (/[zZ]$/.test(dateTime)) return 0;
  const match = /([+-])(\d{2}):(\d{2})$/.exec(dateTime);
  if (!match) throw new Error("dateTime has no explicit offset");
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA-u-hc-h23", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return Math.round(
    (localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000,
  );
}

export function parsePoint(value: unknown, name: string): EventPoint {
  const item = record(value, name);
  if (typeof item.date === "string") {
    if (Object.keys(item).length !== 1 || !dateOnly(item.date)) {
      throw new Error(`${name}.date must be a valid YYYY-MM-DD value`);
    }
    return { date: item.date };
  }
  const dateTime = text(item.dateTime, `${name}.dateTime`, 100);
  const timeZone = text(item.timeZone, `${name}.timeZone`, 100);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:[zZ]|[+-]\d{2}:\d{2})$/
      .test(
        dateTime,
      ) || !Number.isFinite(new Date(dateTime).getTime())
  ) {
    throw new Error(
      `${name}.dateTime must be ISO 8601 with an explicit offset`,
    );
  }
  const parsed = new Date(dateTime);
  try {
    if (
      timezoneOffsetMinutes(parsed, timeZone) !==
        explicitOffsetMinutes(dateTime)
    ) {
      throw new Error(`${name}.dateTime offset does not match its timeZone`);
    }
  } catch {
    throw new Error(
      `${name}.timeZone must be IANA and match the dateTime offset`,
    );
  }
  return { dateTime, timeZone };
}

function pointMillis(value: EventPoint): number {
  return "date" in value
    ? new Date(`${value.date}T00:00:00Z`).getTime()
    : new Date(value.dateTime).getTime();
}

function safeUrl(value: unknown, name: string): string | undefined {
  const raw = optionalText(value, name, 1000);
  if (!raw) return undefined;
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  url.username = "";
  url.password = "";
  return url.toString();
}

function parseUpsert(
  item: Record<string, unknown>,
  messageId: string,
): UpsertDecision {
  const kind = text(item.kind, "kind", 30);
  if (!KINDS.has(kind)) throw new Error(`Unsupported event kind: ${kind}`);
  const sourceThreadId = text(item.source_thread_id, "source_thread_id", 256);
  const eventKey = text(item.event_key, "event_key", 128).toLowerCase();
  if (!EVENT_KEY.test(eventKey)) {
    throw new Error(
      "event_key must use lowercase letters, digits, dot, underscore, or hyphen",
    );
  }
  const threadKey = `gmail.${sourceThreadId.toLowerCase()}`;
  if (eventKey !== threadKey && !eventKey.startsWith(`${threadKey}.`)) {
    throw new Error("event_key must be derived from source_thread_id");
  }
  const confidence = item.confidence;
  if (typeof confidence !== "number" || confidence < 0.9 || confidence > 1) {
    throw new Error("confidence must be between 0.9 and 1");
  }
  if (
    !Array.isArray(item.evidence) || item.evidence.length === 0 ||
    item.evidence.length > 8
  ) {
    throw new Error("evidence must contain 1 to 8 source-grounded statements");
  }
  const evidence = item.evidence.map((entry, index) =>
    text(entry, `evidence[${index}]`, 500)
  );
  const start = parsePoint(item.start, "start");
  const end = parsePoint(item.end, "end");
  if (
    ("date" in start) !== ("date" in end) ||
    pointMillis(end) <= pointMillis(start)
  ) {
    throw new Error(
      "end must be after start and use the same timed or all-day form",
    );
  }
  let reminders: number[] | undefined;
  if (item.reminders_minutes !== undefined) {
    if (
      !Array.isArray(item.reminders_minutes) ||
      item.reminders_minutes.length > 5
    ) {
      throw new Error("reminders_minutes must contain at most five values");
    }
    reminders = [
      ...new Set(item.reminders_minutes.map((value) => {
        if (
          typeof value !== "number" || !Number.isInteger(value) || value < 0 ||
          value > 40320
        ) {
          throw new Error(
            "reminders_minutes values must be integers from 0 to 40320",
          );
        }
        return value;
      })),
    ].sort((left, right) => right - left);
  }
  return {
    message_id: messageId,
    action: "upsert",
    event_key: eventKey,
    kind: kind as UpsertDecision["kind"],
    title: text(item.title, "title", 180),
    confidence,
    evidence,
    start,
    end,
    company: optionalText(item.company, "company", 180),
    project_hint: optionalText(item.project_hint, "project_hint", 300),
    location: optionalText(item.location, "location", 500),
    meeting_url: safeUrl(item.meeting_url, "meeting_url"),
    source_thread_id: sourceThreadId,
    description: optionalText(item.description, "description", 4000),
    reminders_minutes: reminders,
    needs_confirmation: item.needs_confirmation === true,
    cancelled: item.cancelled === true,
  };
}

function parseDecision(value: unknown): AgentDecision {
  const item = record(value, "decision");
  const messageId = text(item.message_id, "message_id", 256);
  const action = text(item.action, "action", 20);
  if (action === "ignore") {
    return {
      message_id: messageId,
      action,
      reason: text(item.reason, "reason", 500),
    };
  }
  if (action === "upsert") return parseUpsert(item, messageId);
  throw new Error(`Unsupported decision action: ${action}`);
}

export function parseEnvelope(value: unknown): DecisionEnvelope {
  const item = record(value, "decision envelope");
  if (item.schema_version !== 1) {
    throw new Error("Decision envelope schema_version must be 1");
  }
  if (!Array.isArray(item.decisions)) {
    throw new Error("decisions must be an array");
  }
  const decisions = item.decisions.map(parseDecision);
  const ids = decisions.map((decision) => decision.message_id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Each message_id may appear only once");
  }
  return {
    schema_version: 1,
    run_token: text(item.run_token, "run_token", 128),
    decisions,
  };
}
