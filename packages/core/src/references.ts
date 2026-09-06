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
    if (kind === "cards" && url.origin === base.origin) {
      const root = base.pathname.replace(/\/$/, "");
      const path = url.pathname.slice(root.length);
      const match =
        url.pathname.startsWith(`${root}/`) &&
        /^\/boards\/\d+\/cards\/(\d+)$/.exec(path);
      if (match) return match[1];
    }
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

export function resolveReference<T extends Entity>(
  baseUrl: string,
  value: string,
  items: T[],
  kind: string,
  field: "name" | "username" = "name",
): T {
  const id = referenceId(baseUrl, value, kind);
  const matches = items.filter((i) =>
    id
      ? i.id === id
      : i[field]?.toLocaleLowerCase() === value.toLocaleLowerCase(),
  );
  const suggest = !matches.length && (kind === "labels" || kind === "users");
  if (!matches.length && !suggest) {
    throw new PlanktonError("NOT_FOUND", `No matching ${kind} in this scope.`);
  }
  if (matches.length > 1 || suggest) {
    const choices = suggest ? items : matches;
    throw new PlanktonError(
      suggest ? "NOT_FOUND" : "AMBIGUOUS",
      suggest
        ? `No matching ${kind} in this scope. Choose an available name or ID.`
        : `Multiple ${kind} match. Choose an ID.`,
      {
        choices: choices
          .slice(0, 25)
          .map((i) =>
            Object.fromEntries(
              [
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
                "taskListId",
                "url",
              ]
                .filter((key) => i[key] !== undefined)
                .map((key) => [key, i[key]]),
            ),
          ),
        ...(choices.length > 25
          ? { truncated: true, total: choices.length }
          : {}),
      },
    );
  }
  return matches[0]!;
}
