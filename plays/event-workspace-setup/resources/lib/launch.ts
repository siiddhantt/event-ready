import { WorkspaceConfig } from "./config.ts";

export type CommandSpec = { command: string; args: string[] };
export type LaunchRequest = CommandSpec & { kind: string };
export type LaunchResult = {
  opened: string[];
  failures: Array<{ kind: string; error: string }>;
};
export type LaunchPlatform = "windows" | "darwin" | "linux" | "wsl";

function isWsl(): boolean {
  return Deno.build.os === "linux" &&
    Boolean(Deno.env.get("WSL_INTEROP") || Deno.env.get("WSL_DISTRO_NAME"));
}

export function runtimePlatform(): LaunchPlatform {
  if (isWsl()) return "wsl";
  if (Deno.build.os === "windows" || Deno.build.os === "darwin") {
    return Deno.build.os;
  }
  return "linux";
}

function safeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS browser links may be opened");
  }
  url.username = "";
  url.password = "";
  return url.toString();
}

export function editorCommand(
  config: WorkspaceConfig,
  project: string,
): CommandSpec {
  const args = config.editor.kind === "code" || config.editor.kind === "cursor"
    ? ["--new-window", project]
    : [project];
  return { command: config.editor.command, args };
}

export function browserCommand(
  browser: WorkspaceConfig["browser"],
  rawUrl: string,
  platform: LaunchPlatform = runtimePlatform(),
): CommandSpec {
  const url = safeUrl(rawUrl);
  if (platform === "windows") {
    if (browser === "default") {
      return {
        command: "rundll32.exe",
        args: ["url.dll,FileProtocolHandler", url],
      };
    }
    const commands = {
      chrome: "chrome.exe",
      edge: "msedge.exe",
      firefox: "firefox.exe",
      safari: "safari.exe",
    };
    return { command: commands[browser], args: [url] };
  }
  if (platform === "darwin") {
    if (browser === "default") return { command: "open", args: [url] };
    const applications = {
      chrome: "Google Chrome",
      edge: "Microsoft Edge",
      firefox: "Firefox",
      safari: "Safari",
    };
    return { command: "open", args: ["-a", applications[browser], url] };
  }
  if (platform === "wsl") {
    if (browser === "default") {
      return {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Start-Process -FilePath $args[0]",
          url,
        ],
      };
    }
    const commands = {
      chrome: "chrome.exe",
      edge: "msedge.exe",
      firefox: "firefox.exe",
      safari: "safari.exe",
    };
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Start-Process -FilePath $args[0] -ArgumentList $args[1]",
        commands[browser],
        url,
      ],
    };
  }
  if (browser === "default") return { command: "xdg-open", args: [url] };
  const commands = {
    chrome: "google-chrome",
    edge: "microsoft-edge",
    firefox: "firefox",
    safari: "safari",
  };
  return { command: commands[browser], args: [url] };
}

export function spawnDetached(spec: CommandSpec): void {
  if (Deno.env.get("EVENT_READY_LAUNCH_DRY_RUN") === "1") return;
  const child = new Deno.Command(spec.command, {
    args: spec.args,
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();
  child.unref();
}

export function executeLaunches(
  commands: LaunchRequest[],
  launch: (spec: CommandSpec) => void = spawnDetached,
): LaunchResult {
  const opened: string[] = [];
  const failures: Array<{ kind: string; error: string }> = [];
  for (const command of commands) {
    try {
      launch(command);
      opened.push(command.kind);
    } catch (error) {
      failures.push({
        kind: command.kind,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { opened, failures };
}
