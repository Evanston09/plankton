import { describe, expect, it, vi } from "vitest";
import {
  PlankaClient,
  errorResult,
  normalizeUrl,
  sessionSchema,
} from "../packages/core/src/index.js";
import { itemsResponseSchema } from "../packages/core/src/schemas.js";
import { PlankaTransport } from "../packages/core/src/transport.js";
const board = {
  item: { id: "10", name: "Board" },
  included: {
    lists: [
      { id: "20", name: "Todo", type: "active" },
      { id: "21", name: "Done", type: "closed" },
    ],
    cards: [{ id: "30", name: "Example", listId: "20" }],
  },
};
function client(responses: unknown[]) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next instanceof Response ? next : Response.json(next);
    },
  );
  return {
    api: new PlankaClient({
      url: "https://planka.example/sub",
      session: { accessToken: "secret", httpOnlyToken: "companion" },
      fetch: fetcher,
    }),
    requests,
  };
}

it("resolves an exact card name independently of the display search limit", async () => {
  const cards = [
    { id: "30", name: "Example" },
    ...Array.from({ length: 101 }, (_, i) => ({
      id: String(i + 100),
      name: `Example ${i}`,
    })),
  ];
  const snapshot = { ...board, included: { ...board.included, cards } };
  const { api, requests } = client([
    snapshot,
    { item: cards[0], included: { taskLists: [], tasks: [] } },
    snapshot,
  ]);
  expect(
    await api.execute("read_card", { card: "Example", board: "10" }),
  ).toMatchObject({ item: { id: "30" } });
  expect(requests[1]?.url).toMatch(/cards\/30$/);
  const found = await api.execute("find_cards", {
    board: "10",
    query: "Example",
    limit: 100,
  });
  expect(found.items).toHaveLength(100);
  expect(found.truncated).toBe(true);
});

it.each([
  {},
  { item: { id: "10" } },
  { ...board, included: { lists: [] } },
  {
    ...board,
    included: { ...board.included, cards: [{ id: "30", boardId: 10 }] },
  },
  {
    ...board,
    included: { ...board.included, lists: [{ id: "20", type: false }] },
  },
])(
  "rejects malformed board responses instead of returning empty results: %j",
  async (response) => {
    const { api } = client([response]);
    await expect(
      api.execute("find_cards", { board: "10", query: "Example" }),
    ).rejects.toMatchObject({ code: "NETWORK" });
  },
);

it("rejects a missing endless-list page instead of treating it as scan completion", async () => {
  const { api } = client([
    {
      ...board,
      included: { ...board.included, lists: [{ id: "22", type: "archive" }] },
    },
    {},
  ]);
  await expect(
    api.execute("find_cards", { board: "10", query: "Example" }),
  ).rejects.toMatchObject({ code: "NETWORK" });
});

it("requires checklist collections in card responses", async () => {
  const { api } = client([{ item: { id: "30" } }]);
  await expect(api.execute("read_card", { card: "30" })).rejects.toMatchObject({
    code: "NETWORK",
  });
});

it("validates collection responses independently of the request path", async () => {
  const transport = new PlankaTransport({
    url: "https://planka.example",
    session: { accessToken: "token" },
    fetch: vi.fn().mockResolvedValue(Response.json({})),
  });
  await expect(
    transport.request("arbitrary-collection", itemsResponseSchema),
  ).rejects.toMatchObject({ code: "NETWORK" });
});

