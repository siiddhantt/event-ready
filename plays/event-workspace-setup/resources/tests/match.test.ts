import { WorkspaceConfig } from "../lib/config.ts";
import { buildWorkspacePlan } from "../lib/match.ts";
import { Repository } from "../lib/repositories.ts";
import { assertEquals, assertThrows } from "./assert.ts";

const config: WorkspaceConfig = {
  schema_version: 1,
  roots: ["/projects"],
  editor: { kind: "code", command: "code" },
  browser: "default",
  mappings: {},
};

const event = {
  id: "event-1",
  status: "confirmed",
  summary: "Acme Rocket interview",
  start: { dateTime: "2026-09-08T10:00:00+05:30" },
  end: { dateTime: "2026-09-08T11:00:00+05:30" },
  hangoutLink: "https://meet.google.com/abc-defg-hij",
  extendedProperties: {
    private: {
      eventReadyCompany: "Acme",
      eventReadyProjectHint: "rocket",
      eventReadySourceThread: "thread-1",
    },
  },
};

const repos: Repository[] = [
  {
    name: "rocket",
    path: "/projects/rocket",
    remote: "git@github.com:acme/rocket.git",
    web_url: "https://github.com/acme/rocket",
  },
  { name: "website", path: "/projects/website", remote: null, web_url: null },
];

Deno.test("selects the next event and a confident repository", () => {
  const result = buildWorkspacePlan(
    config,
    [event],
    repos,
    "",
    "",
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals(result.status, "ready");
  assertEquals((result.project as Repository).path, "/projects/rocket");
  assertEquals(result.links, [
    "https://meet.google.com/abc-defg-hij",
    "https://github.com/acme/rocket",
    "https://mail.google.com/mail/u/0/#all/thread-1",
  ]);
});

Deno.test("does not guess between equal repositories", () => {
  const equal = [
    {
      name: "acme-one",
      path: "/projects/acme-one",
      remote: null,
      web_url: null,
    },
    {
      name: "acme-two",
      path: "/projects/acme-two",
      remote: null,
      web_url: null,
    },
  ];
  const result = buildWorkspacePlan(
    config,
    [{ ...event, summary: "Acme event", extendedProperties: { private: {} } }],
    equal,
    "",
    "",
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals(result.status, "ambiguous");
  assertEquals(result.links, []);
});

Deno.test("returns choices when the leading match is not decisive", () => {
  const close = [
    {
      name: "acme",
      path: "/projects/acme",
      remote: "git@github.com:other/rocket.git",
      web_url: "https://github.com/other/rocket",
    },
    {
      name: "rocket",
      path: "/projects/rocket",
      remote: null,
      web_url: null,
    },
  ];
  const result = buildWorkspacePlan(
    config,
    [event],
    close,
    "",
    "",
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals(result.status, "ambiguous");
  assertEquals((result.choices as unknown[]).length, 2);
});

Deno.test("skips unrelated Calendar entries during automatic selection", () => {
  const unrelated = {
    id: "lunch",
    status: "confirmed",
    summary: "Lunch",
    start: { dateTime: "2026-09-08T09:00:00+05:30" },
    end: { dateTime: "2026-09-08T09:30:00+05:30" },
  };
  const result = buildWorkspacePlan(
    config,
    [unrelated, event],
    repos,
    "",
    "",
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals((result.event as Record<string, unknown>).id, "event-1");
});

Deno.test("rejects an explicit project outside approved roots", () => {
  assertThrows(
    () =>
      buildWorkspacePlan(
        config,
        [event],
        repos,
        "",
        "/outside/repo",
        new Date("2026-09-01T00:00:00Z"),
      ),
    "outside approved roots",
  );
});

Deno.test("does not open non-HTTPS event links", () => {
  const result = buildWorkspacePlan(
    config,
    [{ ...event, hangoutLink: "javascript:alert(1)" }],
    repos,
    "",
    "",
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals((result.event as Record<string, unknown>).meeting_url, null);
});

Deno.test("does not treat arbitrary description URLs as launch targets", () => {
  const result = buildWorkspacePlan(
    config,
    [{
      id: "generic",
      status: "confirmed",
      summary: "Generic appointment",
      description: "Open https://example.test/untrusted",
      start: { dateTime: "2026-09-08T10:00:00+05:30" },
      end: { dateTime: "2026-09-08T11:00:00+05:30" },
    }],
    [],
    "generic",
    "",
    new Date("2026-09-01T00:00:00Z"),
  );
  assertEquals(result.links, []);
});
