import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlankaClient } from "../packages/core/src/index.js";
const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../packages/cli/src/storage.js", () => ({
  KeyringStore: class {},
  connectedClient: mocks.connect,
  saveValidatedConnection: vi.fn(),
}));
import { runCli } from "../packages/cli/src/commands.js";
import { compactResult } from "../packages/cli/src/output.js";

const card = {
  id: "30",
  name: "Intake",
  boardId: "10",
  listId: "20",
  description: "Detailed notes",
  internal: "omit me",
};
const board = {
  item: { id: "10", name: "Robot" },
  included: {
    lists: [
      { id: "20", name: "Todo", type: "active" },
      { id: "21", name: "Done", type: "closed" },
    ],
    cards: [card],
  },
};
const details = {
  item: card,
  included: {
    taskLists: [{ id: "40", name: "Build" }],
    tasks: [{ id: "50", name: "Test", taskListId: "40" }],
  },
};
let requests: { path: string; method: string; body?: unknown }[];
let responseQueue: unknown[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  requests = [];
  responseQueue = [];
  mocks.connect.mockResolvedValue(
    new PlankaClient({
      url: "https://planka.example",
      session: { accessToken: "fixture" },
      fetch: vi.fn(async (url, init) => {
        requests.push({
          path: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const data = responseQueue.shift();
        if (data instanceof Error) throw data;
        return data instanceof Response ? data : Response.json(data);
      }),
    }),
  );
});
afterEach(() => vi.restoreAllMocks());
const output = () => JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);

it("finds compact contextual matches, reads details and moves using the current board", async () => {
  responseQueue = [
    board,
    details,
    details,
    board,
    { item: { ...card, listId: "21" } },
  ];
  await runCli([
    "cards",
    "find",
    "--board",
    "10",
    "--query",
    "Intake",
    "--json",
  ]);
  expect(output()).toMatchObject({
    ok: true,
    data: {
      items: [
        {
          id: "30",
          boardName: "Robot",
          listName: "Todo",
          url: "https://planka.example/boards/10/cards/30",
        },
      ],
      truncated: false,
    },
  });
  expect(output().data.items[0]).not.toHaveProperty("description");
  expect(output().data.items[0]).not.toHaveProperty("internal");
  await runCli(["cards", "get", "30", "--json"]);
  expect(output().data.item.description).toBe("Detailed notes");
  expect(output().data.tasks[0].id).toBe("50");
  await runCli(["cards", "move", "30", "--list", "Done", "--json"]);
  expect(requests.at(-1)).toMatchObject({
    method: "PATCH",
    body: { boardId: "10", listId: "21", position: 65535 },
  });
  expect(output().data.item.listId).toBe("21");
});

it("creates and edits with a UTF-8 file without leaking descriptions into write summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plankton-description-"));
  const file = join(dir, "notes.md");
  const description = "First line\n`literal` $(literal) $HOME 🤖";
  try {
    await writeFile(file, description);
    responseQueue = [
      board,
      { item: { ...card, description } },
      details,
      { item: { ...card, description: null } },
    ];
    await runCli([
      "cards",
      "create",
      "--board",
      "10",
      "--list",
      "Todo",
      "--name",
      "Intake",
      "--description-file",
      file,
      "--json",
    ]);
    expect(requests.at(-1)?.body).toMatchObject({
      description,
      type: "project",
    });
    expect(output().data.item).not.toHaveProperty("description");
    await runCli(["cards", "edit", "30", "--clear-description", "--json"]);
    expect(requests.at(-1)?.body).toEqual({ description: null });
  } finally {
    await rm(dir, { recursive: true });
  }
});

it.each([
  {
    args: ["projects", "list"],
    responses: [{ items: [{ id: "1", name: "Team" }] }],
    path: "/api/projects",
  },
  {
    args: ["boards", "list", "--project", "Team"],
    responses: [
      {
        items: [{ id: "1", name: "Team" }],
        included: { boards: [{ id: "10", projectId: "1" }] },
      },
    ],
    path: "/api/projects",
  },
  {
    args: ["lists", "list", "--board", "10"],
    responses: [board],
    path: "/api/boards/10",
  },
  {
    args: ["checklists", "list", "--card", "30"],
    responses: [details],
    path: "/api/cards/30",
  },
  {
    args: ["checklists", "create", "--card", "30", "--name", "Build"],
    responses: [details, { item: { id: "40" } }],
    path: "/api/cards/30/task-lists",
    body: { name: "Build", position: 65535 },
  },
  {
    args: ["checklists", "edit", "40", "--card", "30", "--name", "Test"],
    responses: [details, { item: { id: "40" } }],
    path: "/api/task-lists/40",
    body: { name: "Test" },
  },
  {
    args: [
      "tasks",
      "add",
      "--card",
      "30",
      "--checklist",
      "Build",
      "--name",
      "Test",
    ],
    responses: [details, { item: { id: "50" } }],
    path: "/api/task-lists/40/tasks",
    body: { name: "Test", position: 65535 },
  },
  {
    args: ["tasks", "complete", "50", "--card", "30", "--checklist", "40"],
    responses: [details, { item: { id: "50", isCompleted: true } }],
    path: "/api/tasks/50",
    body: { isCompleted: true },
  },
  {
    args: [
      "tasks",
      "complete",
      "50",
      "--card",
      "30",
      "--checklist",
      "40",
      "--undo",
    ],
    responses: [details, { item: { id: "50", isCompleted: false } }],
    path: "/api/tasks/50",
    body: { isCompleted: false },
  },
])("executes $args", async ({ args, responses, path, body }) => {
  responseQueue = [...responses];
  await runCli([...args, "--json"]);
  expect(output().ok).toBe(true);
  expect(requests.at(-1)?.path).toBe("https://planka.example" + path);
  expect(requests.at(-1)?.body).toEqual(body);
});