it("preserves write uncertainty for invalid relationship fields", async () => {
  const { api, requests } = client([board, { item: { id: "31", listId: 20 } }]);
  await expect(
    api.execute("create_card", { board: "10", list: "20", name: "New" }),
  ).rejects.toMatchObject({ code: "UNCERTAIN_WRITE" });
  expect(requests).toHaveLength(2);
});
describe("rc.4 API contracts", () => {
  it("creates a card with rc.4 fields and both credentials, returning its direct link", async () => {
    const { api, requests } = client([
      board,
      { item: { id: "31", name: "New" } },
    ]);
    expect(
      await api.execute("create_card", {
        board: "10",
        list: "Todo",
        name: "New",
      }),
    ).toEqual({
      item: {
        id: "31",
        name: "New",
        url: "https://planka.example/sub/cards/31",
      },
    });
    expect(requests[1]?.url).toBe(
      "https://planka.example/sub/api/lists/20/cards",
    );
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      name: "New",
      type: "project",
      position: 65535,
    });
    expect(requests[1]?.init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: "Bearer secret",
        Cookie: "httpOnlyToken=companion",
      },
    });
  });
  it("returns ambiguity choices without writing", async () => {
    const { api, requests } = client([
      {
        ...board,
        included: {
          cards: [],
          lists: [
            { id: "20", name: "Todo" },
            { id: "21", name: "Todo" },
          ],
        },
      },
    ]);
    await expect(
      api.execute("create_card", { board: "10", list: "Todo", name: "X" }),
    ).rejects.toMatchObject({
      code: "AMBIGUOUS",
      details: {
        choices: [
          { id: "20", name: "Todo" },
          { id: "21", name: "Todo" },
        ],
      },
    });
    expect(requests).toHaveLength(1);
  });
  it.each([
    [401, "AUTHENTICATION"],
    [403, "PERMISSION"],
    [404, "NOT_FOUND"],
    [422, "VALIDATION"],
  ])("classifies HTTP %s", async (status, code) => {
    const { api } = client([
      new Response("secret server detail", { status: Number(status) }),
    ]);
    await expect(api.execute("projects", {})).rejects.toMatchObject({ code });
  });
  it("does not retry uncertain writes or expose transport secrets", async () => {
    const { api, requests } = client([board, new Error("secret")]);
    const result = await api
      .execute("create_card", { board: "10", list: "Todo", name: "X" })
      .catch(errorResult);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNCERTAIN_WRITE" },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(requests).toHaveLength(2);
  });
  it("marks malformed successful write responses as uncertain", async () => {
    const { api } = client([board, new Response("not json")]);
    await expect(
      api.execute("create_card", { board: "10", list: "Todo", name: "X" }),
    ).rejects.toMatchObject({ code: "UNCERTAIN_WRITE" });
  });
  it("rejects foreign links without making a request", async () => {
    const { api, requests } = client([]);
    await expect(
      api.execute("read_card", { card: "https://other.example/cards/30" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(requests).toHaveLength(0);
  });
  it("searches finite cards and paginates endless lists", async () => {
    const { api, requests } = client([
      {
        ...board,
        included: {
          ...board.included,
          lists: [...board.included.lists, { id: "22", type: "archive" }],
        },
      },
      {
        items: [
          {
            id: "32",
            name: "Example archived",
            listChangedAt: "2025-01-01T00:00:00Z",
          },
        ],
      },
      { items: [] },
    ]);
    expect(
      await api.execute("find_cards", { board: "10", query: "Example" }),
    ).toMatchObject({ items: [{ id: "30" }, { id: "32" }], truncated: false });
    expect(requests).toHaveLength(3);
    expect(requests[2]?.url).toContain("before=");
  });
  it("reports incomplete results and refuses ambiguous incomplete name resolution", async () => {
    const data = {
      ...board,
      included: { ...board.included, lists: [{ id: "22", type: "archive" }] },
    };
    const { api } = client([data, { items: [{ id: "32", name: "Example" }] }]);
    await expect(
      api.execute("read_card", { card: "Example", board: "10" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("scopes task completion to the selected card and checklist", async () => {
    const { api, requests } = client([
      {
        item: { id: "30" },
        included: {
          taskLists: [{ id: "40", name: "Checklist" }],
          tasks: [
            { id: "50", name: "Task", taskListId: "40" },
            { id: "51", name: "Task", taskListId: "41" },
          ],
        },
      },
      { item: { id: "50", isCompleted: true } },
    ]);
    await api.execute("complete_task", {
      card: "30",
      taskList: "Checklist",
      task: "Task",
    });
    expect(requests[1]?.url).toMatch(/tasks\/50$/);
    expect(requests[1]?.init?.body).toBe('{"isCompleted":true}');
  });
  it("validates direct library callers", async () => {
    const { api, requests } = client([]);
    await expect(
      api.execute("create_card", { board: "10", list: "20", name: " " }),
    ).rejects.toThrow();
    await expect(api.execute("edit_card", { card: "30" })).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
  it("never discloses arbitrary errors", () =>
    expect(JSON.stringify(errorResult(new Error("secret")))).not.toContain(
      "secret",
    ));
  it("rejects credential injection and insecure remote URLs", () => {
    expect(() =>
      sessionSchema.parse({ accessToken: "x\r\nInjected: yes" }),
    ).toThrow();
    expect(() => normalizeUrl("http://planka.example")).toThrow();
    expect(normalizeUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
  });
});
it("does not permit creating or moving into trash", async () => {
  const trashBoard = {
    ...board,
    included: {
      cards: [],
      lists: [{ id: "99", name: "Trash", type: "trash" }],
    },
  };
  const { api, requests } = client([trashBoard]);
  await expect(
    api.execute("create_card", { board: "10", list: "Trash", name: "X" }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
  expect(requests).toHaveLength(1);
  const moved = client([
    { item: { id: "30" }, included: { taskLists: [], tasks: [] } },
    trashBoard,
  ]);
  await expect(
    moved.api.execute("move_card", {
      card: "30",
      destinationBoard: "10",
      list: "Trash",
    }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
  expect(moved.requests).toHaveLength(2);
});
it("reports uncertainty when a write response omits its resource", async () => {
  const { api } = client([board, {}]);
  await expect(
    api.execute("create_card", { board: "10", list: "Todo", name: "X" }),
  ).rejects.toMatchObject({ code: "UNCERTAIN_WRITE" });
});

it("edits and moves cards while preserving their direct links and request fields", async () => {
  const edited = client([
    { item: { id: "30" }, included: { taskLists: [], tasks: [] } },
    { item: { id: "30", name: "Renamed" } },
  ]);
  expect(
    await edited.api.execute("edit_card", {
      card: "30",
      name: "Renamed",
      description: null,
    }),
  ).toEqual({
    item: {
      id: "30",
      name: "Renamed",
      url: "https://planka.example/sub/cards/30",
    },
  });
  expect(edited.requests[1]).toMatchObject({
    url: "https://planka.example/sub/api/cards/30",
    init: {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed", description: null }),
    },
  });

  const moved = client([
    { item: { id: "30" }, included: { taskLists: [], tasks: [] } },
    board,
    { item: { id: "30", listId: "21" } },
  ]);
  expect(
    await moved.api.execute("move_card", {
      card: "30",
      destinationBoard: "10",
      list: "Done",
    }),
  ).toMatchObject({
    item: {
      id: "30",
      listId: "21",
      url: "https://planka.example/sub/cards/30",
    },
  });
  expect(moved.requests[2]).toMatchObject({
    url: "https://planka.example/sub/api/cards/30",
    init: {
      method: "PATCH",
      body: JSON.stringify({ boardId: "10", listId: "21", position: 65535 }),
    },
  });
});

it.each([
  {
    operation: "create_task_list",
    path: "cards/30/task-lists",
    method: "POST",
    body: { name: "New", position: 65535 },
  },
  {
    operation: "edit_task_list",
    path: "task-lists/40",
    method: "PATCH",
    body: { name: "New" },
  },
  {
    operation: "add_task",
    path: "task-lists/40/tasks",
    method: "POST",
    body: { name: "New", position: 65535 },
  },
] as const)(
  "dispatches $operation and returns the parent card link",
  async ({ operation, path, method, body }) => {
    const { api, requests } = client([
      {
        item: { id: "30" },
        included: { taskLists: [{ id: "40", name: "Checklist" }], tasks: [] },
      },
      { item: { id: "50", name: "New" } },
    ]);
    const input =
      operation === "create_task_list"
        ? { card: "30", name: "New" }
        : { card: "30", taskList: "Checklist", name: "New" };
    expect(await api.execute(operation, input)).toEqual({
      item: { id: "50", name: "New" },
      url: "https://planka.example/sub/cards/30",
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      url: `https://planka.example/sub/api/${path}`,
      init: { method, body: JSON.stringify(body) },
    });
  },
);
