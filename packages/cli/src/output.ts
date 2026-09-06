import {
  errorResult,
  type Entity,
  type OperationResult,
  type Operation,
  type OperationResults,
} from "@evanston/plankton-core";

const fields = [
  "id",
  "name",
  "username",
  "color",
  "role",
  "projectId",
  "projectName",
  "boardId",
  "boardName",
  "listId",
  "listName",
  "cardId",
  "labelId",
  "labelIds",
  "memberIds",
  "labels",
  "members",
  "userId",
  "dueDate",
  "taskListId",
  "type",
  "isCompleted",
  "position",
  "url",
];
function summary(row: Entity, details = false): Record<string, unknown> {
  return Object.fromEntries(
    [...fields, ...(details ? ["description"] : [])]
      .filter((key) => row[key] !== undefined)
      .map((key) => [key, row[key]]),
  );
}

/** Search is already bounded; browse collections are paged independently. */
export function compactResult<K extends Operation>(
  operation: K,
  data: OperationResults[K],
  options: { limit: number; offset: number },
): Record<string, unknown>;
export function compactResult(
  operation: Operation,
  data: OperationResult,
  options: { limit: number; offset: number },
) {
  if (operation === "find_cards" && "truncated" in data) {
    return {
      items: data.items.map((row) => summary(row)),
      truncated: data.truncated,
      complete: data.complete,
      paging: data.paging,
    };
  }
  const association =
    operation === "assign_card" ||
    operation === "unassign_card" ||
    operation === "add_card_label" ||
    operation === "remove_card_label";
  if (association && "items" in data && "url" in data) {
    return { items: data.items.map((row) => summary(row)), url: data.url };
  }
  const result: Record<string, unknown> = {};
  const paging: Record<string, { total: number; nextOffset?: number }> = {};
  const page = (key: "items" | "taskLists" | "tasks", rows: Entity[]) => {
    const end = options.offset + options.limit;
    result[key] = rows.slice(options.offset, end).map((row) => summary(row));
    paging[key] = {
      total: rows.length,
      ...(rows.length > end ? { nextOffset: end } : {}),
    };
  };
  if ("item" in data)
    result.item = summary(data.item, operation === "read_card");
  if ("url" in data) result.url = data.url;
  switch (operation) {
    case "projects":
    case "boards":
    case "lists":
    case "board_labels":
    case "board_members":
      if ("items" in data) page("items", data.items);
      break;
    case "read_card":
      if ("taskLists" in data) page("taskLists", data.taskLists);
      if ("tasks" in data) page("tasks", data.tasks);
      break;
    case "task_lists":
      if ("items" in data) page("items", data.items);
      if ("tasks" in data) page("tasks", data.tasks);
      break;
  }
  if (Object.keys(paging).length) {
    result.paging = paging;
    result.truncated = Object.values(paging).some(
      (page) => page.nextOffset !== undefined,
    );
  }
  return result;
}

function readable(value: unknown, indent = ""): string {
  if (Array.isArray(value))
    return value.length
      ? value.map((row) => readable(row, indent)).join("\n")
      : `${indent}(none)`;
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        if (item && typeof item === "object")
          return `${indent}${key}:\n${readable(item, indent + "  ")}`;
        // Escape control characters so board data cannot inject terminal escape sequences.
        const text =
          typeof item === "string"
            ? JSON.stringify(item).slice(1, -1)
            : String(item);
        return `${indent}${key}: ${text}`;
      })
      .join("\n");
  }
  return `${indent}${String(value)}`;
}

export function printResult(data: Record<string, unknown>, json: boolean) {
  console.log(json ? JSON.stringify({ ok: true, data }) : readable(data));
}

export function printError(error: unknown, json: boolean) {
  const result = errorResult(error);
  console.error(json ? JSON.stringify(result) : readable(result.error));
}
