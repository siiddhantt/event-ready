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
    env: {
      EVENT_READY_WORKSPACE_CONFIG_DIR: configDirectory,
      EVENT_READY_WORKSPACE_INTERACTIVE: "0",
    },
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
      JSON.stringify({
        schema_version: 1,
        roots: [`${root}/alias`],
        editor: { kind: "code", command: "code" },
        browser: "default",
        mappings: {},
        projects: [{
          path: project,
          repository_url: "https://github.com/example/portfolio",
          install_dependencies: true,
        }],
      }),
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

Deno.test("links-only interview setup needs no repo and never installs or opens an editor", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const configured = await run("configure.ts", [
      "setup",
      JSON.stringify({
        schema_version: 1,
        roots: [],
        editor: { kind: "code", command: "code" },
        browser: "default",
        mappings: {},
        portfolio_url: "https://portfolio.example.test/",
      }),
    ], directory);
    const scan = await run("scan.ts", [JSON.stringify(configured)], directory);
    const events = [{
      id: "interview",
      summary: "Engineering interview",
      start: { dateTime: new Date(Date.now() + 3600_000).toISOString() },
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    }];
    const plan = await run("select.ts", [
      JSON.stringify(configured),
      JSON.stringify(events),
      JSON.stringify(scan),
      "interview",
      "",
    ], directory);
    assertEquals(plan.project, null);
    const bootstrap = await run("bootstrap.ts", [
      JSON.stringify(configured),
      JSON.stringify(plan),
      "false",
    ], directory);
    assertEquals(bootstrap, { status: "not_requested", commands: [] });
    const launch = await run("launch.ts", [
      JSON.stringify(configured),
      JSON.stringify(plan),
      "true",
    ], directory);
    assertEquals(
      (launch.commands as Array<{ kind: string }>).map((c) => c.kind),
      ["browser", "browser"],
    );
    const saved = await run("configure.ts", ["run"], directory);
    assertEquals(
      (saved.config as Record<string, unknown>).portfolio_url,
      "https://portfolio.example.test/",
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
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
    JSON.stringify({
      schema_version: 1,
      roots: [root],
      editor: { kind: "code", command: "code" },
      browser: "default",
      mappings: {},
    }),
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
  const { saveAssociation } = await import("../lib/choose-workspace.ts");
  const { parseConfig } = await import("../lib/config.ts");
  const previous = Deno.env.get("EVENT_READY_WORKSPACE_CONFIG_DIR");
  Deno.env.set("EVENT_READY_WORKSPACE_CONFIG_DIR", configDirectory);
  try {
    await saveAssociation(
      parseConfig(configured.config),
      plan,
      plan.project as import("../lib/repositories.ts").Repository,
      false,
    );
  } finally {
    if (previous === undefined) {
      Deno.env.delete("EVENT_READY_WORKSPACE_CONFIG_DIR");
    } else Deno.env.set("EVENT_READY_WORKSPACE_CONFIG_DIR", previous);
  }
  assertEquals(
    JSON.parse(await Deno.readTextFile(`${configDirectory}/config.json`))
      .mappings.acme,
    project,
  );
  await Deno.remove(root, { recursive: true });
  await Deno.remove(configDirectory, { recursive: true });
});
