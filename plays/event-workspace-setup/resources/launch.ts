import { parseConfig } from "./lib/config.ts";
import {
  browserCommand,
  editorCommand,
  executeCheckedLaunches,
  LaunchRequest,
} from "./lib/launch.ts";

const [configurationRaw = "", planRaw = "", dryRunRaw = "false"] = Deno.args;
const configuration = JSON.parse(configurationRaw) as Record<string, unknown>;
const plan = JSON.parse(planRaw) as Record<string, unknown>;
if (plan.status !== "ready") {
  console.log(JSON.stringify({ status: plan.status, opened: [], plan }));
  Deno.exit(0);
}
const config = parseConfig(configuration.config);
const commands: LaunchRequest[] = [];
const project = plan.project as Record<string, unknown> | null;
if (project && typeof project.path === "string") {
  commands.push({ kind: "editor", ...editorCommand(config, project.path) });
}
const links = Array.isArray(plan.links)
  ? plan.links.filter((value): value is string => typeof value === "string")
  : [];
for (const link of links) {
  commands.push({ kind: "browser", ...browserCommand(config.browser, link) });
}
if (dryRunRaw === "true") {
  console.log(JSON.stringify({
    status: "preview",
    opened: [],
    failures: [],
    commands,
    plan,
  }));
  Deno.exit(0);
}
const { opened, failures } = await executeCheckedLaunches(commands);
console.error(
  `Preparing ${
    String(
      (plan.event as Record<string, unknown> | undefined)?.title ?? "event",
    )
  }`,
);
console.log(
  JSON.stringify({
    status: commands.length === 0
      ? "nothing_to_open"
      : failures.length === 0
      ? "opened"
      : opened.length > 0
      ? "partial"
      : "launch_failed",
    opened,
    failures,
    commands,
    plan,
  }),
);
