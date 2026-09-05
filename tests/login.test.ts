import { expect, it, vi } from "vitest";
import { sessionFromCookies } from "../packages/cli/src/login.js";
import {
  saveValidatedConnection,
  connectedClient,
} from "../packages/cli/src/storage.js";
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
      saveValidatedConnection(store, "https://planka.example", {
        accessToken: "bad",
      }),
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
        await saveValidatedConnection(store, "https://planka.example/", {
          accessToken: "token",
        }),
      ).toMatchObject({ id: "1", username });
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
