type Header = { name?: unknown; value?: unknown };
type Part = {
  mimeType?: unknown;
  filename?: unknown;
  body?: { data?: unknown; attachmentId?: unknown };
  parts?: unknown;
};

export type GmailMessage = {
  id?: unknown;
  threadId?: unknown;
  internalDate?: unknown;
  snippet?: unknown;
  payload?: Part & { headers?: unknown };
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0)),
    );
  } catch {
    return "";
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function collectParts(
  part: Part | undefined,
  plain: string[],
  html: string[],
  unavailable: string[],
): void {
  if (!part) return;
  const mime = typeof part.mimeType === "string"
    ? part.mimeType.toLowerCase()
    : "";
  const filename = typeof part.filename === "string" ? part.filename : "";
  const data = typeof part.body?.data === "string"
    ? decodeBase64Url(part.body.data)
    : "";
  if ((mime === "text/plain" || mime === "text/calendar") && data) {
    plain.push(data);
  }
  if (mime === "text/html" && data) html.push(stripHtml(data));
  if (typeof part.body?.attachmentId === "string") {
    unavailable.push(filename || mime || "attachment");
  }
  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      collectParts(child as Part, plain, html, unavailable);
    }
  }
}

function header(headers: Header[], name: string): string | null {
  const found = headers.find((item) =>
    typeof item.name === "string" &&
    item.name.toLowerCase() === name.toLowerCase()
  );
  return typeof found?.value === "string" ? found.value : null;
}

function cleanBody(value: string): { text: string; truncated: boolean } {
  const cleaned = value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(
    /\n{3,}/g,
    "\n\n",
  ).trim();
  return { text: cleaned.slice(0, 16000), truncated: cleaned.length > 16000 };
}

function messageBody(plain: string[], html: string[]): {
  text: string;
  truncated: boolean;
} {
  return cleanBody((plain.length > 0 ? plain : html).join("\n\n"));
}

export function normalizeMessage(
  message: GmailMessage,
): Record<string, unknown> | null {
  if (!message || typeof message !== "object") return null;
  if (typeof message.id !== "string") return null;
  const headers = Array.isArray(message.payload?.headers)
    ? message.payload.headers as Header[]
    : [];
  const plain: string[] = [];
  const html: string[] = [];
  const unavailable: string[] = [];
  collectParts(message.payload, plain, html, unavailable);
  const body = messageBody(plain, html);
  return {
    message_id: message.id,
    thread_id: typeof message.threadId === "string" ? message.threadId : null,
    subject: header(headers, "Subject") ?? "(No subject)",
    from: header(headers, "From") ?? "(Unknown sender)",
    to: header(headers, "To"),
    date: header(headers, "Date"),
    internal_date_ms: typeof message.internalDate === "string" &&
        Number.isFinite(Number(message.internalDate))
      ? Number(message.internalDate)
      : null,
    body: body.text ||
      (typeof message.snippet === "string" ? message.snippet : ""),
    body_truncated: body.truncated,
    unavailable_parts: unavailable,
  };
}

export function normalizeCalendarEvents(
  value: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((event) => {
    if (!event || typeof event !== "object") return [];
    const item = event as Record<string, unknown>;
    if (typeof item.id !== "string") return [];
    const extended = item.extendedProperties as
      | Record<string, unknown>
      | undefined;
    const privateValues = extended?.private;
    const eventReadyValues = privateValues && typeof privateValues === "object"
      ? Object.fromEntries(
        Object.entries(privateValues as Record<string, unknown>).filter(
          ([key, field]) =>
            key.startsWith("eventReady") && typeof field === "string",
        ),
      )
      : {};
    return [{
      id: item.id,
      title: typeof item.summary === "string" ? item.summary : "Untitled event",
      status: typeof item.status === "string" ? item.status : null,
      start: item.start ?? null,
      end: item.end ?? null,
      location: typeof item.location === "string" ? item.location : null,
      meeting_url: typeof item.hangoutLink === "string"
        ? item.hangoutLink
        : null,
      description: typeof item.description === "string"
        ? item.description.slice(0, 4000)
        : null,
      event_ready: eventReadyValues,
    }];
  });
}
