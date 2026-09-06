import { expect, it, vi } from "vitest";
import { PlankaClient } from "../packages/core/src/index.js";

const card = { id: "30", name: "Intake", boardId: "10", listId: "20" };
const board = {
  item: { id: "10", name: "Robot" },
  included: {
    lists: [{ id: "20", name: "Todo", type: "active" }],
    cards: [card],
    users: [{ id: "70", name: "Alex", username: "alex" }],
    boardMemberships: [{ id: "80", userId: "70" }],
    cardMemberships: [{ id: "90", cardId: "30", userId: "70" }],
    labels: [{ id: "60", name: "Urgent", color: "red" }],
    cardLabels: [{ id: "91", cardId: "30", labelId: "60" }],
  },
};
const details = {
  item: card,
  included: { ...board.included, taskLists: [], tasks: [] },
};
function client(responses: unknown[]) {
  const fetcher = vi.fn(async () => Response.json(responses.shift()));
  return {
    fetcher,
    client: new PlankaClient({
      url: "https://planka.example",
      session: { accessToken: "fixture" },
      fetch: fetcher,
    }),
  };
}

it("reuses named-board context and returns the same enriched read and search model", async () => {
  const { client: api, fetcher } = client([
    {
      items: [{ id: "1", name: "Project" }],
      included: { boards: [board.item] },
    },
    board,
    details,
    board,
  ]);
  const read = await api.execute("read_card", {
    card: "Intake",
    board: "Robot",
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  const search = await api.execute("find_cards", { board: "10" });
  expect(search.items[0]).toEqual(read.item);
  expect(read.item.members[0]?.username).toBe("alex");
  expect(search.items[0]?.memberIds).toEqual(["70"]);
});

it("uses the actual board when a card moved after name resolution", async () => {
  const { client: api, fetcher } = client([
    board,
    { ...details, item: { ...card, boardId: "11", listId: "21" } },
    {
      ...board,
      item: { id: "11", name: "New board" },
      included: { ...board.included, lists: [{ id: "21", name: "New list" }] },
    },
  ]);
  expect(
    (await api.execute("read_card", { card: "Intake", board: "10" })).item,
  ).toMatchObject({
    boardId: "11",
    boardName: "New board",
    listName: "New list",
  });
  expect(fetcher).toHaveBeenLastCalledWith(
    "https://planka.example/api/boards/11",
    expect.anything(),
  );
});

it("reuses card-name discovery for assignment but does not cache across operations", async () => {
  const { client: api, fetcher } = client([
    board,
    details,
    { item: { id: "90" } },
    board,
    details,
    { item: { id: "90" } },
  ]);
  for (let i = 0; i < 2; i++)
    await api.execute("assign_card", {
      card: "Intake",
      board: "10",
      member: "@alex",
    });
  expect(fetcher).toHaveBeenCalledTimes(6);
});

it("keeps ID-only assignment independent of board discovery", async () => {
  const { client: api, fetcher } = client([details, { item: { id: "90" } }]);
  await api.execute("assign_card", { card: "30", member: "70" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("preserves contextual choices without enriching every card during name resolution", async () => {
  const { client: api, fetcher } = client([
    {
      ...board,
      included: { ...board.included, cards: [card, { ...card, id: "31" }] },
    },
  ]);
  await expect(
    api.execute("read_card", { card: "Intake", board: "10" }),
  ).rejects.toMatchObject({
    code: "AMBIGUOUS",
    details: {
      choices: [
        expect.objectContaining({
          id: "30",
          boardName: "Robot",
          listName: "Todo",
        }),
        expect.objectContaining({
          id: "31",
          boardName: "Robot",
          listName: "Todo",
        }),
      ],
    },
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
