import type {
  BoardResponse,
  CardAssociations,
  CardSummary,
  Entity,
} from "./schemas.js";

/** One board snapshot and its lookup tables, owned by the current operation. */
export class CardContext {
  private readonly lists;
  private readonly users;
  private readonly labels;

  constructor(
    private readonly url: string,
    readonly board: BoardResponse,
  ) {
    this.lists = new Map(board.included.lists.map((row) => [row.id, row]));
    this.users = new Map(board.included.users?.map((row) => [row.id, row]));
    this.labels = new Map(board.included.labels?.map((row) => [row.id, row]));
  }

  describe(card: Entity) {
    const boardId = card.boardId ?? this.board.item.id;
    return {
      ...card,
      boardId,
      boardName: this.board.item.name,
      listName: this.lists.get(card.listId ?? "")?.name,
      url: `${this.url}/boards/${boardId}/cards/${card.id}`,
    };
  }

  summarize(cards: Entity[], included: CardAssociations): CardSummary[] {
    const members = new Map<string, CardSummary["members"]>();
    const labels = new Map<string, CardSummary["labels"]>();
    for (const row of included.cardMemberships) {
      const user = this.users.get(row.userId);
      const rows = members.get(row.cardId) ?? [];
      rows.push({ id: row.userId, name: user?.name, username: user?.username });
      members.set(row.cardId, rows);
    }
    for (const row of included.cardLabels) {
      const label = this.labels.get(row.labelId);
      const rows = labels.get(row.cardId) ?? [];
      rows.push({ id: row.labelId, name: label?.name, color: label?.color });
      labels.set(row.cardId, rows);
    }
    return cards.map((card) => {
      const cardMembers = members.get(card.id) ?? [];
      const cardLabels = labels.get(card.id) ?? [];
      return {
        ...this.describe(card),
        members: cardMembers,
        labels: cardLabels,
        memberIds: cardMembers.map((row) => row.id),
        labelIds: cardLabels.map((row) => row.id),
      };
    });
  }
}
