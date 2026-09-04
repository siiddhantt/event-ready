export const SCHEMA_VERSION = 1;

export type PendingBatch = {
  token: string;
  created_at: string;
  next_cursor_epoch_seconds: number;
  message_ids: string[];
  thread_ids: Record<string, string>;
};

export type RouterState = {
  schema_version: 1;
  cursor_epoch_seconds: number | null;
  processed_message_ids: string[];
  pending: PendingBatch | null;
};

export type EventPoint =
  | { date: string }
  | { dateTime: string; timeZone: string };

export type IgnoreDecision = {
  message_id: string;
  action: "ignore";
  reason: string;
};

export type UpsertDecision = {
  message_id: string;
  action: "upsert";
  event_key: string;
  kind:
    | "meeting"
    | "interview"
    | "exam"
    | "assessment"
    | "test"
    | "appointment"
    | "registration"
    | "deadline";
  title: string;
  confidence: number;
  evidence: string[];
  start: EventPoint;
  end: EventPoint;
  company?: string;
  project_hint?: string;
  location?: string;
  meeting_url?: string;
  source_thread_id: string;
  description?: string;
  reminders_minutes?: number[];
  needs_confirmation?: boolean;
  cancelled?: boolean;
};

export type AgentDecision = IgnoreDecision | UpsertDecision;

export type DecisionEnvelope = {
  schema_version: 1;
  run_token: string;
  decisions: AgentDecision[];
};

export type CalendarEvent = {
  id?: unknown;
  summary?: unknown;
  description?: unknown;
  location?: unknown;
  htmlLink?: unknown;
  hangoutLink?: unknown;
  status?: unknown;
  start?: unknown;
  end?: unknown;
  extendedProperties?: unknown;
};

export type CalendarOperation = {
  message_id: string;
  event_key: string;
  action: "insert" | "patch";
  event_id: string;
  body: Record<string, unknown>;
};
