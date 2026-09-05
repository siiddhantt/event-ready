import { basename, join } from "node:path";
import {
  isWithin,
  repositoryUrl,
  WorkspaceConfig,
  writeConfig,
} from "./config.ts";
import { buildWorkspacePlan } from "./match.ts";
import { githubWebUrl, Repository } from "./repositories.ts";
import { Prompts } from "./terminal.ts";
import { githubProfile } from "./onboarding.ts";

import {
  matchesEvent,
  matchesText,
  parseRequest,
  SearchRequest,
} from "./query.ts";

type Event = Record<string, unknown>;
export function eligibleEvents(
  config: WorkspaceConfig,
  events: Event[],
  query = "",
  now = new Date(),
  request = parseRequest(query, now),
): Event[] {
  return events.filter((event) =>
    typeof event.id === "string" && matchesEvent(request, event) &&
    buildWorkspacePlan(
        config,
        [event],
        [],
        String(event.id),
        "",
        now,
        request.allow_past,
      ).status === "ready"
  )
    .sort((a, b) => {
      const start = (e: Event) => {
        const s = e.start as { dateTime?: string; date?: string };
        return Date.parse(s.dateTime ?? s.date ?? "");
      };
      const left = start(a), right = start(b);
      if (request.past_first) return right - left;
      const leftPast = left < now.getTime(), rightPast = right < now.getTime();
      if (leftPast !== rightPast) return leftPast ? 1 : -1;
      return leftPast ? right - left : left - right;
    });
}
export function matchingRepositories(
  repos: Repository[],
  request: SearchRequest,
): Repository[] {
  return request.terms.length
    ? repos.filter((repo) =>
      matchesText(request, `${repo.name} ${repo.remote ?? ""}`)
    )
    : [];
}
export function repositoryPlan(
  config: WorkspaceConfig,
  repo: Repository | null,
  fallback: Repository,
): Record<string, unknown> {
  if (repo && !isWithin(repo.path, config.roots)) {
    throw new Error("Repository is outside approved roots");
  }
  const selected = repo ?? fallback;
  return {
    status: "ready",
    event: { id: null, title: selected.name, source: "local_repository" },
    mapping_key: `workspace:${selected.path}`,
    project: repo,
    links: selected.web_url ? [selected.web_url] : [],
    preparation: {
      kind: "project",
      reason: repo
        ? "Found this repository in your saved project folder."
        : "Opening the repository website.",
    },
  };
}
export function eventLabel(event: Event): string {
  const start = event.start as { dateTime?: string; date?: string };
  const when = start.dateTime
    ? new Date(start.dateTime).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    : start.date ?? "";
  return `${when} · ${String(event.summary ?? "Untitled event")}`;
}

export async function saveAssociation(
  config: WorkspaceConfig,
  plan: Record<string, unknown>,
  repo: Repository,
  install: boolean,
  persist = true,
): Promise<void> {
  if (typeof plan.mapping_key !== "string" || !plan.mapping_key) {
    throw new Error("Event has no association key");
  }
  config.mappings[plan.mapping_key] = repo.path;
  if (repo.remote) {
    try {
      const url = repositoryUrl(
        repo.remote.replace(/^git@github.com:/, "https://github.com/"),
      );
      config.projects = [
        ...(config.projects ?? []).filter((p) => p.path !== repo.path),
        {
          ...config.projects?.find((p) => p.path === repo.path),
          path: repo.path,
          repository_url: url,
          install_dependencies: install,
        },
      ];
    } catch (error) {
      if (install) throw error;
    }
  }
  if (persist) await writeConfig(config);
}

