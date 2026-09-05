import { dirname, join } from "node:path";
import { isWithin, repositoryUrl, WorkspaceConfig } from "./config.ts";
import { Repository } from "./repositories.ts";

export type SetupCommand = {
  command: string;
  args: string[];
  cwd: string;
  purpose: string;
};

export async function installCommand(
  path: string,
): Promise<SetupCommand | null> {
  const exists = async (name: string) =>
    Boolean(await Deno.stat(join(path, name)).catch(() => null));
  const command = (command: string, args: string[]): SetupCommand => ({
    command,
    args,
    cwd: path,
    purpose: "install_dependencies",
  });
  if (await exists("pnpm-lock.yaml")) {
    return command("pnpm", ["install", "--frozen-lockfile"]);
  }
  if (
    await exists("package-lock.json") || await exists("npm-shrinkwrap.json")
  ) return command("npm", ["ci"]);
  if (await exists("yarn.lock")) {
    const pkg = JSON.parse(await Deno.readTextFile(join(path, "package.json")));
    if (
      typeof pkg.packageManager !== "string" ||
      !/^yarn@\d+\./.test(pkg.packageManager)
    ) {
      throw new Error(
        "Declare the Yarn version in packageManager or configure setup_argv explicitly",
      );
    }
    return command("yarn", [
      "install",
      /^yarn@1\./.test(pkg.packageManager ?? "")
        ? "--frozen-lockfile"
        : "--immutable",
    ]);
  }
  if (await exists("uv.lock")) return command("uv", ["sync", "--frozen"]);
  if (await exists("deno.json") || await exists("deno.jsonc")) {
    return command("deno", ["install", "--frozen"]);
  }
  if (await exists("Cargo.lock")) {
    return command("cargo", ["fetch", "--locked"]);
  }
  if (await exists("go.mod")) return command("go", ["mod", "download"]);
  if (
    await exists("package.json") || await exists("pyproject.toml") ||
    await exists("requirements.txt")
  ) {
    throw new Error(
      "No supported dependency lockfile; configure setup_argv explicitly",
    );
  }
  return null;
}

async function execute(spec: SetupCommand): Promise<void> {
  const child = new Deno.Command(spec.command, {
    args: spec.args,
    cwd: spec.cwd,
    env: { GIT_TERMINAL_PROMPT: "0", CI: "true" },
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();
  const timer = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch { /* already exited */ }
  }, 600_000);
  try {
    const result = await child.status;
    if (!result.success) {
      throw new Error(
        `${spec.purpose} failed (exit ${result.code}); check the configured tool and repository`,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function bootstrapProject(
  config: WorkspaceConfig,
  repo: Repository | null,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  if (!repo) return { status: "not_requested", commands: [] };
  const parent = await Deno.realPath(dirname(repo.path));
  if (!isWithin(parent, config.roots)) {
    throw new Error("Project parent escaped approved roots");
  }
  const info = await Deno.lstat(repo.path).catch((error) => {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  });
  if (info?.isSymlink || (info && !info.isDirectory)) {
    throw new Error("Project target must be a real directory");
  }
  const approved = config.projects?.find((p) => p.path === repo.path);
  if (!approved) {
    const real = await Deno.realPath(repo.path);
    if (!isWithin(real, config.roots)) {
      throw new Error("Project escaped approved roots");
    }
    return { status: "existing", commands: [] };
  }
  const commands: SetupCommand[] = [];
  if (!info || repo.missing) {
    if (info && [...Deno.readDirSync(repo.path)].length) {
      throw new Error(
        "Clone destination already contains files; nothing was changed",
      );
    }
    commands.push({
      command: "git",
      args: ["clone", "--", approved.repository_url, repo.path],
      cwd: parent,
      purpose: "clone",
    });
    if (!dryRun) await execute(commands[0]);
  } else {
    const result = await new Deno.Command("git", {
      args: ["-C", repo.path, "config", "--get", "remote.origin.url"],
      stdout: "piped",
      stderr: "null",
    }).output();
    const origin = new TextDecoder().decode(result.stdout).trim().replace(
      /^git@github.com:/,
      "https://github.com/",
    );
    if (!result.success || repositoryUrl(origin) !== approved.repository_url) {
      throw new Error(
        "Existing repository origin differs from configured repository_url",
      );
    }
  }
  let installer: SetupCommand | null = null;
  if (approved.install_dependencies) {
    if (approved.setup_argv) {
      installer = {
        command: approved.setup_argv[0],
        args: approved.setup_argv.slice(1),
        cwd: repo.path,
        purpose: "install_dependencies",
      };
    } else if (dryRun && (!info || repo.missing)) {
      return {
        status: "preview",
        commands,
        dependency_plan:
          "Detect the lockfile after clone; preview again to see the exact install command",
      };
    } else installer = await installCommand(repo.path);
  }
  if (installer) {
    commands.push(installer);
    if (!dryRun) await execute(installer);
  }
  return { status: dryRun ? "preview" : "prepared", commands };
}
