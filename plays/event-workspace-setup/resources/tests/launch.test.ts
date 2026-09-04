import { WorkspaceConfig } from "../lib/config.ts";
import {
  browserCommand,
  editorCommand,
  executeLaunches,
} from "../lib/launch.ts";
import { assertEquals, assertThrows } from "./assert.ts";

Deno.test("uses shell-free Windows default launching", () => {
  assertEquals(
    browserCommand("default", "https://example.com/path", "windows"),
    {
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", "https://example.com/path"],
    },
  );
});

Deno.test("uses explicit macOS browser application", () => {
  assertEquals(browserCommand("chrome", "https://example.com", "darwin"), {
    command: "open",
    args: ["-a", "Google Chrome", "https://example.com/"],
  });
});

Deno.test("uses native macOS editor application launching", () => {
  const config: WorkspaceConfig = {
    schema_version: 1,
    roots: ["/Users/me/projects"],
    editor: { kind: "code", command: "code" },
    browser: "default",
    mappings: {},
  };
  assertEquals(editorCommand(config, "/Users/me/projects/app", "darwin"), {
    command: "open",
    args: ["-a", "Visual Studio Code", "/Users/me/projects/app"],
  });
});

Deno.test("keeps WSL URL outside PowerShell source text", () => {
  const command = browserCommand(
    "default",
    "https://example.com/?q=%24%28bad%29",
    "wsl",
  );
  assertEquals(command.args[3], "Start-Process -FilePath $args[0]");
  assertEquals(command.args[4], "https://example.com/?q=%24%28bad%29");
});

Deno.test("rejects dangerous URL schemes", () => {
  assertThrows(
    () => browserCommand("default", "file:///etc/passwd", "linux"),
    "HTTPS",
  );
});

Deno.test("continues after one launch fails", () => {
  const result = executeLaunches([
    { kind: "editor", command: "missing", args: [] },
    { kind: "browser", command: "open", args: [] },
  ], (command) => {
    if (command.command === "missing") throw new Error("not installed");
  });
  assertEquals(result.opened, ["browser"]);
  assertEquals(result.failures, [{ kind: "editor", error: "not installed" }]);
});
