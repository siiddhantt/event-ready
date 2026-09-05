import { join } from "node:path";
import {
  parseConfig,
  portfolioUrl,
  WorkspaceConfig,
  writeConfig,
} from "./config.ts";
import { displayText, Prompts } from "./terminal.ts";

async function command(argv: string[]): Promise<string | null> {
  try {
    const child = new Deno.Command(argv[0], {
      args: argv.slice(1),
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).spawn();
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch { /* finished */ }
    }, 5000);
    try {
      const result = await child.output();
      return result.success
        ? new TextDecoder().decode(result.stdout).trim()
        : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

export async function githubProfile(): Promise<
  { login?: string; portfolio?: string }
> {
  // Ask authenticated tools for public profile fields, never read their credential stores.
  const user = await command(["gh", "api", "user", "--jq", "{login,blog}"]);
  try {
    let profile = user ? JSON.parse(user) : null;
    if (!profile) {
      const identity = await command(["rote", "whoami"]);
      const handle = /^handle:\s*([A-Za-z0-9-]+)$/m.exec(identity ?? "")?.[1];
      if (handle) {
        const response = await fetch(
          `https://api.github.com/users/${encodeURIComponent(handle)}`,
          { signal: AbortSignal.timeout(4000) },
        );
        if (response.ok) profile = await response.json();
      }
    }
    if (!profile || typeof profile.login !== "string") return {};
    const blog = typeof profile.blog === "string" ? profile.blog.trim() : "";
    return {
      login: profile.login,
      portfolio: blog
        ? portfolioUrl(/^https?:/i.test(blog) ? blog : `https://${blog}`)
        : undefined,
    };
  } catch {
    return {};
  }
}

export async function discoverDefaults(home: string): Promise<WorkspaceConfig> {
  const roots: string[] = [];
  for (
    const name of [
      "Developer/Other/Projects",
      "Developer/Projects",
      "Developer",
      "Projects",
      "projects",
      "Code",
      "code",
      "dev",
    ]
  ) {
    const path = join(home, name);
    if ((await Deno.stat(path).catch(() => null))?.isDirectory) {
      roots.push(await Deno.realPath(path));
      break;
    }
  }
  if (!roots.length) roots.push(join(home, "Projects"));
  let editor: WorkspaceConfig["editor"] = { kind: "code", command: "code" };
  for (
    const [kind, application] of [["code", "Visual Studio Code"], [
      "cursor",
      "Cursor",
    ], ["zed", "Zed"]] as const
  ) {
    if (
      (Deno.build.os === "darwin" &&
        (await Deno.stat(`/Applications/${application}.app`).catch(() =>
          null
        ))) || await command([kind, "--version"])
    ) {
      editor = { kind, command: kind };
      break;
    }
  }
  const profile = await githubProfile();
  return {
    schema_version: 1,
    roots,
    editor,
    browser: "default",
    mappings: {},
    projects: [],
    portfolio_url: profile.portfolio,
  };
}

export async function setupWizard(
  terminal: Prompts,
  proposed: WorkspaceConfig,
): Promise<WorkspaceConfig> {
  let config = structuredClone(proposed);
  terminal.write(
    "\nEvent Ready · first setup\n↑/↓ to choose · Enter to continue · Ctrl+C to cancel\n",
  );
  while (true) {
    terminal.write(
      `\nProjects: ${
        config.roots.length
          ? config.roots.map(displayText).join(", ")
          : "Event links only"
      }\nEditor: ${displayText(config.editor.kind)}\nPortfolio: ${
        config.portfolio_url
          ? displayText(config.portfolio_url)
          : "Not found (optional)"
      }\n`,
    );
    const choice = await terminal.choose("Use these settings?", [
      "Continue",
      "Change project folder",
      "Change editor",
      "Change portfolio website",
      "Use event links only",
    ]);
    if (choice === 0 || choice === 4) {
      if (choice === 4) config.roots = [];
      for (const root of config.roots) {
        await Deno.mkdir(root, { recursive: true });
      }
      config.roots = await Promise.all(
        config.roots.map((root) => Deno.realPath(root)),
      );
      config = parseConfig(config);
      await writeConfig(config);
      return config;
    }
    if (choice === 1) {
      const raw = await terminal.ask(
        "Project folder",
        config.roots[0] ?? `${Deno.env.get("HOME") ?? ""}/Projects`,
      );
      const path = raw.replace(/^~(?=$|[/\\])/, Deno.env.get("HOME") ?? "");
      try {
        await Deno.mkdir(path, { recursive: true });
        const real = await Deno.realPath(path);
        if (!(await Deno.stat(real)).isDirectory) {
          throw new Error("Not a directory");
        }
        config.roots = [real];
      } catch {
        terminal.write(
          "That folder is unavailable. Choose a writable project folder.\n",
        );
      }
    }
    if (choice === 2) {
      const kinds = ["code", "cursor", "zed"] as const;
      const index = await terminal.choose("Editor", [
        "VS Code",
        "Cursor",
        "Zed",
      ]);
      config.editor = { kind: kinds[index], command: kinds[index] };
    }
    if (choice === 3) {
      const answer = await terminal.ask(
        "Portfolio URL (or none)",
        config.portfolio_url ?? "none",
      );
      try {
        config.portfolio_url = portfolioUrl(answer);
      } catch {
        terminal.write("Use an HTTPS website URL or none.\n");
      }
    }
  }
}
