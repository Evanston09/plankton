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
    board,
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

it.each([
  ["2026-09-10T17:00:00Z", "2026-09-10T17:00:00.000Z"],
  ["2026-09-10T17:00:00-04:00", "2026-09-10T21:00:00.000Z"],
  [null, null],
])("sets or clears a due date: %s", async (input, dueDate) => {
  responseQueue = [details, { item: { ...card, dueDate } }];
  await runCli([
    "cards",
    "edit",
    "30",
    ...(input ? ["--due-date", input] : ["--clear-due-date"]),
    "--json",
  ]);
  expect(requests.at(-1)).toMatchObject({ method: "PATCH", body: { dueDate } });
  expect(requests.at(-1)?.body).toEqual({ dueDate });
  expect(output().data.item.dueDate).toBe(dueDate);
});

it.each([
  ["--due-date", "tomorrow"],
  ["--due-date", "2026-02-30T12:00:00Z"],
  ["--due-date", "2026-09-10T12:00:00"],
  ["--due-date", "2026-09-10T12:00:00Z", "--clear-due-date"],
])(
  "rejects invalid or conflicting due date input before credentials: %s",
  async (...flags) => {
    await expect(runCli(["cards", "edit", "30", ...flags])).rejects.toThrow();
    expect(mocks.connect).not.toHaveBeenCalled();
  },
);

const assignmentsBoard = {
  ...board,
  included: {
    ...board.included,
    labels: [{ id: "60", name: "Urgent" }],
    users: [
      { id: "70", name: "Alex", username: "alex" },
      { id: "71", name: "Former member" },
    ],
    boardMemberships: [{ id: "80", userId: "70" }],
  },
};

it.each([
  ["add-label", "--label", "Urgent", "card-labels", "labelId", "60", "POST"],
  [
    "remove-label",
    "--label",
    "Urgent",
    "card-labels/labelId:60",
    "labelId",
    "60",
    "DELETE",
  ],
  ["assign", "--member", "Alex", "card-memberships", "userId", "70", "POST"],
  ["assign", "--member", "@alex", "card-memberships", "userId", "70", "POST"],
  [
    "unassign",
    "--member",
    "Alex",
    "card-memberships/userId:70",
    "userId",
    "70",
    "DELETE",
  ],
])(
  "executes cards %s with a scoped name",
  async (command, flag, value, path, key, id, method) => {
    responseQueue = [
      details,
      assignmentsBoard,
      { item: { id: "90", cardId: "30", [key]: id } },
    ];
    await runCli(["cards", command, "30", flag, value, "--json"]);
    expect(requests.at(-1)).toEqual({
      path: `https://planka.example/api/cards/30/${path}`,
      method,
      body: method === "POST" ? { [key]: id } : undefined,
    });
    expect(output().data).toMatchObject({
      item: { cardId: "30", [key]: id },
      url: "https://planka.example/boards/10/cards/30",
    });
  },
);

it.each([
  ["add-label", "--label", "60", "card-labels", "labelId", "POST"],
  [
    "remove-label",
    "--label",
    "60",
    "card-labels/labelId:60",
    "labelId",
    "DELETE",
  ],
  ["assign", "--member", "70", "card-memberships", "userId", "POST"],
  [
    "unassign",
    "--member",
    "70",
    "card-memberships/userId:70",
    "userId",
    "DELETE",
  ],
])(
  "executes cards %s using IDs without board discovery",
  async (command, flag, id, path, key, method) => {
    responseQueue = [details, { item: { id: "90", cardId: "30", [key]: id } }];
    await runCli(["cards", command, "30", flag, id, "--json"]);
    expect(requests).toHaveLength(2);
    expect(requests.at(-1)).toEqual({
      path: `https://planka.example/api/cards/30/${path}`,
      method,
      body: method === "POST" ? { [key]: id } : undefined,
    });
  },
);

