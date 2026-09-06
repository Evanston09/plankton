import {
  errorResult,
  type Entity,
  type OperationResult,
  type Operation,
  type OperationResults,
} from "@evanston/plankton-core";
import Table from "cli-table3";

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

function safeText(value: unknown): string {
  // Escape control characters so board data cannot inject terminal sequences.
  return typeof value === "string"
    ? JSON.stringify(value)
        .slice(1, -1)
        .replace(
          /[\u007f-\u009f]/g,
          (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
        )
    : String(value);
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
          return `${indent}${safeText(key)}:\n${readable(item, indent + "  ")}`;
        return `${indent}${safeText(key)}: ${safeText(item)}`;
      })
      .join("\n");
  }
  return `${indent}${safeText(value)}`;
}

function heading(key: string): string {
  return safeText(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bId\b/gi, "ID")
    .replace(/\bIds\b/gi, "IDs")
    .replace(/^url$/i, "URL")
    .replace(/^./, (char) => char.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function detailTable(row: Record<string, unknown>, width: number): string {
  const entries = Object.entries(row);
  if (!entries.length) return "(none)";
  const fieldWidth = Math.min(
    Math.max(...entries.map(([key]) => heading(key).length)) + 2,
    Math.floor((width - 3) / 2),
  );
  const table = new Table({
    colWidths: [fieldWidth, width - fieldWidth - 3],
    wordWrap: true,
    wrapOnWordBoundary: false,
    style: { head: [], border: [] },
  });
  for (const [key, value] of entries)
    table.push([heading(key), readable(value)]);
  return table.toString();
}

function collectionTable(
  rows: Record<string, unknown>[],
  width: number,
): string {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!keys.length) return "(none)";
  const table = new Table({
    head: keys.map(heading),
    style: { head: [], border: [] },
  });
  for (const row of rows)
    table.push(keys.map((key) => (key in row ? readable(row[key]) : "")));
  const rendered = table.toString();
  // Wide records stay complete and readable instead of losing fields to truncation.
  return table.width <= width
    ? rendered
    : rows.map((row) => detailTable(row, width)).join("\n\n");
}

function humanResult(data: Record<string, unknown>): string {
  const width = Math.max(12, process.stdout.columns || 100);
  return Object.entries(data)
    .map(([key, value]) => {
      if (Array.isArray(value) && value.length && value.every(isRecord))
        return `${heading(key)}\n${collectionTable(value, width)}`;
      if (isRecord(value) && key !== "paging")
        return `${heading(key)}\n${detailTable(value, width)}`;
      return readable({ [key]: value });
    })
    .join("\n\n");
}

export function printResult(data: Record<string, unknown>, json: boolean) {
  console.log(json ? JSON.stringify({ ok: true, data }) : humanResult(data));
}

export function printError(error: unknown, json: boolean) {
  const result = errorResult(error);
  console.error(json ? JSON.stringify(result) : readable(result.error));
}
