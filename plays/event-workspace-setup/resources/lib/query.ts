/** A small, transparent search grammar: date phrases + names, with no model call. */
export type SearchRequest = {
  raw: string;
  terms: string[];
  time_min: string;
  time_max: string;
  search_text: string;
  allow_past: boolean;
  past_first: boolean;
  project_only: boolean;
  meeting_only: boolean;
  label: string;
  status?: string;
};
const stop = new Set(
  "open show find search bring pull up get take me to my the that this a an whatever anything everything whats what is are was were i want wanna would like can could you please for on in at from of about and stuff event events meeting meetings project projects repo repository older old past previous last upcoming next all any with"
    .split(" "),
);
export function searchWords(text: string): string[] {
  return [
    ...new Set(
      text.replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2").toLocaleLowerCase()
        .normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [],
    ),
  ];
}
function day(date: Date, offset = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}
export function parseRequest(raw: string, now = new Date()): SearchRequest {
  if (raw.length > 500) {
    throw new Error("Keep the event request under 500 characters");
  }
  let text = raw.toLocaleLowerCase().replace(/[’']/g, "").trim();
  let start = new Date(now), end = day(now, 8), label = "Upcoming events";
  let dated = false, past = /\b(old|older|past|previous|last)\b/.test(text);
  const use = (pattern: RegExp, from: Date, until: Date, name: string) => {
    if (!pattern.test(text)) return false;
    start = from;
    end = until;
    label = name;
    dated = true;
    text = text.replace(pattern, " ");
    return true;
  };
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const [y, m, d] = iso.slice(1).map(Number);
    const date = new Date(y, m - 1, d);
    if (
      y < 1970 || y > 2100 || date.getFullYear() !== y ||
      date.getMonth() !== m - 1 || date.getDate() !== d
    ) throw new Error("Use a valid date such as 2025-09-01");
    use(/\b\d{4}-\d{2}-\d{2}\b/, date, day(date, 1), iso[0]);
  } else if (
    !use(/\b(?:today|tonight)\b/, day(now), day(now, 1), "Today") &&
    !use(/\btomorrow\b/, day(now, 1), day(now, 2), "Tomorrow") &&
    !use(/\byesterday\b/, day(now, -1), day(now), "Yesterday")
  ) {
    const relative = /\b(last|this|next) (week|month|year)\b/.exec(text);
    if (relative) {
      const offset = relative[1] === "last"
        ? -1
        : relative[1] === "next"
        ? 1
        : 0;
      const unit = relative[2];
      const monday = day(now, -((now.getDay() + 6) % 7));
      const from = unit === "week"
        ? day(monday, offset * 7)
        : unit === "month"
        ? new Date(now.getFullYear(), now.getMonth() + offset, 1)
        : new Date(now.getFullYear() + offset, 0, 1);
      const until = unit === "week"
        ? day(from, 7)
        : unit === "month"
        ? new Date(from.getFullYear(), from.getMonth() + 1, 1)
        : new Date(from.getFullYear() + 1, 0, 1);
      use(/\b(last|this|next) (week|month|year)\b/, from, until, relative[0]);
    } else {
      const weekdays = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const weekday =
        /\b(?:(last|this|next) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
          .exec(text);
      const months = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ];
      const month =
        /\b(january|february|march|april|may|june|july|august|september|october|november|december) (\d{4})\b/
          .exec(text);
      const year = /\b(19[7-9]\d|20\d\d|2100)\b/.exec(text);
      if (weekday) {
        const target = weekdays.indexOf(weekday[2]);
        let offset = (target - now.getDay() + 7) % 7;
        if (weekday[1] === "last") offset = offset === 0 ? -7 : offset - 7;
        if (weekday[1] === "next" && offset === 0) offset = 7;
        const from = day(now, offset);
        use(
          /\b(?:(last|this|next) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
          from,
          day(from, 1),
          weekday[0],
        );
      } else if (month) {
        const from = new Date(Number(month[2]), months.indexOf(month[1]), 1);
        use(
          /\b\w+ \d{4}\b/,
          from,
          new Date(from.getFullYear(), from.getMonth() + 1, 1),
          month[0],
        );
      } else if (year) {
        use(
          /\b(19[7-9]\d|20\d\d|2100)\b/,
          new Date(Number(year[0]), 0, 1),
          new Date(Number(year[0]) + 1, 0, 1),
          year[0],
        );
      }
    }
  }
  const terms = searchWords(text).filter((word) => !stop.has(word));
  if (!dated && (terms.length || past)) {
    start = new Date("1970-01-01T00:00:00Z");
    end = past
      ? now
      : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    label = past ? "Past events" : "Past and upcoming matches";
  }
  past = past || end.getTime() <= now.getTime();
  return {
    raw: raw.trim(),
    terms,
    time_min: start.toISOString(),
    time_max: end.toISOString(),
    search_text: terms.join(" "),
    allow_past: dated || past || terms.length > 0,
    past_first: past,
    project_only: /\b(project|repo|repository)\b/i.test(raw) &&
      !/\b(meeting|call|interview)\b/i.test(raw),
    meeting_only: /\bmeetings?\b/i.test(raw),
    label,
  };
}
export function matchesText(request: SearchRequest, value: string): boolean {
  const words = searchWords(value);
  return request.terms.every((term) =>
    words.some((word) =>
      word === term || (term.length > 2 && word.startsWith(term))
    )
  );
}
export function matchesEvent(
  request: SearchRequest,
  event: Record<string, unknown>,
): boolean {
  if (event.id === request.raw) return true;
  const start = event.start as { dateTime?: string; date?: string } | undefined;
  const end = event.end as { dateTime?: string; date?: string } | undefined;
  const instant = (value?: { dateTime?: string; date?: string }) =>
    value?.dateTime
      ? Date.parse(value.dateTime)
      : value?.date
      ? new Date(`${value.date}T00:00:00`).getTime()
      : NaN;
  const begins = instant(start), ends = instant(end);
  if (
    !(begins < Date.parse(request.time_max)) ||
    (Number.isFinite(ends)
      ? ends <= Date.parse(request.time_min)
      : begins < Date.parse(request.time_min))
  ) return false;
  if (
    request.meeting_only && !event.hangoutLink && !event.conferenceData &&
    !/\b(meeting|call|interview|sync|standup|session)\b/i.test(
      String(event.summary),
    )
  ) return false;
  return matchesText(
    request,
    [
      event.summary,
      event.description,
      event.location,
      JSON.stringify(event.extendedProperties ?? {}),
      JSON.stringify(event.attendees ?? []),
      JSON.stringify(event.organizer ?? {}),
    ].join(" "),
  );
}