it("rejects ambiguous labels and nonmembers without writing", async () => {
  responseQueue = [
    details,
    {
      ...assignmentsBoard,
      included: {
        ...assignmentsBoard.included,
        labels: [
          { id: "60", name: "Urgent" },
          { id: "61", name: "Urgent" },
        ],
      },
    },
  ];
  await expect(
    runCli(["cards", "add-label", "30", "--label", "Urgent"]),
  ).rejects.toMatchObject({ code: "AMBIGUOUS" });
  responseQueue = [details, assignmentsBoard];
  await expect(
    runCli(["cards", "assign", "30", "--member", "Former member"]),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(requests.every((request) => request.method === "GET")).toBe(true);
});

it.each(["labels", "members"])(
  "discovers board %s with paging and compact metadata",
  async (command) => {
    responseQueue = [
      {
        ...assignmentsBoard,
        included: {
          ...assignmentsBoard.included,
          labels: [
            {
              id: "60",
              name: "Unstarted",
              color: "berry-red",
              internal: "omit",
            },
            { id: "61", name: "Done" },
          ],
          boardMemberships: [{ id: "80", userId: "70", role: "editor" }],
        },
      },
    ];
    await runCli([
      "boards",
      command,
      "--board",
      "https://planka.example/boards/10",
      "--limit",
      "1",
      "--json",
    ]);
    expect(output().data.items).toEqual(
      command === "labels"
        ? [{ id: "60", name: "Unstarted", color: "berry-red" }]
        : [{ id: "70", name: "Alex", username: "alex", role: "editor" }],
    );
    expect(output().data.paging.items.total).toBe(command === "labels" ? 2 : 1);
    expect(requests).toHaveLength(1);
  },
);

it("reads only the card's assigned members and labels, including unresolved IDs", async () => {
  responseQueue = [
    {
      ...details,
      included: {
        ...details.included,
        users: [{ id: "99", name: "Creator only" }],
        cardMemberships: [
          { id: "80", cardId: "30", userId: "70" },
          { id: "81", cardId: "31", userId: "71" },
          { id: "82", cardId: "30", userId: "72" },
        ],
        cardLabels: [{ id: "90", cardId: "30", labelId: "60" }],
      },
    },
    assignmentsBoard,
  ];
  await runCli(["cards", "get", "30", "--limit", "1", "--json"]);
  expect(output().data.item.members).toEqual([
    { id: "70", name: "Alex", username: "alex" },
    { id: "72" },
  ]);
  expect(output().data.item.labels).toEqual([{ id: "60", name: "Urgent" }]);
  expect(output().data.item.memberIds).toEqual(["70", "72"]);
  expect(requests.map((r) => r.path)).toEqual([
    "https://planka.example/api/cards/30",
    "https://planka.example/api/boards/10",
  ]);
});

it("includes board context even with empty assignments", async () => {
  responseQueue = [details, board];
  await runCli(["cards", "get", "30", "--json"]);
  expect(output().data).toMatchObject({
    item: { boardName: "Robot", listName: "Todo", members: [], labels: [] },
  });
  expect(requests).toHaveLength(2);
});

it.each([
  ["add-label", "--label", "Not Started", [{ id: "60", name: "Urgent" }]],
  [
    "assign",
    "--member",
    "programming assignees",
    [{ id: "70", name: "Alex", username: "alex" }],
  ],
  [
    "assign",
    "--member",
    "@missing",
    [{ id: "70", name: "Alex", username: "alex" }],
  ],
])(
  "returns available choices for unresolved %s %s %s",
  async (command, flag, value, choices) => {
    responseQueue = [details, assignmentsBoard];
    await expect(
      runCli([
        "cards",
        command as string,
        "30",
        flag as string,
        value as string,
      ]),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      details: { choices },
    });
    expect(requests.every((r) => r.method === "GET")).toBe(true);
  },
);

