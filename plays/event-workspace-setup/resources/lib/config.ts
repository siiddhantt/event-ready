export type ProjectSetup = {
  path: string;
  repository_url: string;
  install_dependencies: boolean;
  setup_argv?: string[];
};

export type WorkspaceConfig = {
  schema_version: 1;
  roots: string[];
  editor: { kind: "code" | "cursor" | "zed" | "custom"; command: string };
  browser: "default" | "chrome" | "edge" | "firefox" | "safari";
  mappings: Record<string, string>;
  projects?: ProjectSetup[];
  portfolio_url?: string;
};

function homeDirectory(): string {
  const value = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (!value) throw new Error("No user home directory is available");
  return value;
}

export function configDirectory(): string {
  const override = Deno.env.get("EVENT_READY_WORKSPACE_CONFIG_DIR");
  if (override) return override;
  if (Deno.build.os === "windows") {
    return `${
      Deno.env.get("LOCALAPPDATA") ?? homeDirectory()
    }\\Event Ready\\event-workspace-setup`;
  }
  return `${
    Deno.env.get("XDG_CONFIG_HOME") ?? `${homeDirectory()}/.config`
  }/event-ready/event-workspace-setup`;
}

export function configPath(): string {
  return `${configDirectory()}${
    Deno.build.os === "windows" ? "\\" : "/"
  }config.json`;
}

function parseEditor(value: unknown): WorkspaceConfig["editor"] {
  if (!value || typeof value !== "object") {
    throw new Error("Editor configuration is malformed");
  }
  const item = value as Record<string, unknown>;
  if (!new Set(["code", "cursor", "zed", "custom"]).has(String(item.kind))) {
    throw new Error("Editor kind is unsupported");
  }
  if (
    typeof item.command !== "string" || item.command.length === 0 ||
    item.command.length > 1000
  ) throw new Error("Editor command is malformed");
  return {
    kind: item.kind as WorkspaceConfig["editor"]["kind"],
    command: item.command,
  };
}

export function parseConfig(value: unknown): WorkspaceConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Workspace configuration is malformed");
  }
  const item = value as Record<string, unknown>;
  if (
    item.schema_version !== 1 || !Array.isArray(item.roots) ||
    !item.roots.every((root) => typeof root === "string")
  ) {
    throw new Error("Workspace configuration has an unsupported schema");
  }
  if (
    !new Set(["default", "chrome", "edge", "firefox", "safari"]).has(
      String(item.browser),
    )
  ) {
    throw new Error("Browser choice is unsupported");
  }
  const mappingsValue = item.mappings;
  if (
    !mappingsValue || typeof mappingsValue !== "object" ||
    Array.isArray(mappingsValue)
  ) throw new Error("Workspace mappings are malformed");
  const mappings = Object.fromEntries(
    Object.entries(mappingsValue).map(([key, path]) => {
      if (typeof path !== "string") {
        throw new Error("Workspace mapping path is malformed");
      }
      return [key, path];
    }),
  );
  return {
    schema_version: 1,
    roots: [...new Set(item.roots as string[])],
    editor: parseEditor(item.editor),
    browser: item.browser as WorkspaceConfig["browser"],
    mappings,
    projects: parseProjects(item.projects),
    portfolio_url: portfolioUrl(item.portfolio_url),
  };
}

export function portfolioUrl(value: unknown): string | undefined {
  if (
    value === undefined || value === null || value === "" || value === "none"
  ) return undefined;
  if (typeof value !== "string") {
    throw new Error("portfolio_url must be an HTTPS URL");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("portfolio_url must be a credential-free HTTPS URL");
  }
  return url.toString();
}

export function repositoryUrl(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" || url.hostname !== "github.com" ||
    url.username || url.password || url.search || url.hash ||
    !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)
  ) {
    throw new Error(
      "repository_url must be a credential-free GitHub HTTPS repository URL",
    );
  }
  return `https://github.com${
    url.pathname.replace(/\/$/, "").replace(/\.git$/, "")
  }.git`;
}

function parseProjects(value: unknown): ProjectSetup[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("Configured projects must be an array");
  }
  return value.map((entry) => {
    if (
      !entry || typeof entry !== "object" || typeof entry.path !== "string" ||
      !entry.path ||
      typeof entry.repository_url !== "string" ||
      typeof entry.install_dependencies !== "boolean"
    ) {
      throw new Error("Configured project is malformed");
    }
    if (
      entry.setup_argv !== undefined &&
      (!Array.isArray(entry.setup_argv) || !entry.setup_argv.length ||
        !entry.setup_argv.every((arg: unknown) =>
          typeof arg === "string" && !arg.includes("\0")
        ))
    ) {
      throw new Error(
        "setup_argv must be a nonempty array of command arguments",
      );
    }
    return {
      path: entry.path,
      repository_url: repositoryUrl(entry.repository_url),
      install_dependencies: entry.install_dependencies,
      setup_argv: entry.setup_argv,
    };
  });
}

export async function readConfig(): Promise<WorkspaceConfig> {
  try {
    return parseConfig(JSON.parse(await Deno.readTextFile(configPath())));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error("Setup is required before run mode");
    }
    throw error;
  }
}

export async function writeConfig(config: WorkspaceConfig): Promise<void> {
  const directory = configDirectory();
  await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  if (Deno.build.os !== "windows") await Deno.chmod(directory, 0o700);
  const path = configPath();
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temporary, `${JSON.stringify(config)}\n`, {
    createNew: true,
    mode: 0o600,
  });
  if (Deno.build.os !== "windows") await Deno.chmod(temporary, 0o600);
  await Deno.rename(temporary, path);
}

export function isWithin(path: string, roots: string[]): boolean {
  const normalize = (value: string): string => {
    const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
    return Deno.build.os === "windows" || /^[a-z]:\//i.test(normalized) ||
        normalized.startsWith("//")
      ? normalized.toLowerCase()
      : normalized;
  };
  const normalized = normalize(path);
  return roots.some((root) => {
    const base = normalize(root);
    return base === "/" || normalized === base ||
      normalized.startsWith(`${base}/`);
  });
}

export function mappingKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 100);
}
