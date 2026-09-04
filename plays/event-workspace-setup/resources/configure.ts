import { readConfig, WorkspaceConfig, writeConfig } from "./lib/config.ts";

function parseRoots(raw: string): string[] {
  let values: unknown;
  try {
    values = JSON.parse(raw);
  } catch {
    values = raw.split(/\r?\n|;/).map((value) => value.trim()).filter(Boolean);
  }
  if (
    !Array.isArray(values) || values.length === 0 || values.length > 10 ||
    !values.every((value) => typeof value === "string")
  ) {
    throw new Error(
      "project_roots must be a JSON array containing 1 to 10 paths",
    );
  }
  return values as string[];
}

function validCommand(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) || /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("/");
}

const [
  mode = "run",
  rootsRaw = "",
  editorRaw = "code",
  browserRaw = "default",
  editorCommandRaw = "",
] = Deno.args;
if (mode === "run") {
  console.log(JSON.stringify({ status: "ready", config: await readConfig() }));
  Deno.exit(0);
}
if (mode !== "setup") throw new Error("mode must be setup or run");
const roots: string[] = [];
for (const candidate of parseRoots(rootsRaw)) {
  const real = await Deno.realPath(candidate);
  const info = await Deno.stat(real);
  if (!info.isDirectory) {
    throw new Error(`Project root is not a directory: ${candidate}`);
  }
  roots.push(real);
}
const editorKinds = new Set(["code", "cursor", "zed", "custom"]);
if (!editorKinds.has(editorRaw)) {
  throw new Error("editor must be code, cursor, zed, or custom");
}
const command = editorRaw === "custom" ? editorCommandRaw : editorRaw;
if (!command || !validCommand(command)) {
  throw new Error("editor_command must be an executable name or absolute path");
}
const browsers = new Set(["default", "chrome", "edge", "firefox", "safari"]);
if (!browsers.has(browserRaw)) {
  throw new Error("browser must be default, chrome, edge, firefox, or safari");
}
const existing = await readConfig().catch(() => null);
const config: WorkspaceConfig = {
  schema_version: 1,
  roots: [...new Set(roots)],
  editor: { kind: editorRaw as WorkspaceConfig["editor"]["kind"], command },
  browser: browserRaw as WorkspaceConfig["browser"],
  mappings: existing?.mappings ?? {},
};
await writeConfig(config);
console.log(JSON.stringify({ status: "configured", config }));
