import { parseConfig } from "./lib/config.ts";
import { scanRepositoryInventory } from "./lib/repositories.ts";

const [configurationRaw = ""] = Deno.args;
const wrapper = JSON.parse(configurationRaw) as Record<string, unknown>;
if (wrapper.status === "needs_setup" || wrapper.status === "cancelled") {
  console.log(JSON.stringify({ repositories: [], count: 0 }));
  Deno.exit(0);
}
const config = parseConfig(wrapper.config);
const scan = await scanRepositoryInventory(config);
console.log(JSON.stringify({ ...scan, count: scan.repositories.length }));
