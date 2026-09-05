import { parseConfig } from "./lib/config.ts";
import { buildWorkspacePlan } from "./lib/match.ts";
import { Repository } from "./lib/repositories.ts";

const [
  configurationRaw = "",
  eventsRaw = "[]",
  repositoriesRaw = "{}",
  eventId = "",
  project = "",
  remember = "false",
] = Deno.args;
if (remember === "true" && !project) {
  throw new Error("remember=true requires an explicit project override");
}
const wrapper = JSON.parse(configurationRaw) as Record<string, unknown>;
const config = parseConfig(wrapper.config);
const eventsResponse = JSON.parse(eventsRaw) as unknown;
if (
  eventsResponse && !Array.isArray(eventsResponse) &&
  typeof eventsResponse === "object" &&
  (eventsResponse as Record<string, unknown>).nextPageToken
) throw new Error("Calendar event list is incomplete; shorten horizon_hours");
const events = Array.isArray(eventsResponse)
  ? eventsResponse
  : eventsResponse && typeof eventsResponse === "object" &&
      Array.isArray((eventsResponse as Record<string, unknown>).items)
  ? (eventsResponse as Record<string, unknown>).items
  : [];
const repositoryWrapper = JSON.parse(repositoriesRaw) as Record<
  string,
  unknown
>;
const repositories = Array.isArray(repositoryWrapper.repositories)
  ? repositoryWrapper.repositories as Repository[]
  : [];
if (repositoryWrapper.capped && !project) {
  throw new Error(
    "Repository scan was capped; narrow project_roots or provide an explicit project",
  );
}
const projectPath = project
  ? await Deno.realPath(project).catch((error) => {
    if (
      error instanceof Deno.errors.NotFound &&
      config.projects?.some((p) => p.path === project)
    ) return project;
    throw error;
  })
  : "";
const plan = buildWorkspacePlan(
  config,
  events,
  repositories,
  eventId,
  projectPath,
);
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