async function cloneChoice(
  terminal: Prompts,
  config: WorkspaceConfig,
): Promise<Repository | null> {
  if (!config.roots.length) {
    terminal.write("Choose a project folder in setup before cloning.\n");
    return null;
  }
  const profile = await githubProfile();
  let url = "";
  let repos: Array<{ name: string; clone_url: string }> = [];
  if (profile.login) {
    try {
      const response = await fetch(
        `https://api.github.com/users/${
          encodeURIComponent(profile.login)
        }/repos?sort=updated&per_page=50`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (response.ok) {
        const value = await response.json();
        if (Array.isArray(value)) {
          repos = value.filter((r) =>
            typeof r?.name === "string" && typeof r?.clone_url === "string"
          );
        }
      }
    } catch { /* Manual URL remains available when discovery is offline. */ }
  }
  if (repos.length) {
    const choice = await terminal.choose("Repository to clone", [
      ...repos.map((r) => r.name),
      "Enter a repository URL",
      "Back",
    ]);
    if (choice === repos.length + 1) return null;
    if (choice < repos.length) url = repos[choice].clone_url;
  }
  while (!url) {
    const answer = await terminal.ask(
      "GitHub repository (owner/name or HTTPS URL; blank to go back)",
    );
    if (!answer) return null;
    try {
      url = repositoryUrl(
        answer.includes("://") ? answer : `https://github.com/${answer}`,
      );
    } catch {
      terminal.write("Enter a GitHub repository URL or owner/name.\n");
    }
  }
  const remote = repositoryUrl(url);
  const folder = config.roots.length === 1
    ? config.roots[0]
    : config.roots[await terminal.choose("Clone into", config.roots)];
  const name = basename(new URL(remote).pathname).replace(/\.git$/, "");
  const path = join(folder, name);
  const exists = await Deno.stat(path).catch(() => null);
  if (exists) {
    terminal.write(
      "That destination already exists. Choose it from your local repositories instead.\n",
    );
    return null;
  }
  return { name, path, remote, web_url: githubWebUrl(remote), missing: true };
}

export async function chooseWorkspace(
  terminal: Prompts,
  config: WorkspaceConfig,
  events: Event[],
  repos: Repository[],
  query: string,
  project: string,
  dryRun: boolean,
  request = parseRequest(query),
): Promise<Record<string, unknown>> {
  const available = request.project_only
    ? []
    : eligibleEvents(config, events, query, new Date(), request);
  let selected: Event | undefined;
  let standalone: Repository | undefined;
  if (available.length) {
    const index = query && available.length === 1 ? 0 : await terminal.choose(
      "Which event do you want to open?",
      available.map(eventLabel),
    );
    selected = available[index];
  } else {
    const matches = matchingRepositories(repos, request);
    if (!matches.length) return { status: "no_event", request };
    terminal.write(
      "No Calendar event selected; found matching local projects.\n",
    );
    standalone = matches.length === 1 ? matches[0] : matches[
      await terminal.choose(
        "Which project?",
        matches.map((r) => `${r.name} · ${r.path}`),
      )
    ];
  }
  const makePlan = (
    cfg: WorkspaceConfig,
    inventory: Repository[],
    path: string,
  ): Record<string, unknown> =>
    standalone
      ? repositoryPlan(
        cfg,
        path ? inventory.find((r) => r.path === path) ?? null : null,
        standalone,
      )
      : buildWorkspacePlan(
        cfg,
        [selected],
        inventory,
        String(selected!.id),
        path,
        new Date(),
        request.allow_past,
      );
  let plan = makePlan(config, repos, project || standalone?.path || "");
  let repo = plan.project as Repository | null;
  const approved = repo && config.projects?.some((p) => p.path === repo!.path);
  const saved = repo && config.mappings[String(plan.mapping_key)] === repo.path;
  if (!project && saved) return plan;
  const links = Array.isArray(plan.links) ? plan.links : [];
  const options = repo
    ? [
      `Prepare ${repo.name} and remember this choice`,
      standalone ? "Open repository website only" : "Open event links only",
      "Choose another local repository",
      "Clone a repository",
    ]
    : [
      `Open ${links.length ? "event links" : "Calendar details"}${
        (plan.preparation as { kind?: string })?.kind === "interview" &&
          config.portfolio_url
          ? " + portfolio"
          : ""
      }`,
      "Choose a local repository",
      "Clone a repository",
    ];
  const action = await terminal.choose(
    String((plan.event as Event).title),
    options,
  );
  if ((repo && action === 1) || (!repo && action === 0)) {
    plan = makePlan({ ...config, mappings: {} }, [], "");
    return plan;
  }
  const chooseLocal = repo ? action === 2 : action === 1;
  const chooseClone = repo ? action === 3 : action === 2;
  if (chooseLocal) {
    if (!repos.length) {
      terminal.write(
        "No local repositories were found; opening event materials.\n",
      );
      return makePlan(config, [], "");
    }
    repo = repos[
      await terminal.choose(
        "Local repository",
        repos.map((r) => `${r.name} · ${r.path}`),
      )
    ];
  } else if (chooseClone) repo = await cloneChoice(terminal, config);
  if (!repo) {
    return makePlan(config, [], "");
  }
  let install =
    config.projects?.find((p) => p.path === repo!.path)?.install_dependencies ??
      false;
  let supportedOrigin = false;
  try {
    repositoryUrl(
      (repo.remote ?? "").replace(/^git@github.com:/, "https://github.com/"),
    );
    supportedOrigin = true;
  } catch { /* Existing local repos can still open. */ }
  if (supportedOrigin && (!approved || chooseLocal || chooseClone)) {
    const action = await terminal.choose(
      `Prepare ${repo.name}? Dependency installation can run this repository's scripts.`,
      [
        "Install dependencies and open",
        "Open without installing",
        "Use event links instead",
      ],
    );
    if (action === 2) {
      return makePlan(config, [], "");
    }
    install = action === 0;
  } else if (!supportedOrigin) {
    terminal.write(
      "Opening this local repository without dependency installation (no GitHub origin).\n",
    );
  }
  plan = makePlan(
    config,
    [...repos.filter((r) => r.path !== repo!.path), repo],
    repo.path,
  );
  const preparationConfig = structuredClone(config);
  await saveAssociation(preparationConfig, plan, repo, install, !dryRun);
  plan.preparation_config = preparationConfig;
  if (!dryRun) plan.configuration_updated = true;
  plan.preparation = {
    kind: "project",
    reason: dryRun
      ? "Previewing your selected repository; no association saved."
      : "Saved this repository and preparation preference for future runs.",
  };
  return plan;
}
