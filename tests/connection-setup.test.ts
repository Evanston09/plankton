import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setupConnection } from "../packages/cli/src/setup.js";
import { browserLogin } from "../packages/cli/src/login.js";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  close: vi.fn(),
  goto: vi.fn(),
  isClosed: vi.fn(),
  launch: vi.fn(),
  now: 0,
}));
vi.mock("node:timers/promises", () => ({
  setTimeout: async (ms: number) => {
    mocks.now += ms;
  },
}));
vi.mock("../packages/cli/src/browser.js", () => ({ ensureBrowser: vi.fn() }));
vi.mock("../packages/cli/node_modules/playwright", () => ({
  chromium: { launch: mocks.launch },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => mocks.now);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.cookies.mockResolvedValue([{ name: "accessToken", value: "token" }]);
  mocks.launch.mockResolvedValue({
    isConnected: () => true,
    close: mocks.close,
    newContext: async () => ({
      cookies: mocks.cookies,
      newPage: async () => ({ goto: mocks.goto, isClosed: mocks.isClosed }),
    }),
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ item: { id: "1", name: "Alex" } })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function store() {
  return {
    read: vi.fn().mockResolvedValue({
      url: "https://planka.example",
      session: { accessToken: "old" },
    }),
    write: vi.fn(),
    clear: vi.fn(),
  };
}

it("verifies browser credentials once and closes before saving the replacement", async () => {
  const credentials = store();
  expect(await setupConnection(credentials)).toMatchObject({
    url: "https://planka.example",
    account: { id: "1" },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(credentials.write).toHaveBeenCalledWith({
    url: "https://planka.example",
    session: { accessToken: "token" },
  });
  expect(mocks.close.mock.invocationCallOrder[0]).toBeLessThan(
    credentials.write.mock.invocationCallOrder[0]!,
  );
});

it("waits for cookies to change after rejection rather than retrying unchanged credentials", async () => {
  mocks.cookies
    .mockResolvedValueOnce([{ name: "accessToken", value: "bad" }])
    .mockResolvedValueOnce([{ name: "accessToken", value: "bad" }]);
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
  await setupConnection(store());
  expect(mocks.cookies).toHaveBeenCalledTimes(3);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("preserves credentials and the original error when verification and cleanup both fail", async () => {
  const credentials = store();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
  mocks.close.mockRejectedValue(new Error("browser secret"));
  await expect(setupConnection(credentials)).rejects.toMatchObject({
    code: "PERMISSION",
  });
  expect(credentials.write).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledTimes(1);
});

it("does not save credentials if the verified browser cannot be closed", async () => {
  const credentials = store();
  mocks.close.mockRejectedValue(new Error("browser secret"));
  await expect(setupConnection(credentials)).rejects.toMatchObject({
    code: "LOGIN",
    message: "Could not close the login browser. Close it and retry login.",
  });
  expect(credentials.write).not.toHaveBeenCalled();
});

it("closes a timed-out browser without verifying or saving", async () => {
  mocks.cookies.mockResolvedValue([]);
  const verify = vi.fn();
  await expect(
    browserLogin("https://planka.example", verify, 1000),
  ).rejects.toMatchObject({
    code: "LOGIN",
    message: expect.stringContaining("timed out"),
  });
  expect(verify).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledTimes(1);
});

it("preserves the saved connection when the browser is closed by the user", async () => {
  const credentials = store();
  mocks.isClosed.mockReturnValue(true);
  await expect(setupConnection(credentials)).rejects.toMatchObject({
    code: "LOGIN",
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(credentials.write).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledTimes(1);
});

it("closes the browser on navigation failure and keeps errors sanitized", async () => {
  const credentials = store();
  mocks.goto.mockRejectedValue(new Error("navigation secret"));
  await expect(setupConnection(credentials)).rejects.toMatchObject({
    code: "LOGIN",
    message: "Browser login failed. Retry or use plankton login --manual.",
  });
  expect(credentials.write).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledTimes(1);
});
