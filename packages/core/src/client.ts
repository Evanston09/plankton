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
    const id =
      referenceId(this.url, value, "boards") ??
      resolveReference(
        this.url,
        value,
        (await this.transport.request("projects", projectsResponseSchema))
          .included.boards,
        "boards",
      ).id;
    return this.transport.request(`boards/${id}`, boardResponseSchema);
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
    return this.transport.request(`cards/${id}`, cardResponseSchema);
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
    return { ...item, url: `${this.url}/${kind}/${item.id}` };
  }

  async account() {
    const { item } = await this.transport.request(
      "users/me",
      itemResponseSchema,
    );
    return { id: item.id, name: item.name, username: item.username };
  }

  private async collectCards(board: string) {
    const data = await this.board(board);
    const lists = data.included.lists;
    const cards = new Map(data.included.cards.map((c) => [c.id, c]));
    let complete = true;
    // Endless lists have separate pages; cap work and disclose incomplete results.
    for (const list of lists.filter(
      (l) => l.type === "archive" || l.type === "trash",
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
      items: [...cards.values()].map((c) =>
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

  private async search(board: string, query: string, limit: number) {
    const found = await this.collectCards(board);
    const needle = query.toLocaleLowerCase();
    const matches = found.items.filter((card) =>
      card.name?.toLocaleLowerCase().includes(needle),
    );
    return {
      items: matches.slice(0, limit),
      truncated: !found.complete || matches.length > limit,
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
            .map((b) => this.link(b, "boards")),
        };
      }
      case "lists":
        return { items: (await this.board(args.board)).included.lists };
      case "find_cards":
        return this.search(args.board, args.query, args.limit);
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
    method: "POST" | "PATCH",
    body: unknown,
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
      case "read_card":
        return {
          item: this.link(card),
          taskLists: data.included.taskLists,
          tasks: data.included.tasks,
        };
      case "edit_card": {
        const item = await this.writeItem(`cards/${card.id}`, "PATCH", {
          name: args.name,
          description: args.description,
        });
        return { item: this.link(item) };
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
      case "edit_task_list":
        return this.writeItem(`task-lists/${taskList.id}`, "PATCH", {
          name: args.name,
        });
      case "add_task":
        return this.writeItem(`task-lists/${taskList.id}/tasks`, "POST", {
          name: args.name,
          position: args.position,
        });
      case "complete_task": {
        const task = resolveReference(
          this.url,
          args.task,
          data.included.tasks.filter((task) => task.taskListId === taskList.id),
          "tasks",
        );
        return this.writeItem(`tasks/${task.id}`, "PATCH", {
          isCompleted: args.isCompleted,
        });
      }
    }
  }
}
