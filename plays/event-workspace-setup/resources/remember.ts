import { isWithin, mappingKey, readConfig, writeConfig } from "./lib/config.ts";

const [planRaw = "", projectOverride = ""] = Deno.args;
if (!projectOverride) {
  throw new Error("remember=true requires an explicit project override");
}
const plan = JSON.parse(planRaw) as Record<string, unknown>;
const keyRaw = plan.mapping_key;
if (typeof keyRaw !== "string") {
  throw new Error("The selected event has no mapping key");
}
const key = mappingKey(keyRaw);
if (!key) throw new Error("The selected event mapping key is empty");
const config = await readConfig();
const project = await Deno.realPath(projectOverride);
if (!isWithin(project, config.roots)) {
  throw new Error("Remembered project is outside approved roots");
}
const gitPath = `${project}${Deno.build.os === "windows" ? "\\" : "/"}.git`;
const info = await Deno.stat(gitPath).catch(() => null);
if (!info || (!info.isDirectory && !info.isFile)) {
  throw new Error("Remembered project is not a Git repository");
}
config.mappings[key] = project;
await writeConfig(config);
console.log(
  JSON.stringify({ status: "remembered", mapping_key: key, project }),
);
