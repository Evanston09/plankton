import { expect, it } from "vitest";
import type { CardSummary } from "../packages/core/src/index.js";
import { compactResult } from "../packages/cli/src/output.js";

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