it("returns ambiguity without writing, allowing the agent to use a resolved ID", async () => {
  responseQueue = [
    {
      ...board,
      included: {
        ...board.included,
        lists: [
          { id: "20", name: "Todo" },
          { id: "21", name: "Todo" },
        ],
      },
    },
  ];
  await expect(
    runCli([
      "cards",
      "create",
      "--board",
      "10",
      "--list",
      "Todo",
      "--name",
      "X",
    ]),
  ).rejects.toMatchObject({
    code: "AMBIGUOUS",
    details: { choices: [{ id: "20" }, { id: "21" }] },
  });
  expect(requests).toHaveLength(1);
});

it("does not repeat a write after losing its response", async () => {
  responseQueue = [board, new Error("connection lost")];
  await expect(
    runCli(["cards", "create", "--board", "10", "--list", "20", "--name", "X"]),
  ).rejects.toMatchObject({ code: "UNCERTAIN_WRITE" });
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(1);
  expect(console.log).not.toHaveBeenCalled();
});

it("pages browse output without losing truncation or rows", async () => {
  const items = Array.from({ length: 28 }, (_, i) => ({
    id: String(i + 1),
    name: `Project ${i}`,
    description: "large",
  }));
  responseQueue = [{ items }, { items }];
  await runCli(["projects", "list", "--json"]);
  expect(output().data.items).toHaveLength(25);
  expect(output().data).toMatchObject({
    truncated: true,
    paging: { items: { total: 28, nextOffset: 25 } },
  });
  await runCli(["projects", "list", "--offset", "25", "--json"]);
  expect(output().data.items.map((i: any) => i.id)).toEqual(["26", "27", "28"]);
  expect(output().data.truncated).toBe(false);
});

it("preserves upstream search truncation and bounds each checklist collection", () => {
  expect(
    compactResult({ items: [], truncated: true }, { limit: 25, offset: 0 }),
  ).toMatchObject({
    truncated: true,
  });
  const rows = [{ id: "1" }, { id: "2" }];
  expect(
    compactResult(
      { item: { id: "30" }, taskLists: rows, tasks: rows },
      { limit: 1, offset: 0 },
    ),
  ).toMatchObject({
    taskLists: [{ id: "1" }],
    tasks: [{ id: "1" }],
    truncated: true,
    paging: { taskLists: { nextOffset: 1 }, tasks: { nextOffset: 1 } },
  });
});

it("preserves bounded search output without adding paging or applying another offset", () => {
  const data = {
    items: [{ id: "1", name: "Card", description: "omit" }],
    truncated: true,
  };
  expect(compactResult(data, { limit: 1, offset: 10 })).toEqual({
    items: [{ id: "1", name: "Card" }],
    truncated: true,
  });
});

it("includes descriptions only in card details and preserves checklist links", () => {
  expect(
    compactResult({ item: card }, { limit: 25, offset: 0 }).item,
  ).not.toHaveProperty("description");
  expect(
    compactResult(
      { item: card, taskLists: [], tasks: [] },
      { limit: 25, offset: 0 },
    ).item,
  ).toHaveProperty("description", "Detailed notes");
  expect(
    compactResult(
      { items: [], tasks: [], url: "https://planka.example/cards/30" },
      { limit: 25, offset: 0 },
    ),
  ).toMatchObject({
    url: "https://planka.example/cards/30",
    paging: { items: { total: 0 }, tasks: { total: 0 } },
    truncated: false,
  });
});

it("lists cards with CLI offsets and optional queries", async () => {
  responseQueue = [board, board];
  await runCli([
    "cards",
    "list",
    "--board",
    "10",
    "--list",
    "Todo",
    "--offset",
    "1",
    "--json",
  ]);
  expect(output()).toMatchObject({
    data: { items: [], complete: true, paging: { items: { total: 1 } } },
  });
  await runCli(["cards", "find", "--board", "10", "--query", "", "--json"]);
  expect(output().data.items).toHaveLength(1);
});

it("completes bare task IDs and rejects unscoped names before credentials", async () => {
  responseQueue = [{ item: { id: "50", isCompleted: false } }];
  await runCli(["tasks", "complete", "50", "--undo", "--json"]);
  expect(requests).toEqual([
    {
      path: "https://planka.example/api/tasks/50",
      method: "PATCH",
      body: { isCompleted: false },
    },
  ]);
  mocks.connect.mockClear();
  await expect(runCli(["tasks", "complete", "Task"])).rejects.toThrow();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("classifies syntax errors separately from invalid input values", async () => {
  await expect(runCli(["cards", "unknown"])).rejects.toMatchObject({
    code: "USAGE",
    message: expect.not.stringMatching(/^error:/),
  });
  await expect(
    runCli(["cards", "list", "--board", "10", "--limit", "0"]),
  ).rejects.toMatchObject({ code: "VALIDATION" });
});
