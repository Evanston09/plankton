import { PlanktonError } from "./errors.js";
import type { Entity } from "./schemas.js";

export function referenceId(
  baseUrl: string,
  value: string,
  kind: string,
): string | undefined {
  if (/^\d+$/.test(value)) {
    return value;
  }
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const base = new URL(baseUrl);
    const prefix = `${base.pathname.replace(/\/$/, "")}/${kind}/`;
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(prefix) ||
      !/^\d+$/.test(url.pathname.slice(prefix.length))
    ) {
      throw new PlanktonError(
        "VALIDATION",
        `Use a ${kind} link from the active Planka instance.`,
      );
    }
    return url.pathname.slice(prefix.length);
  }
  return undefined;
}

export function resolveReference(
  baseUrl: string,
  value: string,
  items: Entity[],
  kind: string,
): Entity {
  const id = referenceId(baseUrl, value, kind);
  const matches = items.filter((i) =>
    id
      ? i.id === id
      : i.name?.toLocaleLowerCase() === value.toLocaleLowerCase(),
  );
  if (!matches.length) {
    throw new PlanktonError("NOT_FOUND", `No matching ${kind} in this scope.`);
  }
  if (matches.length > 1) {
    throw new PlanktonError(
      "AMBIGUOUS",
      `Multiple ${kind} match. Choose an ID.`,
      {
        choices: matches
          .slice(0, 25)
          .map((i) =>
            Object.fromEntries(
              [
                "id",
                "name",
                "projectId",
                "boardId",
                "boardName",
                "listId",
                "listName",
                "cardId",
                "taskListId",
                "url",
              ]
                .filter((key) => i[key] !== undefined)
                .map((key) => [key, i[key]]),
            ),
          ),
        ...(matches.length > 25
          ? { truncated: true, total: matches.length }
          : {}),
      },
    );
  }
  return matches[0]!;
}
