import { EventEmitter } from "node:events";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  spawn: vi.fn(),
  ask: vi.fn(),
  login: vi.fn(),
  save: vi.fn(),
}));
vi.mock("node:fs", () => ({ existsSync: mocks.exists }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("playwright", () => ({
  chromium: { executablePath: () => "/mock/chromium" },
}));
vi.mock("../packages/cli/src/prompt.js", () => ({ ask: mocks.ask }));
vi.mock("../packages/cli/src/login.js", () => ({ browserLogin: mocks.login }));
vi.mock("../packages/cli/src/storage.js", () => ({
  KeyringStore: class {
    async read() {
      return undefined;
    }
  },
  connectedClient: vi.fn(),
  saveValidatedConnection: mocks.save,
}));

import { runCli } from "../packages/cli/src/commands.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.login.mockResolvedValue({ accessToken: "token" });
  mocks.save.mockResolvedValue({ id: "1" });
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0));
    return child;
  });
});
afterEach(() => vi.restoreAllMocks());

it("installs missing Chromium before browser setup logs in", async () => {
  mocks.exists.mockReturnValue(false);
  await runCli(["setup", "https://planka.example"]);
  expect(mocks.spawn).toHaveBeenCalledWith(
    process.execPath,
    [expect.stringMatching(/cli\.js$/), "install", "chromium"],
    { stdio: ["ignore", 2, 2] },
  );
  expect(mocks.spawn.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.login.mock.invocationCallOrder[0]!,
  );
  expect(mocks.login).toHaveBeenCalledWith("https://planka.example");
  expect(mocks.save).toHaveBeenCalled();
});

it("reuses installed Chromium", async () => {
  mocks.exists.mockReturnValue(true);
  await runCli(["setup", "https://planka.example"]);
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(mocks.login).toHaveBeenCalled();
});

it("skips browser installation for manual setup", async () => {
  mocks.ask.mockReset();
  mocks.ask.mockResolvedValueOnce("token").mockResolvedValueOnce("");
  await runCli(["setup", "https://planka.example", "--manual"]);
  expect(mocks.exists).not.toHaveBeenCalled();
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(mocks.login).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalled();
});

it.each(["exit", "error"])(
  "stops setup if Chromium installation fails with %s",
  async (event) => {
    mocks.exists.mockReturnValue(false);
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() =>
        child.emit(event, event === "exit" ? 1 : new Error("spawn failed")),
      );
      return child;
    });
    await expect(
      runCli(["setup", "https://planka.example"]),
    ).rejects.toMatchObject({
      code: "LOGIN",
    });
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  },
);

it("runs browser setup with a supplied URL without terminal prompts", async () => {
  mocks.exists.mockReturnValue(true);
  await runCli(["setup", "https://planka.example", "--json"]);
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(
    JSON.stringify({
      ok: true,
      data: { url: "https://planka.example", account: { id: "1" } },
    }),
  );
});

it("also installs a missing browser during login", async () => {
  mocks.exists.mockReturnValue(false);
  await runCli(["login", "https://planka.example"]);
  expect(mocks.spawn).toHaveBeenCalled();
  expect(mocks.ask).not.toHaveBeenCalled();
});

it("requires a URL when no saved connection or terminal is available", async () => {
  await expect(runCli(["setup"])).rejects.toMatchObject({
    code: "VALIDATION",
    message: expect.stringContaining("plankton setup https://"),
  });
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.login).not.toHaveBeenCalled();
});
