import { assertEquals } from "./assert.ts";

async function run(
  script: string,
  args: string[],
  configDirectory: string,
): Promise<Record<string, unknown>> {
  const path = decodeURIComponent(
    new URL(`../${script}`, import.meta.url).pathname,
  );
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", path, ...args],
    env: { EVENT_READY_WORKSPACE_CONFIG_DIR: configDirectory },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) throw new Error(new TextDecoder().decode(output.stderr));
  return JSON.parse(new TextDecoder().decode(output.stdout));
}

Deno.test("a missing configured repo resolves through the same parent symlink at setup and run", async () => {
  const root = await Deno.realPath(await Deno.makeTempDir());
  try {
    await Deno.mkdir(`${root}/projects`);
    await Deno.symlink(`${root}/projects`, `${root}/alias`, { type: "dir" });
    const project = `${root}/alias/portfolio`;
    const configured = await run("configure.ts", [
      "setup",
      JSON.stringify([`${root}/alias`]),
      "code",
      "default",
      "",
      "https://github.com/example/portfolio",
      project,
      "true",
    ], `${root}/config`);
    const scanned = await run(
      "scan.ts",
      [JSON.stringify(configured)],
      `${root}/config`,
    );
    const events = [{
      id: "interview",
      summary: "Portfolio interview",
      start: { dateTime: new Date(Date.now() + 3600_000).toISOString() },
    }];
    const plan = await run("select.ts", [
      JSON.stringify(configured),
      JSON.stringify(events),
      JSON.stringify(scanned),
      "interview",
      project,
    ], `${root}/config`);
    assertEquals(plan.status, "ready");
    assertEquals(
      (plan.project as Record<string, unknown>).path,
      `${root}/projects/portfolio`,
    );
    const bootstrap = await run("bootstrap.ts", [
      JSON.stringify(configured),
      JSON.stringify(plan),
      "true",
    ], `${root}/config`);
    assertEquals(bootstrap.status, "preview");
    assertEquals(
      await Deno.stat(`${root}/projects/portfolio`).catch(() => null),
      null,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("setup, discover, plan, dry-launch, and remember form one safe lifecycle", async () => {
  const root = await Deno.realPath(await Deno.makeTempDir());
  const configDirectory = await Deno.makeTempDir();
  const project = `${root}/acme-rocket`;
  await Deno.mkdir(`${project}/.git`, { recursive: true });
  await Deno.writeTextFile(
    `${project}/.git/config`,
    '[remote "origin"]\n\turl = git@github.com:acme/rocket.git\n',
  );
  const configured = await run("configure.ts", [
    "setup",
    JSON.stringify([root]),
    "code",
    "default",
    "",
  ], configDirectory);
  const scanned = await run(
    "scan.ts",
    [JSON.stringify(configured)],
    configDirectory,
  );
  const emptyPlan = await run("select.ts", [
    JSON.stringify(configured),
    JSON.stringify({ resultSizeEstimate: 0 }),
    JSON.stringify(scanned),
    "",
    "",
  ], configDirectory);
  assertEquals(emptyPlan.status, "no_event");
  const starts = new Date(Date.now() + 3600_000);
  const ends = new Date(starts.getTime() + 3600_000);
  const events = [{
    id: "e1",
    status: "confirmed",
    summary: "Acme Rocket interview",
    start: { dateTime: starts.toISOString() },
    end: { dateTime: ends.toISOString() },
    hangoutLink: "https://meet.google.com/abc-defg-hij",
    extendedProperties: {
      private: { eventReadyCompany: "Acme", eventReadyProjectHint: "rocket" },
    },
  }];
  const plan = await run("select.ts", [
    JSON.stringify(configured),
    JSON.stringify(events),
    JSON.stringify(scanned),
    "",
    "",
  ], configDirectory);
  assertEquals(plan.status, "ready");
  assertEquals((plan.project as Record<string, unknown>).path, project);
  const launched = await run(
    "launch.ts",
    [JSON.stringify(configured), JSON.stringify(plan), "true"],
    configDirectory,
  );
  assertEquals(launched.status, "preview");
  assertEquals(launched.opened, []);
  assertEquals((launched.commands as unknown[]).length, 3);
  const remembered = await run(
    "remember.ts",
    [JSON.stringify(plan), project],
    configDirectory,
  );
  assertEquals(remembered.status, "remembered");
  await Deno.remove(root, { recursive: true });
  await Deno.remove(configDirectory, { recursive: true });
});
