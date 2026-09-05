import { assertEquals } from "./assert.ts";
import { chooseWorkspace, eligibleEvents } from "../lib/choose-workspace.ts";
import { WorkspaceConfig } from "../lib/config.ts";
import { Repository } from "../lib/repositories.ts";
import { bootstrapProject } from "../lib/bootstrap.ts";
import { setupWizard } from "../lib/onboarding.ts";
import { displayText, Prompts } from "../lib/terminal.ts";

const event = {
  id: "upcoming",
  summary: "Acme interview",
  start: { dateTime: new Date(Date.now() + 3600_000).toISOString() },
  hangoutLink: "https://meet.example.test/interview",
};
function config(root: string): WorkspaceConfig {
  return {
    schema_version: 1,
    roots: [root],
    editor: { kind: "code", command: "code" },
    browser: "default",
    mappings: {},
    projects: [],
  };
}
function prompts(answers: number[]): Prompts {
  return {
    write() {},
    choose() {
      const answer = answers.shift();
      if (answer === undefined) throw new Error("Unexpected extra prompt");
      return answer;
    },
    ask() {
      throw new Error("Unexpected text input");
    },
  };
}
async function isolated(test: (root: string) => Promise<void>) {
  const root = await Deno.realPath(await Deno.makeTempDir());
  const previous = Deno.env.get("EVENT_READY_WORKSPACE_CONFIG_DIR");
  Deno.env.set("EVENT_READY_WORKSPACE_CONFIG_DIR", `${root}/settings`);
  try {
    await test(root);
  } finally {
    if (previous === undefined) {
      Deno.env.delete("EVENT_READY_WORKSPACE_CONFIG_DIR");
    } else Deno.env.set("EVENT_READY_WORKSPACE_CONFIG_DIR", previous);
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("event title search includes ordinary Calendar events and excludes cancelled ones", () => {
  const plain = { ...event, hangoutLink: undefined };
  assertEquals(
    eligibleEvents(config("/projects"), [plain, {
      ...plain,
      id: "cancelled",
      status: "cancelled",
    }], "ACME").map((e) => e.id),
    ["upcoming"],
  );
});

Deno.test("a first repository choice previews cloning and installation without saving or creating files", () =>
  isolated(async (root) => {
    const cfg = config(root);
    const repo: Repository = {
      name: "acme",
      path: `${root}/acme`,
      remote: "https://github.com/example/acme.git",
      web_url: "https://github.com/example/acme",
      missing: true,
    };
    const plan = await chooseWorkspace(
      prompts([0, 0]),
      cfg,
      [event],
      [repo],
      event.id,
      "",
      true,
    );
    const result = await bootstrapProject(
      plan.preparation_config as WorkspaceConfig,
      plan.project as Repository,
      true,
    );
    assertEquals(result.status, "preview");
    assertEquals(
      (result.commands as Array<{ purpose: string }>).map((c) => c.purpose),
      ["clone"],
    );
    assertEquals(cfg.mappings, {});
    assertEquals(await Deno.stat(repo.path).catch(() => null), null);
    assertEquals(await Deno.stat(`${root}/settings`).catch(() => null), null);
  }));

Deno.test("confirmed repository and installation choices are reused with no repeated questions", () =>
  isolated(async (root) => {
    const cfg = config(root);
    const repo: Repository = {
      name: "acme",
      path: `${root}/acme`,
      remote: "https://github.com/example/acme.git",
      web_url: "https://github.com/example/acme",
    };
    const plan = await chooseWorkspace(
      prompts([0, 1]),
      cfg,
      [event],
      [repo],
      event.id,
      "",
      false,
    );
    assertEquals(plan.configuration_updated, true);
    const saved = JSON.parse(
      await Deno.readTextFile(`${root}/settings/config.json`),
    ) as WorkspaceConfig;
    assertEquals(saved.projects?.[0].install_dependencies, false);
    const repeat = await chooseWorkspace(
      prompts([]),
      saved,
      [event],
      [repo],
      event.id,
      "",
      false,
    );
    assertEquals((repeat.project as Repository).path, repo.path);
    assertEquals(repeat.configuration_updated, undefined);
  }));

Deno.test("no-repo interviews use discovered portfolio and meeting without asking for a URL", async () => {
  const cfg = config("/projects");
  cfg.portfolio_url = "https://portfolio.example.test/";
  const plan = await chooseWorkspace(
    prompts([0]),
    cfg,
    [event],
    [],
    "Acme",
    "",
    false,
  );
  assertEquals(plan.project, null);
  assertEquals(plan.links, [event.hangoutLink, cfg.portfolio_url]);
});

Deno.test("cancelling a portfolio edit escapes the wizard without saving", () =>
  isolated(async (root) => {
    let cancelled = false;
    try {
      await setupWizard({
        ...prompts([3]),
        ask() {
          throw new Error("Cancelled");
        },
      }, config(root));
    } catch (error) {
      cancelled = (error as Error).message === "Cancelled";
    }
    assertEquals(cancelled, true);
    assertEquals(await Deno.stat(`${root}/settings`).catch(() => null), null);
  }));

Deno.test("headless first setup returns defaults without creating configuration", () =>
  isolated(async (root) => {
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", new URL("../configure.ts", import.meta.url).pathname],
      env: { HOME: root, PATH: "", EVENT_READY_WORKSPACE_INTERACTIVE: "0" },
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(output.success, true);
    assertEquals(
      JSON.parse(new TextDecoder().decode(output.stdout)).status,
      "needs_setup",
    );
    assertEquals(await Deno.stat(`${root}/settings`).catch(() => null), null);
  }));

Deno.test("untrusted event text cannot inject terminal controls", () => {
  assertEquals(
    /[\x00-\x1f\x7f-\x9f]/.test(
      displayText("Title\x1b]52;c;secrets\x07\r\nmore"),
    ),
    false,
  );
});
