import { parseConfig } from "./lib/config.ts";
import { bootstrapProject } from "./lib/bootstrap.ts";
import { Repository } from "./lib/repositories.ts";

const [configRaw, planRaw, dryRun = "false"] = Deno.args;
const plan = JSON.parse(planRaw);
if (plan.status !== "ready") {
  console.log(JSON.stringify({ status: plan.status, commands: [] }));
} else {console.log(
    JSON.stringify(
      await bootstrapProject(
        parseConfig(plan.preparation_config ?? JSON.parse(configRaw).config),
        plan.project as Repository | null,
        dryRun === "true",
      ),
    ),
  );}
