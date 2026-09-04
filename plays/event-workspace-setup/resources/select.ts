import { parseConfig } from "./lib/config.ts";
import { buildWorkspacePlan } from "./lib/match.ts";
import { Repository } from "./lib/repositories.ts";

const [
  configurationRaw = "",
  eventsRaw = "[]",
  repositoriesRaw = "{}",
  eventId = "",
  project = "",
] = Deno.args;
const wrapper = JSON.parse(configurationRaw) as Record<string, unknown>;
const config = parseConfig(wrapper.config);
const eventsResponse = JSON.parse(eventsRaw) as unknown;
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
const projectPath = project ? await Deno.realPath(project) : "";
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
