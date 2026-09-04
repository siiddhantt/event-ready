import { isWithin, mappingKey, WorkspaceConfig } from "./config.ts";
import { Repository } from "./repositories.ts";

type CalendarEvent = {
  id?: unknown;
  status?: unknown;
  summary?: unknown;
  description?: unknown;
  location?: unknown;
  htmlLink?: unknown;
  hangoutLink?: unknown;
  start?: unknown;
  end?: unknown;
  extendedProperties?: unknown;
  conferenceData?: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tokens(value: string): string[] {
  const ignored = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "your",
    "meeting",
    "interview",
    "test",
    "assessment",
    "event",
  ]);
  return [
    ...new Set(
      value.toLowerCase().split(/[^a-z0-9]+/).filter((token) =>
        token.length >= 3 && !ignored.has(token)
      ),
    ),
  ];
}

function eventStart(event: CalendarEvent): number | null {
  const start = event.start as Record<string, unknown> | undefined;
  const date = text(start?.date);
  const raw = text(start?.dateTime) ?? (date ? `${date}T00:00:00Z` : null);
  const value = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(value) ? value : null;
}

function privateValues(event: CalendarEvent): Record<string, unknown> {
  const extended = event.extendedProperties as
    | Record<string, unknown>
    | undefined;
  const values = extended?.private;
  return values && typeof values === "object"
    ? values as Record<string, unknown>
    : {};
}

function safeHttps(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

function conferenceUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const entries = (value as Record<string, unknown>).entryPoints;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const url = safeHttps((entry as Record<string, unknown>).uri);
    if (url) return url;
  }
  return null;
}

function isRelevant(event: CalendarEvent): boolean {
  const values = privateValues(event);
  const suiteOwned = Object.keys(values).some((key) =>
    key.startsWith("eventReady")
  );
  return suiteOwned || safeHttps(event.hangoutLink) !== null ||
    conferenceUrl(event.conferenceData) !== null;
}

function scoreRepository(
  repo: Repository,
  hints: string[],
  mappedPath: string | null,
): number {
  if (mappedPath === repo.path) return 100;
  const haystack = `${repo.name} ${repo.remote ?? ""}`.toLowerCase();
  return hints.reduce(
    (score, hint) =>
      score +
      (haystack.includes(hint)
        ? (repo.name.toLowerCase().includes(hint) ? 3 : 1)
        : 0),
    0,
  );
}

export function buildWorkspacePlan(
  config: WorkspaceConfig,
  eventsValue: unknown,
  repositories: Repository[],
  eventId: string,
  projectOverride: string,
  now = new Date(),
): Record<string, unknown> {
  const events = Array.isArray(eventsValue)
    ? eventsValue as CalendarEvent[]
    : [];
  const selected = events
    .filter((event) =>
      event.status !== "cancelled" && eventStart(event) !== null &&
      eventStart(event)! >= now.getTime() &&
      (eventId ? event.id === eventId : isRelevant(event))
    )
    .sort((left, right) => eventStart(left)! - eventStart(right)!)
    .at(0);
  if (!selected) return { status: "no_event", event_id: eventId || null };
  const values = privateValues(selected);
  const company = text(values.eventReadyCompany) ?? "";
  const projectHint = text(values.eventReadyProjectHint) ?? "";
  const title = text(selected.summary) ?? "Untitled event";
  const key = mappingKey(company || title);
  const mappedPath = config.mappings[key] ?? null;
  let chosen: Repository | null = null;
  let candidates: Array<Repository & { score: number }> = [];
  if (projectOverride) {
    if (!isWithin(projectOverride, config.roots)) {
      throw new Error("project override is outside approved roots");
    }
    chosen = repositories.find((repo) => repo.path === projectOverride) ?? null;
    if (!chosen) {
      throw new Error("project override is not a discovered Git repository");
    }
  } else {
    const hints = tokens(`${company} ${projectHint} ${title}`);
    candidates = repositories.map((repo) => ({
      ...repo,
      score: scoreRepository(repo, hints, mappedPath),
    }))
      .filter((repo) => repo.score > 0)
      .sort((left, right) =>
        right.score - left.score || left.path.localeCompare(right.path)
      );
    if (
      candidates[0] && candidates[0].score >= 2 &&
      (!candidates[1] || candidates[0].score - candidates[1].score >= 2)
    ) {
      chosen = candidates[0];
    }
  }
  const meetingUrl = safeHttps(values.eventReadyMeetingUrl) ??
    safeHttps(selected.hangoutLink) ?? conferenceUrl(selected.conferenceData);
  const sourceMessage = text(values.eventReadySourceThread) ||
    text(values.eventReadySourceMessage);
  const sourceEmailUrl = sourceMessage
    ? `https://mail.google.com/mail/u/0/#all/${
      encodeURIComponent(sourceMessage)
    }`
    : null;
  const links = [
    ...new Set(
      [meetingUrl, chosen?.web_url ?? null, sourceEmailUrl].filter((
        value,
      ): value is string => typeof value === "string"),
    ),
  ];
  const event = {
    id: text(selected.id),
    title,
    start: selected.start ?? null,
    end: selected.end ?? null,
    company: company || null,
    meeting_url: meetingUrl,
    calendar_url: safeHttps(selected.htmlLink),
    source_email_url: sourceEmailUrl,
  };
  if (!chosen && candidates.length > 0) {
    return {
      status: "ambiguous",
      event,
      mapping_key: key,
      choices: candidates.slice(0, 5),
      links: [],
    };
  }
  return { status: "ready", event, mapping_key: key, project: chosen, links };
}
