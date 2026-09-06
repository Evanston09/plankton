import { afterEach, expect, it, vi } from "vitest";
import type { CardSummary } from "../packages/core/src/index.js";
import {
  compactResult,
  printError,
  printResult,
} from "../packages/cli/src/output.js";

const columnsDescriptor = Object.getOwnPropertyDescriptor(
  process.stdout,
  "columns",
);
afterEach(() => {
  vi.restoreAllMocks();
  if (columnsDescriptor)
    Object.defineProperty(process.stdout, "columns", columnsDescriptor);
  else delete process.stdout.columns;
});

function humanOutput(data: Record<string, unknown>, width = 100): string {
  Object.defineProperty(process.stdout, "columns", {
    configurable: true,
    value: width,
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  printResult(data, false);
  return log.mock.calls.at(-1)![0];
}

it("renders collections with shared headers and missing optional fields", () => {
  const output = humanOutput({
    items: [
      { id: "1", name: "Robot" },
      { id: "2", name: "Drive", boardId: "10" },
    ],
  });
  expect(output).toContain("Items\n┌");
  expect(output).toMatch(/│ ID\s+│ Name\s+│ Board ID\s+│/);
  expect(output).toMatch(/│ 1\s+│ Robot\s+│\s+│/);
  expect(output).toMatch(/│ 2\s+│ Drive\s+│ 10\s+│/);
});

it("renders details, checklists, empty collections and paging without losing context", () => {
  const output = humanOutput({
    item: {
      id: "30",
      name: "Intake",
      isCompleted: false,
      dueDate: null,
      members: [{ id: "4", name: "Alex" }],
    },
    taskLists: [{ id: "40", name: "Build" }],
    tasks: [],
    url: "https://planka.example/cards/30",
    paging: { tasks: { total: 12, nextOffset: 1 } },
    truncated: true,
    complete: false,
  });
  for (const text of [
    "Item\n┌",
    "Intake",
    "Is Completed",
    "false",
    "null",
    "Alex",
    "Task Lists\n┌",
    "Build",
    "tasks:\n  (none)",
    "https://planka.example/cards/30",
    "total: 12",
    "nextOffset: 1",
    "truncated: true",
    "complete: false",
  ])
    expect(output).toContain(text);
});

it("stacks wide collections and wraps long values without truncation", () => {
  const output = humanOutput(
    {
      items: [
        {
          id: "30",
          name: "A".repeat(120),
          boardName: "Robot",
          listName: "Todo",
        },
      ],
    },
    40,
  );
  expect(output).toContain("Board Name");
  expect(output).toContain("Robot");
  expect(output.match(/A/g)).toHaveLength(120);
  expect(output).not.toContain("…");
  expect(output.split("\n").every((line) => line.length <= 40)).toBe(true);
});

it("escapes terminal controls in table cells, nested arrays and field names", () => {
  const output = humanOutput({
    item: {
      name: "Robot\u001b[31m\nNext",
      members: ["\u001b[2J", "\u009b31m"],
      "bad\u001b": "value",
    },
  });
  expect(output).not.toMatch(/[\u001b\u009b]/);
  expect(output).toContain("Robot\\u001b[31m\\nNext");
  expect(output).toContain("\\u001b[2J");
  expect(output).toContain("\\u009b31m");
});

it("keeps JSON success output byte-for-byte unchanged", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const data = {
    items: [{ id: "30", name: "Robot\n\u001b[31m", labels: [] }],
    paging: { items: { total: 1 } },
    truncated: false,
  };
  printResult(data, true);
  expect(log).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ ok: true, data }),
  );
});

it("keeps JSON errors on stderr with the same envelope", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  printError(new Error("Unexpected failure"), true);
  expect(log).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({
      ok: false,
      error: {
        code: "API",
        message:
          "Operation failed. Run plankton doctor for connection diagnostics.",
      },
    }),
  );
});

const card: CardSummary = {
  id: "30",
  name: "Intake",
  description: "Detailed notes",
  boardId: "10",
  boardName: "Robot",
  listName: "Todo",
  url: "https://planka.example/boards/10/cards/30",
  members: [],
  labels: [],
  memberIds: [],
  labelIds: [],
};
const options = { limit: 1, offset: 0 };

it("preserves search completeness and paging without applying another offset", () => {
  const data = {
    items: [card],
    truncated: true,
    complete: false,
    paging: { items: { total: 12, nextOffset: 11 } },
  };
  expect(compactResult("find_cards", data, { limit: 1, offset: 10 })).toEqual({
    ...data,
    items: [expect.not.objectContaining({ description: "Detailed notes" })],
  });
  expect(
    compactResult("find_cards", data, { limit: 1, offset: 10 }).items,
  ).toHaveLength(1);
});

it("pages each checklist collection independently and preserves links", () => {
  const rows = [{ id: "1" }, { id: "2" }];
  expect(
    compactResult(
      "read_card",
      { item: card, taskLists: rows, tasks: rows },
      options,
    ),
  ).toMatchObject({
    taskLists: [{ id: "1" }],
    tasks: [{ id: "1" }],
    truncated: true,
    paging: { taskLists: { nextOffset: 1 }, tasks: { nextOffset: 1 } },
  });
  expect(
    compactResult(
      "task_lists",
      { items: [], tasks: [], url: card.url },
      options,
    ),
  ).toMatchObject({
    url: card.url,
    paging: { items: { total: 0 }, tasks: { total: 0 } },
    truncated: false,
  });
});

it("uses the operation for description visibility even when writes gain checklist fields", () => {
  const data = { item: card, taskLists: [], tasks: [] };
  expect(compactResult("edit_card", data, options).item).not.toHaveProperty(
    "description",
  );
  expect(compactResult("read_card", data, options).item).toHaveProperty(
    "description",
    "Detailed notes",
  );
});

it("still pages browse results when they carry a URL", () => {
  const data = { items: [{ id: "1" }, { id: "2" }], url: card.url };
  expect(compactResult("boards", data, options)).toMatchObject({
    items: [{ id: "1" }],
    truncated: true,
    paging: { items: { nextOffset: 1 } },
  });
});

it.each([
  "assign_card",
  "unassign_card",
  "add_card_label",
  "remove_card_label",
] as const)(
  "keeps all %s results even when a tasks field is present",
  (operation) => {
    const data = {
      items: [{ id: "1" }, { id: "2" }],
      url: card.url,
      tasks: [],
    };
    expect(compactResult(operation, data, options)).toEqual({
      items: data.items,
      url: card.url,
    });
    expect(
      compactResult(operation, { item: { id: "1" }, url: card.url }, options),
    ).toEqual({ item: { id: "1" }, url: card.url });
  },
);
