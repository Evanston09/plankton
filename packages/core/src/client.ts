import { PlanktonError } from "./errors.js";
import { referenceId, resolveReference } from "./references.js";
import {
  operationSchemas,
  type Entity,
  boardResponseSchema,
  cardResponseSchema,
  itemResponseSchema,
  itemsResponseSchema,
  projectsResponseSchema,
  type CardResponse,
  type OperationResult,
  type OperationResults,
  type Operation,
  type OperationInput,
  type ParsedOperation,
} from "./schemas.js";
import { PlankaTransport, type ClientOptions } from "./transport.js";

export class PlankaClient {
  readonly url: string;
  private readonly transport: PlankaTransport;

  constructor(options: ClientOptions) {
    this.transport = new PlankaTransport(options);
    this.url = this.transport.url;
  }

  private async board(value: string) {
    let id = referenceId(this.url, value, "boards");
    if (!id) {
      const projects = await this.transport.request(
        "projects",
        projectsResponseSchema,
      );
      id = resolveReference(
        this.url,
        value,
        projects.included.boards.map((b) => ({
          ...b,
          projectName: projects.items.find((p) => p.id === b.projectId)?.name,
        })),
        "boards",
      ).id;
    }
    const data = await this.transport.request(
      `boards/${id}`,
      boardResponseSchema,
    );
    data.included.lists = data.included.lists.map((list) => ({
      ...list,
      boardId: data.item.id,
      boardName: data.item.name,
    }));
    return data;
  }

