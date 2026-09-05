import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const cli = resolve("packages/cli/dist/cli.js");
const cliPackage = JSON.parse(
  readFileSync("packages/cli/package.json", "utf8"),
) as { version: string };
const run = (...args: string[]) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result;
};

it.each([[], ["help"], ["--help"], ["-h"]])("shows help for %j", (...args) => {
  const result = run(...args);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Usage: plankton");
  expect(result.stdout).toContain("cards");
  expect(result.stderr).toBe("");
});

it.each([
  ["login", "--help"],
  ["help", "login"],
  ["setup", "-h"],
])("shows command help for %j", (...args) => {
  const result = run(...args);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("[URL]");
  expect(result.stdout).toContain("--manual");
  expect(result.stderr).toBe("");
});

it.each(["--version", "-V"])("prints the version with %s", (flag) => {
  const result = run(flag);
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(cliPackage.version);
  expect(result.stderr).toBe("");
});

it.each([
  ["unknown"],
  ["--unknown"],
  ["configure"],
  ["serve"],
  ["doctor", "extra"],
  ["logout", "extra"],
  ["install-browser", "extra"],
  ["login", "https://planka.example", "extra"],
  ["setup", "--unknown"],
  ["cards", "find"],
  ["cards", "find", "--board", "10", "--query", "X", "--limit", "0"],
  ["boards", "list", "--limit", "101"],
  ["boards", "list", "--offset", "-1"],
  ["cards", "edit", "30"],
  ["cards", "create", "--board", "10", "--list", "20", "--name", " "],
  ["cards", "edit", "30", "--description", "x", "--clear-description"],
  ["cards", "edit", "30", "--description-file", "missing-file"],
  ["cards", "move", "30", "--list", "20", "--position", "NaN"],
])("rejects invalid arguments %j before accessing credentials", (...args) => {
  const result = run(...args, "--json");
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toMatchObject({
    ok: false,
    error: { code: expect.stringMatching(/^(USAGE|VALIDATION)$/) },
  });
});

it("prints readable errors by default", () => {
  const result = run("cards", "find");
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("code: USAGE");
});

it.each(["projects", "boards", "lists", "cards", "checklists", "tasks"])(
  "discovers %s without login",
  (group) => {
    const result = run(group, "--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`plankton ${group}`);
    expect(result.stderr).toBe("");
  },
);

it("rejects empty piped descriptions before credential access", () => {
  const result = spawnSync(
    process.execPath,
    [cli, "cards", "edit", "30", "--description-file", "-", "--json"],
    {
      encoding: "utf8",
      input: "",
    },
  );
  if (result.error) throw result.error;
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({
    ok: false,
    error: { code: "VALIDATION" },
  });
});
