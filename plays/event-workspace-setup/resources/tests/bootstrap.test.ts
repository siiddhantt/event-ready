import { bootstrapProject, installCommand } from "../lib/bootstrap.ts";
import { WorkspaceConfig } from "../lib/config.ts";
import { assertEquals, assertRejects } from "./assert.ts";

Deno.test("a missing approved project previews cloning without creating any files", async () => {
  const root = await Deno.realPath(await Deno.makeTempDir());
  try {
    const project = {
      path: `${root}/repo`,
      repository_url: "https://github.com/example/repo.git",
      install_dependencies: true,
    };
    const config: WorkspaceConfig = {
      schema_version: 1,
      roots: [root],
      editor: { kind: "code", command: "code" },
      browser: "default",
      mappings: {},
      projects: [project],
    };
    const result = await bootstrapProject(config, {
      name: "repo",
      path: project.path,
      remote: project.repository_url,
      web_url: null,
      missing: true,
      setup: project,
    }, true);
    assertEquals(result.status, "preview");
    assertEquals((result.commands as unknown[]).length, 1);
    assertEquals(await Deno.stat(project.path).catch(() => null), null);
    await Deno.mkdir(project.path);
    await Deno.writeTextFile(`${project.path}/keep.txt`, "precious");
    await assertRejects(
      () =>
        bootstrapProject(config, {
          name: "repo",
          path: project.path,
          remote: null,
          web_url: null,
          missing: true,
        }, false),
      "already contains files",
    );
    assertEquals(
      await Deno.readTextFile(`${project.path}/keep.txt`),
      "precious",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("configured dependency setup runs in the selected repository, and failures stop setup", async () => {
  const root = await Deno.realPath(await Deno.makeTempDir());
  try {
    const path = `${root}/repo`;
    await Deno.mkdir(`${path}/.git`, { recursive: true });
    await Deno.writeTextFile(
      `${path}/.git/config`,
      '[remote "origin"]\nurl = https://github.com/example/repo.git\n',
    );
    // A real Git repository is required for the origin guard.
    await new Deno.Command("git", {
      args: ["init", path],
      stdout: "null",
      stderr: "null",
    }).output();
    const project = {
      path,
      repository_url: "https://github.com/example/repo.git",
      install_dependencies: true,
      setup_argv: [
        Deno.execPath(),
        "eval",
        'Deno.writeTextFileSync("installed.txt", Deno.cwd())',
      ],
    };
    const config: WorkspaceConfig = {
      schema_version: 1,
      roots: [root],
      editor: { kind: "code", command: "code" },
      browser: "default",
      mappings: {},
      projects: [project],
    };
    const repo = {
      name: "repo",
      path,
      remote: project.repository_url,
      web_url: null,
    };
    await bootstrapProject(config, repo, true);
    assertEquals(
      await Deno.stat(`${path}/installed.txt`).catch(() => null),
      null,
    );
    await bootstrapProject(config, repo, false);
    assertEquals(await Deno.readTextFile(`${path}/installed.txt`), path);
    project.setup_argv = [Deno.execPath(), "eval", "Deno.exit(7)"];
    await assertRejects(() => bootstrapProject(config, repo, false), "exit 7");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("dependency detection requires a supported lock or an explicit setup command", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${root}/package.json`,
      '{"name":"test","version":"1.0.0"}',
    );
    await assertRejects(() => installCommand(root), "lockfile");
    await Deno.writeTextFile(`${root}/package-lock.json`, "{}");
    assertEquals((await installCommand(root))?.args, ["ci"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
