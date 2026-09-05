import {
  isWithin,
  parseConfig,
  readConfig,
  writeConfig,
} from "./lib/config.ts";
import { basename, dirname, join, resolve } from "node:path";
import { discoverDefaults, setupWizard } from "./lib/onboarding.ts";
import { PromptCancelled, Terminal } from "./lib/terminal.ts";

const [mode = "run", settingsRaw = ""] = Deno.args;
if (mode !== "run" && mode !== "setup") {
  throw new Error("mode must be run or setup");
}
const existing = await readConfig().catch((error) => {
  if (
    error instanceof Error &&
    error.message === "Setup is required before run mode"
  ) return null;
  throw error;
});
if (settingsRaw) {
  const config = parseConfig(JSON.parse(settingsRaw));
  config.roots = await Promise.all(
    config.roots.map((root) => Deno.realPath(root)),
  );
  for (const project of config.projects ?? []) {
    const requested = resolve(project.path);
    project.path = join(
      await Deno.realPath(dirname(requested)),
      basename(requested),
    );
    if (!isWithin(project.path, config.roots)) {
      throw new Error("Configured project must be inside an approved root");
    }
  }
  await writeConfig(config);
  console.log(
    JSON.stringify({ status: mode === "run" ? "ready" : "configured", config }),
  );
} else if (existing && mode === "run") {
  console.log(JSON.stringify({ status: "ready", config: existing }));
} else {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (!home) throw new Error("No home directory is available");
  const defaults = existing ?? await discoverDefaults(home);
  const terminal = Terminal.open();
  if (!terminal) {
    console.log(
      JSON.stringify({
        status: "needs_setup",
        message:
          "Run this public Play in a terminal for guided setup, or have your agent confirm these defaults and pass them as settings JSON.",
        defaults,
      }),
    );
  } else {
    try {
      const config = await setupWizard(terminal, defaults);
      console.log(
        JSON.stringify({
          status: mode === "run" ? "ready" : "configured",
          config,
        }),
      );
    } catch (error) {
      if (!(error instanceof PromptCancelled)) throw error;
      console.log(JSON.stringify({ status: "cancelled" }));
    } finally {
      terminal.close();
    }
  }
}
