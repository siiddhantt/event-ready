import { assertEquals, assertThrows } from "./assert.ts";
import { matchesEvent, matchesText, parseRequest } from "../lib/query.ts";
import {
  chooseWorkspace,
  eligibleEvents,
  matchingRepositories,
} from "../lib/choose-workspace.ts";
import { WorkspaceConfig } from "../lib/config.ts";
import { buildWorkspacePlan } from "../lib/match.ts";
const now = new Date(2026, 8, 5, 15, 30);
const config: WorkspaceConfig = {
  schema_version: 1,
  roots: ["/projects"],
  editor: { kind: "code", command: "code" },
  browser: "default",
  mappings: {},
};
const meeting = {
  id: "old",
  summary: "Galaxy AI planning call",
  start: { dateTime: new Date(2025, 8, 4, 10).toISOString() },
  end: { dateTime: new Date(2025, 8, 4, 11).toISOString() },
  hangoutLink: "https://meet.google.com/abc-defg-hij",
};

Deno.test("whatever is today uses local day boundaries and retains earlier meetings today", () => {
  const query = parseRequest("whatever is today", now);
  assertEquals(query.terms, []);
  assertEquals(query.time_min, new Date(2026, 8, 5).toISOString());
  assertEquals(query.time_max, new Date(2026, 8, 6).toISOString());
  assertEquals(query.allow_past, true);
  assertEquals(
    matchesEvent(query, {
      ...meeting,
      start: { dateTime: new Date(2026, 8, 5, 9).toISOString() },
      end: { dateTime: new Date(2026, 8, 5, 10).toISOString() },
    }),
    true,
  );
  assertEquals(matchesEvent(query, meeting), false);
});
Deno.test("named project requests remove conversational filler and match spaced or hyphenated names", () => {
  const query = parseRequest("can you open that galaxy ai project please", now);
  assertEquals(query.terms, ["galaxy", "ai"]);
  assertEquals(query.project_only, true);
  assertEquals(
    parseRequest("that event ready project", now).project_only,
    true,
  );
  assertEquals(matchesText(query, "galaxy-ai"), true);
  assertEquals(matchesText(query, "GalaxyAI"), true);
  assertEquals(matchesText(query, "galaxy-events"), false);
});
Deno.test("named meeting searches include old events without opening cancelled events", () => {
  const query = parseRequest("open that older galaxy ai meeting", now);
  assertEquals(query.time_min, "1970-01-01T00:00:00.000Z");
  assertEquals(query.time_max, now.toISOString());
  assertEquals(
    eligibleEvents(
      config,
      [meeting, { ...meeting, id: "cancelled", status: "cancelled" }],
      query.raw,
      now,
      query,
    ).map((e) => e.id),
    ["old"],
  );
  assertEquals(
    buildWorkspacePlan(config, [meeting], [], "old", "", now).status,
    "no_event",
  );
});
Deno.test("last month, last year and named month requests have bounded ranges", () => {
  const month = parseRequest("Faff last month", now);
  assertEquals(month.terms, ["faff"]);
  assertEquals(month.time_min, new Date(2026, 7, 1).toISOString());
  assertEquals(month.time_max, new Date(2026, 8, 1).toISOString());
  assertEquals(
    parseRequest("last year", now).time_min,
    new Date(2025, 0, 1).toISOString(),
  );
  assertEquals(
    parseRequest("galaxy ai September 2025", now).time_min,
    new Date(2025, 8, 1).toISOString(),
  );
});
Deno.test("last Friday resolves to the prior local Friday and invalid dates fail", () => {
  assertEquals(
    parseRequest("last Friday", now).time_min,
    new Date(2026, 8, 4).toISOString(),
  );
  assertEquals(
    parseRequest("2025-09-04", now).time_max,
    new Date(2025, 8, 5).toISOString(),
  );
  assertThrows(() => parseRequest("2025-02-30", now), "valid date");
});
Deno.test("Calendar title and description search tolerates punctuation", () => {
  const query = parseRequest("Galaxy AI", now);
  assertEquals(
    matchesEvent(query, { ...meeting, summary: "Galaxy-AI planning" }),
    true,
  );
  assertEquals(
    matchesEvent(query, {
      ...meeting,
      summary: "Team catchup",
      description: "Galaxy AI project",
    }),
    true,
  );
});
Deno.test("an old meeting can be selected without saving a fabricated association", async () => {
  const query = parseRequest("galaxy ai September 2025", now);
  const plan = await chooseWorkspace(
    {
      write() {},
      choose() {
        return 0;
      },
      ask() {
        throw new Error("No URL should be needed");
      },
    },
    config,
    [meeting],
    [],
    query.raw,
    "",
    true,
    query,
  );
  assertEquals(plan.status, "ready");
  assertEquals((plan.event as { id: string }).id, "old");
  assertEquals(plan.links, [meeting.hangoutLink]);
  assertEquals(plan.configuration_updated, undefined);
});
Deno.test("a named repository works without any Calendar event and clearly identifies its source", async () => {
  const query = parseRequest("that galaxy ai project", now);
  const repo = {
    name: "galaxy-ai",
    path: "/projects/galaxy-ai",
    remote: null,
    web_url: null,
  };
  assertEquals(matchingRepositories([repo], query).length, 1);
  const plan = await chooseWorkspace(
    {
      write() {},
      choose() {
        return 0;
      },
      ask() {
        throw new Error("Unexpected prompt");
      },
    },
    config,
    [],
    [repo],
    query.raw,
    "",
    true,
    query,
  );
  assertEquals(plan.status, "ready");
  assertEquals((plan.event as { source: string }).source, "local_repository");
  assertEquals((plan.event as { id: unknown }).id, null);
  assertEquals((plan.project as { path: string }).path, repo.path);
  assertEquals(plan.configuration_updated, undefined);
});
Deno.test("known meeting links in location or description open without following arbitrary links", () => {
  const event = {
    ...meeting,
    hangoutLink: undefined,
    location: "Join https://us06web.zoom.us/j/123456789",
  };
  const plan = buildWorkspacePlan(config, [event], [], "old", "", now, true);
  assertEquals(plan.links, ["https://us06web.zoom.us/j/123456789"]);
  const fake = {
    ...event,
    location: "https://zoom.us.attacker.example/j/123",
    description: "https://other.example/",
  };
  assertEquals(
    buildWorkspacePlan(config, [fake], [], "old", "", now, true).links,
    [],
  );
});

Deno.test("a shared word cannot associate an employer with an unrelated repository", () => {
  const event = {
    ...meeting,
    summary: "Harness Software Engineer application",
    extendedProperties: { private: { eventReadyCompany: "Harness" } },
  };
  const repo = {
    name: "agent-harness-hackathon",
    path: "/projects/agent-harness-hackathon",
    remote: null,
    web_url: null,
  };
  const plan = buildWorkspacePlan(
    config,
    [event],
    [repo],
    "old",
    "",
    now,
    true,
  );
  assertEquals(plan.project, null);
});
