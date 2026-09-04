import { isWithin } from "../lib/config.ts";
import {
  githubWebUrl,
  scanRepositories,
  scanRepositoryInventory,
} from "../lib/repositories.ts";
import { assertEquals } from "./assert.ts";

Deno.test("normalizes GitHub SSH and HTTPS remotes", () => {
  assertEquals(
    githubWebUrl("git@github.com:acme/rocket.git"),
    "https://github.com/acme/rocket",
  );
  assertEquals(
    githubWebUrl("https://github.com/acme/rocket.git"),
    "https://github.com/acme/rocket",
  );
  assertEquals(githubWebUrl("https://gitlab.com/acme/rocket.git"), null);
});

Deno.test("scans only bounded approved roots", async () => {
  const root = await Deno.makeTempDir();
  const repo = `${root}/projects/rocket`;
  await Deno.mkdir(`${repo}/.git`, { recursive: true });
  await Deno.writeTextFile(
    `${repo}/.git/config`,
    '[remote "origin"]\n\turl = git@github.com:acme/rocket.git\n',
  );
  const result = await scanRepositories({
    schema_version: 1,
    roots: [`${root}/projects`],
    editor: { kind: "code", command: "code" },
    browser: "default",
    mappings: {},
  });
  assertEquals(result, [{
    name: "rocket",
    path: repo,
    remote: "git@github.com:acme/rocket.git",
    web_url: "https://github.com/acme/rocket",
  }]);
  await Deno.remove(root, { recursive: true });
});

Deno.test("caps broad directory traversal", async () => {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(`${root}/one/two`, { recursive: true });
  const result = await scanRepositoryInventory(
    {
      schema_version: 1,
      roots: [root],
      editor: { kind: "code", command: "code" },
      browser: "default",
      mappings: {},
    },
    4,
    200,
    1,
  );
  assertEquals(result.capped, true);
  assertEquals(result.visited_directories, 1);
  await Deno.remove(root, { recursive: true });
});

Deno.test("handles Windows root boundaries case-insensitively", () => {
  assertEquals(isWithin("c:\\Work\\Project", ["C:\\work"]), true);
  assertEquals(isWithin("C:\\work-other", ["C:\\work"]), false);
});
