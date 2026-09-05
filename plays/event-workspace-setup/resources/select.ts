import { parseConfig } from "./lib/config.ts";
import { buildWorkspacePlan } from "./lib/match.ts";
import { Repository } from "./lib/repositories.ts";
import { basename, dirname, join, resolve } from "node:path";
import { PromptCancelled, Terminal } from "./lib/terminal.ts";
import { chooseWorkspace, eligibleEvents } from "./lib/choose-workspace.ts";

const [
  configurationRaw = "",
  eventsRaw = "[]",
  repositoriesRaw = "{}",
  eventId = "",
  project = "",
  dryRun = "false",
] = Deno.args;
const wrapper = JSON.parse(configurationRaw) as Record<string, unknown>;
if (wrapper.status === "needs_setup" || wrapper.status === "cancelled") {
  console.log(JSON.stringify(wrapper));
  Deno.exit(0);
}
const config = parseConfig(wrapper.config);
const eventsResponse = JSON.parse(eventsRaw) as unknown;
if (
  eventsResponse && !Array.isArray(eventsResponse) &&
  typeof eventsResponse === "object" &&
  (eventsResponse as Record<string, unknown>).nextPageToken
) {
  throw new Error(
    "Calendar returned more than 2500 events this week; use a less crowded primary calendar",
  );
}
const events =
  (Array.isArray(eventsResponse)
    ? eventsResponse
    : eventsResponse && typeof eventsResponse === "object" &&
        Array.isArray((eventsResponse as Record<string, unknown>).items)
    ? (eventsResponse as Record<string, unknown>).items
    : []) as Record<string, unknown>[];
const repositoryWrapper = JSON.parse(repositoriesRaw) as Record<
  string,
  unknown
>;
const repositories = Array.isArray(repositoryWrapper.repositories)
  ? repositoryWrapper.repositories as Repository[]
  : [];
if (repositoryWrapper.capped && !project) {
  throw new Error(
    "Repository scan was capped; choose a narrower project folder with mode=setup or provide project",
  );
}
const projectPath = project
  ? await Deno.realPath(project).catch(async (error) => {
    if (error instanceof Deno.errors.NotFound) {
      const requested = resolve(project);
      const canonical = join(
        await Deno.realPath(dirname(requested)),
        basename(requested),
      );
      if (config.projects?.some((p) => p.path === canonical)) return canonical;
    }
    throw error;
  })
  : "";
const terminal = Terminal.open();
let plan: Record<string, unknown>;
if (terminal) {
  try {
    plan = await chooseWorkspace(
      terminal,
      config,
      events,
      repositories,
      eventId,
      projectPath,
      dryRun === "true",
    );
  } catch (error) {
    if (!(error instanceof PromptCancelled)) throw error;
    plan = { status: "cancelled" };
  } finally {
    terminal.close();
  }
} else if (eventId) {
  const matches = eligibleEvents(config, events, eventId);
  plan = matches.length > 1
    ? {
      status: "needs_choice",
      choices: matches.map((e) => ({
        id: e.id,
        title: e.summary,
        start: e.start,
      })),
    }
    : buildWorkspacePlan(
      config,
      matches,
      repositories,
      String(matches[0]?.id ?? eventId),
      projectPath,
    );
} else {plan = buildWorkspacePlan(
    config,
    events,
    repositories,
    eventId,
    projectPath,
  );}
console.log(
  JSON.stringify({
    ...plan,
    repository_scan: {
      count: repositories.length,
      capped: repositoryWrapper.capped === true,
      visited_directories: repositoryWrapper.visited_directories ?? null,
    },
  }),
);