it("caps available choices and discloses truncation", async () => {
  responseQueue = [
    details,
    {
      ...assignmentsBoard,
      included: {
        ...assignmentsBoard.included,
        labels: Array.from({ length: 26 }, (_, i) => ({
          id: String(i + 100),
          name: `Label ${i}`,
        })),
      },
    },
  ];
  const error = await runCli([
    "cards",
    "add-label",
    "30",
    "--label",
    "Missing",
  ]).catch((error) => error);
  expect(error).toMatchObject({
    code: "NOT_FOUND",
    details: { truncated: true, total: 26 },
  });
  expect(error.details.choices).toHaveLength(25);
});

it.each(["labels", "members"])(
  "requires a board for discovery of %s before credentials",
  async (command) => {
    await expect(runCli(["boards", command])).rejects.toMatchObject({
      code: "USAGE",
    });
    expect(mocks.connect).not.toHaveBeenCalled();
  },
);

it("creates with repeatable members and labels, resolving and deduplicating before writing", async () => {
  responseQueue = [
    assignmentsBoard,
    { item: card },
    { item: { id: "80", cardId: "30", userId: "70" } },
    { item: { id: "81", cardId: "30", userId: "72" } },
    { item: { id: "90", cardId: "30", labelId: "60" } },
  ];
  await runCli([
    "cards",
    "create",
    "--board",
    "10",
    "--list",
    "Todo",
    "--name",
    "Light mount",
    "--member",
    "@alex",
    "--member",
    "70",
    "--member",
    "72",
    "--label",
    "Urgent",
    "--json",
  ]);
  expect(requests.map((request) => request.body)).toEqual([
    undefined,
    { name: "Light mount", type: "project", position: 65535 },
    { userId: "70" },
    { userId: "72" },
    { labelId: "60" },
  ]);
  expect(output().data.item).toMatchObject({
    id: "30",
    memberIds: ["70", "72"],
    labelIds: ["60"],
  });
});

it("rejects unresolved create associations before creating the card", async () => {
  responseQueue = [assignmentsBoard];
  await expect(
    runCli([
      "cards",
      "create",
      "--board",
      "10",
      "--list",
      "Todo",
      "--name",
      "Light mount",
      "--member",
      "Alex",
      "--label",
      "Missing",
    ]),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(requests).toHaveLength(1);
});

it.each([
  ["assign", "--member", "@alex", "72", "userId", "card-memberships", "POST"],
  [
    "unassign",
    "--member",
    "@alex",
    "72",
    "userId",
    "card-memberships",
    "DELETE",
  ],
  ["add-label", "--label", "Urgent", "61", "labelId", "card-labels", "POST"],
  [
    "remove-label",
    "--label",
    "Urgent",
    "61",
    "labelId",
    "card-labels",
    "DELETE",
  ],
])(
  "batches %s with one board lookup and returns every association",
  async (command, flag, name, second, key, collection, method) => {
    const first = key === "userId" ? "70" : "60";
    const items = [
      { id: "90", cardId: "30", [key!]: first },
      { id: "91", cardId: "30", [key!]: second },
    ];
    responseQueue = [
      details,
      assignmentsBoard,
      ...items.map((item) => ({ item })),
    ];
    await runCli([
      "cards",
      command!,
      "30",
      flag!,
      name!,
      flag!,
      second!,
      flag!,
      first,
      "--json",
    ]);
    expect(output().data.items).toEqual(items);
    expect(requests.slice(2)).toEqual(
      [first, second].map((id) => ({
        path: `https://planka.example/api/cards/30/${collection}${method === "DELETE" ? `/${key}:${id}` : ""}`,
        method,
        body: method === "DELETE" ? undefined : { [key!]: id },
      })),
    );
  },
);

it("validates all batch references before changing any associations", async () => {
  responseQueue = [details, assignmentsBoard];
  await expect(
    runCli([
      "cards",
      "assign",
      "30",
      "--member",
      "Alex",
      "--member",
      "Missing",
    ]),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(requests.every((request) => request.method === "GET")).toBe(true);
});

it("reports the created card and completed associations when a later write is uncertain", async () => {
  responseQueue = [
    assignmentsBoard,
    { item: card },
    { item: { id: "80", userId: "70" } },
    new Error("secret"),
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
      "Light mount",
      "--member",
      "70",
      "--member",
      "72",
      "--label",
      "60",
    ]),
  ).rejects.toMatchObject({
    code: "UNCERTAIN_WRITE",
    details: {
      cardId: "30",
      created: true,
      completed: [{ key: "userId", id: "70" }],
      failed: { key: "userId", id: "72" },
      pending: [{ key: "labelId", id: "60" }],
    },
  });
  expect(requests).toHaveLength(4);
});