  private boardMembers(included: {
    users?: Entity[];
    boardMemberships?: Entity[];
  }) {
    const { users, boardMemberships } = included;
    if (!users || !boardMemberships)
      throw new PlanktonError(
        "API",
        "Board response is missing users or board memberships.",
      );
    return users
      .filter((user) =>
        boardMemberships.some((member) => member.userId === user.id),
      )
      .map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        role: boardMemberships.find((member) => member.userId === user.id)
          ?.role,
      }));
  }

  private boardLabels(included: { labels?: Entity[] }) {
    if (!included.labels)
      throw new PlanktonError("API", "Board response is missing labels.");
    return included.labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
    }));
  }

  private async card(value: string, board?: string) {
    let id = referenceId(this.url, value, "cards");
    if (!id) {
      if (!board) {
        throw new PlanktonError(
          "VALIDATION",
          "Supply a board to resolve a card name, or use a card ID/link.",
        );
      }
      const found = await this.collectCards(board);
      if (!found.complete) {
        throw new PlanktonError(
          "VALIDATION",
          "Card search is incomplete. Use a card ID/link to avoid resolving the wrong card.",
        );
      }
      id = resolveReference(this.url, value, found.items, "cards").id;
    }
    try {
      return await this.transport.request(`cards/${id}`, cardResponseSchema);
    } catch (error) {
      if (error instanceof PlanktonError && error.code === "NOT_FOUND") {
        const projects = await this.transport
          .request("projects", projectsResponseSchema)
          .catch(() => undefined);
        if (projects?.included.boards.some((b) => b.id === id)) {
          throw new PlanktonError(
            "NOT_FOUND",
            "That ID identifies a board; pass it with --board.",
            { ...error.details, boardId: id },
          );
        }
      }
      throw error;
    }
  }

  private writableList(list: Entity) {
    if (list.type === "trash") {
      throw new PlanktonError(
        "VALIDATION",
        "Moving or creating cards in trash is outside the initial scope.",
      );
    }
  }

  private link(item: Entity, kind = "cards") {
    return {
      ...item,
      url:
        kind === "cards" && item.boardId
          ? `${this.url}/boards/${item.boardId}/cards/${item.id}`
          : `${this.url}/${kind}/${item.id}`,
    };
  }

  async account() {
    const { item } = await this.transport.request(
      "users/me",
      itemResponseSchema,
    );
    return { id: item.id, name: item.name, username: item.username };
  }

  private async collectCards(board: string, listReference?: string) {
    const data = await this.board(board);
    const lists = data.included.lists;
    const listId = listReference
      ? resolveReference(this.url, listReference, lists, "lists").id
      : undefined;
    const cards = new Map(data.included.cards.map((c) => [c.id, c]));
    let complete = true;
    // Board-wide discovery uses finite lists from the board response.
    // Fetch an endless list only when explicitly selected.
    for (const list of lists.filter(
      (l) => listId === l.id && (l.type === "archive" || l.type === "trash"),
    )) {
      let before: { id: string; listChangedAt: string } | undefined;
      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams();
        if (before) {
          params.set("before", JSON.stringify(before));
        }
        const rows = (
          await this.transport.request(
            `lists/${list.id}/cards${params.size ? `?${params}` : ""}`,
            itemsResponseSchema,
          )
        ).items;
        if (!rows.length) {
          break;
        }
        for (const row of rows) {
          cards.set(row.id, row);
        }
        const last = rows.at(-1)!;
        if (!last.listChangedAt || page === 9) {
          complete = false;
          break;
        }
        const next = { id: last.id, listChangedAt: last.listChangedAt };
        if (
          next.id === before?.id &&
          next.listChangedAt === before.listChangedAt
        ) {
          complete = false;
          break;
        }
        before = next;
      }
    }
    return {
      items: [...cards.values()]
        .filter((c) => !listId || c.listId === listId)
        .map((c) =>
          this.link({
            ...c,
            boardId: c.boardId ?? data.item.id,
            boardName: data.item.name,
            listName: lists.find((l) => l.id === c.listId)?.name,
          }),
        ),
      complete,
    };
  }

  private async search(
    board: string,
    query: string,
    limit: number,
    offset: number,
    list?: string,
  ) {
    const found = await this.collectCards(board, list);
    const needle = query.toLocaleLowerCase();
    const matches = found.items.filter((card) =>
      card.name?.toLocaleLowerCase().includes(needle),
    );
    return {
      items: matches.slice(offset, offset + limit),
      truncated: !found.complete || matches.length > offset + limit,
      complete: found.complete,
      paging: {
        items: {
          total: matches.length,
          ...(matches.length > offset + limit
            ? { nextOffset: offset + limit }
            : {}),
        },
      },
    };
  }

  async execute<K extends Operation>(
    operation: K,
    input: OperationInput<K>,
  ): Promise<OperationResults[K]>;
  async execute(
    operation: Operation,
    input: OperationInput<Operation>,
  ): Promise<OperationResult> {
    // The public method validates for all callers.
    const args = {
      ...operationSchemas[operation].parse(input),
      operation,
    } as ParsedOperation;
    if (args.operation === "complete_task") {
      const id = referenceId(this.url, args.task, "tasks");
      if (!args.card && !args.taskList && !args.board && id) {
        return {
          item: await this.writeItem(`tasks/${id}`, "PATCH", {
            isCompleted: args.isCompleted,
          }),
        };
      }
      if (!args.card)
        throw new PlanktonError(
          "VALIDATION",
          "Supply --card to resolve or check task scope, or use a bare task ID without scope.",
        );
      const data = await this.card(args.card, args.board);
      const taskList = args.taskList
        ? resolveReference(
            this.url,
            args.taskList,
            data.included.taskLists,
            "task-lists",
          )
        : undefined;
      const task = resolveReference(
        this.url,
        args.task,
        data.included.tasks.filter(
          (t) => !taskList || t.taskListId === taskList.id,
        ),
        "tasks",
      );
      return {
        item: await this.writeItem(`tasks/${task.id}`, "PATCH", {
          isCompleted: args.isCompleted,
        }),
        url: this.link(data.item).url,
      };
    }
    switch (args.operation) {
      case "projects":
        return {
          items: (
            await this.transport.request("projects", itemsResponseSchema)
          ).items.map((i) => this.link(i, "projects")),
        };
      case "boards": {
        const data = await this.transport.request(
          "projects",
          projectsResponseSchema,
        );
        const projectId = args.project
          ? resolveReference(this.url, args.project, data.items, "projects").id
          : undefined;
        return {
          items: data.included.boards
            .filter((b) => !projectId || b.projectId === projectId)
            .map((b) =>
              this.link(
                {
                  ...b,
                  projectName: data.items.find((p) => p.id === b.projectId)
                    ?.name,
                },
                "boards",
              ),
            ),
        };
      }
      case "board_labels":
        return {
          items: this.boardLabels((await this.board(args.board)).included),
        };
      case "board_members":
        return {
          items: this.boardMembers((await this.board(args.board)).included),
        };
      case "lists":
        return { items: (await this.board(args.board)).included.lists };
      case "find_cards":
        return this.search(
          args.board,
          args.query,
          args.limit,
          args.offset,
          args.list,
        );
      case "create_card": {
        const board = await this.board(args.board);
        const list = resolveReference(
          this.url,
          args.list,
          board.included.lists,
          "lists",
        );
        this.writableList(list);
        const item = await this.writeItem(`lists/${list.id}/cards`, "POST", {
          name: args.name,
          description: args.description,
          type: args.type,
          position: args.position,
        });
        return { item: this.link(item) };
      }
      default:
        return this.executeCard(args);
    }
  }

  private async writeItem(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
  ) {
    return (
      await this.transport.request(path, itemResponseSchema, method, body)
    ).item;
  }

  private async executeCard(args: Extract<ParsedOperation, { card: string }>) {
    const data = await this.card(args.card, args.board);
    const card = data.item;
    const url = this.link(card).url;

    switch (args.operation) {
      case "delete_card":
        return { item: await this.writeItem(`cards/${card.id}`, "DELETE") };
      case "archive_card": {
        const board = await this.board(card.boardId ?? args.board ?? "");
        const archives = board.included.lists.filter(
          (l) => l.type === "archive",
        );
        if (archives.length !== 1)
          throw new PlanktonError(
            "VALIDATION",
            "Cannot determine the board archive list.",
          );
        return {
          item: this.link(
            await this.writeItem(`cards/${card.id}`, "PATCH", {
              listId: archives[0]!.id,
            }),
          ),
        };
      }
      case "read_card": {
        const memberships = data.included.cardMemberships.filter(
          (row) => row.cardId === card.id,
        );
        const cardLabels = data.included.cardLabels.filter(
          (row) => row.cardId === card.id,
        );
        let members: Entity[] = [];
        let labels: Entity[] = [];
        if (memberships.length || cardLabels.length) {
          const boardRef = card.boardId ?? args.board;
          if (!boardRef)
            throw new PlanktonError(
              "API",
              "Card response is missing its board ID.",
            );
          const board = await this.board(boardRef);
          members = memberships.map((row) => {
            const user = board.included.users?.find(
              (user) => user.id === row.userId,
            );
            return {
              id: row.userId,
              name: user?.name,
              username: user?.username,
            };
          });
          labels = cardLabels.map((row) => {
            const label = board.included.labels?.find(
              (label) => label.id === row.labelId,
            );
            return { id: row.labelId, name: label?.name, color: label?.color };
          });
        }
        return {
          members,
          labels,
          item: this.link(card),
          taskLists: data.included.taskLists,
          tasks: data.included.tasks,
        };
      }
      case "edit_card": {
        const item = await this.writeItem(`cards/${card.id}`, "PATCH", {
          name: args.name,
          description: args.description,
          dueDate: args.dueDate,
        });
        return { item: this.link(item) };
      }
      case "add_card_label":
      case "remove_card_label":
      case "assign_card":
      case "unassign_card": {
        const isLabel =
          args.operation === "add_card_label" ||
          args.operation === "remove_card_label";
        const value = "label" in args ? args.label : args.member;
        let id = referenceId(this.url, value, isLabel ? "labels" : "users");
        if (!id) {
          const boardRef = card.boardId ?? args.board;
          if (!boardRef)
            throw new PlanktonError(
              "VALIDATION",
              "Supply --board to resolve a label or member name.",
            );
          const board = await this.board(boardRef);
          const items = isLabel
            ? this.boardLabels(board.included)
            : this.boardMembers(board.included);
          id = resolveReference(
            this.url,
            !isLabel && value.startsWith("@") ? value.slice(1) : value,
            items,
            isLabel ? "labels" : "users",
            !isLabel && value.startsWith("@") ? "username" : "name",
          ).id;
        }
        const remove =
          args.operation === "remove_card_label" ||
          args.operation === "unassign_card";
        const collection = isLabel ? "card-labels" : "card-memberships";
        const key = isLabel ? "labelId" : "userId";
        return {
          item: await this.writeItem(
            `cards/${card.id}/${collection}${remove ? `/${key}:${id}` : ""}`,
            remove ? "DELETE" : "POST",
            remove ? undefined : { [key]: id },
          ),
          url,
        };
      }
      case "move_card": {
        const destination = args.destinationBoard ?? card.boardId ?? args.board;
        if (!destination)
          throw new PlanktonError(
            "VALIDATION",
            "Cannot determine the current board. Supply --to-board.",
          );
        const board = await this.board(destination);
        const list = resolveReference(
          this.url,
          args.list,
          board.included.lists,
          "lists",
        );
        this.writableList(list);
        const item = await this.writeItem(`cards/${card.id}`, "PATCH", {
          boardId: board.item.id,
          listId: list.id,
          position: args.position,
        });
        return { item: this.link(item) };
      }
      case "task_lists":
        return {
          items: data.included.taskLists,
          tasks: data.included.tasks,
          url,
        };
      case "create_task_list": {
        const item = await this.writeItem(
          `cards/${card.id}/task-lists`,
          "POST",
          {
            name: args.name,
            position: args.position,
          },
        );
        return { item, url };
      }
      default:
        return { item: await this.executeTask(args, data), url };
    }
  }

  private async executeTask(
    args: Extract<ParsedOperation, { taskList: string }>,
    data: CardResponse,
  ) {
    const taskList = resolveReference(
      this.url,
      args.taskList,
      data.included.taskLists,
      "task-lists",
    );

    switch (args.operation) {
      case "delete_task_list":
        return this.writeItem(`task-lists/${taskList.id}`, "DELETE");
      case "edit_task_list":
        return this.writeItem(`task-lists/${taskList.id}`, "PATCH", {
          name: args.name,
        });
      case "add_task":
        return this.writeItem(`task-lists/${taskList.id}/tasks`, "POST", {
          name: args.name,
          position: args.position,
        });
      case "delete_task": {
        const task = resolveReference(
          this.url,
          args.task,
          data.included.tasks.filter((task) => task.taskListId === taskList.id),
          "tasks",
        );
        return this.writeItem(`tasks/${task.id}`, "DELETE");
      }
    }
  }
}
