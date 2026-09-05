import { parseConfig } from "./lib/config.ts";
import { bootstrapProject } from "./lib/bootstrap.ts";
import { Repository } from "./lib/repositories.ts";

const [configRaw, planRaw, dryRun = "false"] = Deno.args;
const config = parseConfig(JSON.parse(configRaw).config);
const plan = JSON.parse(planRaw);
if (plan.status !== "ready") {
  console.log(JSON.stringify({ status: plan.status, commands: [] }));
} else {console.log(
    JSON.stringify(
      await bootstrapProject(
        config,
        plan.project as Repository | null,
        dryRun === "true",
      ),
    ),
  );}
