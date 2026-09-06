import { expect, it, vi } from "vitest";
import { sessionFromCookies } from "../packages/cli/src/login.js";
import { connectedClient } from "../packages/cli/src/storage.js";
import { setupConnection } from "../packages/cli/src/setup.js";
vi.mock("../packages/cli/src/prompt.js", () => ({
  ask: vi.fn(async (prompt: string) =>
    prompt.startsWith("accessToken") ? "token" : "",
  ),
}));
it("captures only the required session cookies", () => {
  expect(
    sessionFromCookies([
      { name: "accessToken", value: "token" },
      { name: "httpOnlyToken", value: "companion" },
      { name: "sso", value: "unrelated" },
    ]),
  ).toEqual({ accessToken: "token", httpOnlyToken: "companion" });
  expect(
    sessionFromCookies([{ name: "httpOnlyToken", value: "companion" }]),
  ).toBeUndefined();
});
it("validates a replacement before saving and preserves the old connection on failure", async () => {
  const store = { read: vi.fn(), write: vi.fn(), clear: vi.fn() };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 401 })),
  );
  try {
    await expect(
      setupConnection(store, "https://planka.example", { manual: true }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION" });
    expect(store.write).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it.each([undefined, null, "user"])(
  "saves a verified account with username %s and its connection",
  async (username) => {
    const store = { read: vi.fn(), write: vi.fn(), clear: vi.fn() };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ item: { id: "1", name: "User", username } }),
        ),
    );
    try {
      expect(
        await setupConnection(store, "https://planka.example/", {
          manual: true,
        }),
      ).toMatchObject({ account: { id: "1", username } });
      expect(store.write).toHaveBeenCalledWith({
        url: "https://planka.example",
        session: { accessToken: "token" },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
it("requires setup when no connection exists", async () => {
  await expect(
    connectedClient({
      read: async () => undefined,
      write: vi.fn(),
      clear: vi.fn(),
    }),
  ).rejects.toMatchObject({ code: "AUTHENTICATION" });
});