const searchableBoard = {
  ...assignmentsBoard,
  included: {
    ...assignmentsBoard.included,
    cards: [card, { id: "31", name: "Unrelated", listId: "21" }],
    cardMemberships: [{ id: "80", cardId: "30", userId: "70" }],
    cardLabels: [{ id: "90", cardId: "30", labelId: "60" }],
  },
};
it.each(["INTAKE", "detailed NOTES", "urgent", "Alex", "@alex", "60", "70"])(
  "finds %s across card context with one board request",
  async (query) => {
    responseQueue = [searchableBoard];
    await runCli([
      "cards",
      "find",
      "--board",
      "10",
      "--query",
      query,
      "--json",
    ]);
    expect(output().data.items).toHaveLength(1);
    expect(output().data.items[0]).toMatchObject({
      id: "30",
      labelIds: ["60"],
      memberIds: ["70"],
    });
    expect(requests).toHaveLength(1);
  },
);

it("keeps list and get summaries consistent, including complete nested associations", async () => {
  responseQueue = [
    searchableBoard,
    {
      ...details,
      included: {
        ...details.included,
        cardMemberships: searchableBoard.included.cardMemberships,
        cardLabels: searchableBoard.included.cardLabels,
      },
    },
    searchableBoard,
  ];
  await runCli(["cards", "list", "--board", "10", "--json"]);
  const listed = output().data.items[0];
  await runCli([
    "cards",
    "get",
    "30",
    "--limit",
    "1",
    "--offset",
    "1",
    "--json",
  ]);
  expect(output().data.item).toEqual({
    ...listed,
    description: card.description,
  });
  expect(output().data).not.toHaveProperty("members");
  expect(output().data).not.toHaveProperty("labels");
});

it("filters before pagination when matches occur in descriptions and labels", async () => {
  responseQueue = [
    {
      ...searchableBoard,
      included: {
        ...searchableBoard.included,
        cards: [
          { ...card, description: "Urgent wiring" },
          { id: "31", name: "Urgent follow-up", listId: "20" },
          { id: "32", name: "Urgent in Done", listId: "21" },
        ],
      },
    },
  ];
  await runCli([
    "cards",
    "find",
    "--board",
    "10",
    "--query",
    "urgent",
    "--list",
    "Todo",
    "--offset",
    "1",
    "--limit",
    "1",
    "--json",
  ]);
  expect(output().data).toMatchObject({
    items: [{ id: "31" }],
    paging: { items: { total: 2 } },
    truncated: false,
  });
});

it("searches archived associations from list pages without per-card reads", async () => {
  responseQueue = [
    {
      ...searchableBoard,
      included: {
        ...searchableBoard.included,
        lists: [{ id: "22", type: "archive" }],
      },
    },
    {
      items: [
        {
          id: "32",
          name: "Archived",
          listId: "22",
          listChangedAt: "2026-01-01T00:00:00Z",
        },
      ],
      included: {
        cardMemberships: [{ id: "81", cardId: "32", userId: "70" }],
        cardLabels: [{ id: "91", cardId: "32", labelId: "60" }],
      },
    },
    { items: [] },
  ];
  await runCli([
    "cards",
    "find",
    "--board",
    "10",
    "--list",
    "22",
    "--query",
    "Urgent",
    "--json",
  ]);
  expect(output().data).toMatchObject({
    items: [{ id: "32", labelIds: ["60"], memberIds: ["70"] }],
    complete: true,
  });
  expect(requests).toHaveLength(3);
});
