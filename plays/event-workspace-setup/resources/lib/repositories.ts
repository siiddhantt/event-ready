import { isWithin, WorkspaceConfig } from "./config.ts";

export type Repository = {
  name: string;
  path: string;
  remote: string | null;
  web_url: string | null;
};

export type RepositoryScan = {
  repositories: Repository[];
  capped: boolean;
  visited_directories: number;
};

export function githubWebUrl(remote: string): string | null {
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(remote);
  const https = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(
    remote,
  );
  const match = ssh ?? https;
  return match
    ? `https://github.com/${match[1]}/${match[2].replace(/\.git$/, "")}`
    : null;
}

async function remoteFromConfig(repo: string): Promise<string | null> {
  try {
    const separator = Deno.build.os === "windows" ? "\\" : "/";
    const text = await Deno.readTextFile(
      `${repo}${separator}.git${separator}config`,
    );
    const origin = /\[remote\s+"origin"\][\s\S]*?\n\s*url\s*=\s*([^\r\n]+)/
      .exec(text);
    return origin?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function scanRepositoryInventory(
  config: WorkspaceConfig,
  maxDepth = 4,
  repositoryLimit = 200,
  directoryLimit = 5000,
): Promise<RepositoryScan> {
  const repositories: Repository[] = [];
  const queue = config.roots.map((path) => ({ path, depth: 0 }));
  let visitedDirectories = 0;
  let capped = false;
  while (
    queue.length > 0 && repositories.length < repositoryLimit &&
    visitedDirectories < directoryLimit
  ) {
    const current = queue.shift()!;
    visitedDirectories += 1;
    if (!isWithin(current.path, config.roots)) continue;
    let entries: Deno.DirEntry[];
    try {
      entries = [...Deno.readDirSync(current.path)];
    } catch {
      continue;
    }
    if (
      entries.some((entry) =>
        entry.name === ".git" && (entry.isDirectory || entry.isFile)
      )
    ) {
      const remote = await remoteFromConfig(current.path);
      repositories.push({
        name:
          current.path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ??
            current.path,
        path: current.path,
        remote,
        web_url: remote ? githubWebUrl(remote) : null,
      });
      continue;
    }
    if (current.depth >= maxDepth) continue;
    const separator = Deno.build.os === "windows" ? "\\" : "/";
    for (const entry of entries) {
      if (!entry.isDirectory || entry.isSymlink || entry.name.startsWith(".")) {
        continue;
      }
      if (queue.length + visitedDirectories >= directoryLimit) {
        capped = true;
        break;
      }
      queue.push({
        path: `${current.path}${separator}${entry.name}`,
        depth: current.depth + 1,
      });
    }
  }
  if (queue.length > 0) capped = true;
  return {
    repositories: repositories.sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
    capped,
    visited_directories: visitedDirectories,
  };
}

export async function scanRepositories(
  config: WorkspaceConfig,
  maxDepth = 4,
  repositoryLimit = 200,
): Promise<Repository[]> {
  return (await scanRepositoryInventory(config, maxDepth, repositoryLimit))
    .repositories;
}
