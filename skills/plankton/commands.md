# Plankton commands

Run commands with the installed `plankton` CLI and append `--json` for structured results. Help is available without credentials: `plankton <group> <command> --help`. Help and version output remain text.

## Find and read work

```sh
plankton projects list --json
plankton boards list --project "Engineering" --json
plankton boards labels --board "Robot" --json
plankton boards members --board "Robot" --json
plankton lists list --board "Robot" --json
plankton cards list --board "Robot" --list "Todo" --json
plankton cards find --board "Robot" --query "intake" --json
plankton cards get 123 --json
plankton checklists list --card 123 --json
```

Replace example names and IDs with resolved targets. Project and board references accept names, IDs, or same-instance links. Card references accept names, IDs, or same-instance links; card names require `--board`. Lists, checklists, and tasks accept names or IDs within their parent scope. Quote names with spaces and preserve IDs as strings.

Board discovery accepts a board name, ID or link and supports `--limit` and `--offset`. Labels include ID, name and color; members include user ID, display name, username and board role. Only current board members appear in member discovery.

`cards find` searches case-insensitive substrings in titles, descriptions, label names/IDs, and assignee display names, usernames (with or without `@`), or IDs; an omitted query lists all cards. `cards list` accepts the same filters. Direct name resolution uses exact case-insensitive matches. Resolve ambiguous names from returned choices and context, then use IDs for subsequent commands.

`cards list`, `cards find`, and `cards get` share card fields: `boardName`, `listName`, `memberIds`, `labelIds`, `members`, and `labels`. For list/find these live in each `data.items[]` entry; for get they live in `data.item`, alongside `description`. Assignment arrays are complete and are not paged. Names resolve through the current board; unavailable users or labels remain visible by ID. Get still pages the top-level `taskLists` and `tasks` collections independently. Scripts using the former `data.members` or `data.labels` fields must switch to `data.item.members` or `data.item.labels`.

`cards get` and `checklists list` include `taskLists` (`items` for `checklists list`) and `tasks`. Match a task's `taskListId` to a checklist's `id` to group tasks, and inspect `isCompleted` to find unfinished tasks.

## Create and update cards

```sh
plankton cards create --board "Robot" --list "Todo" --name "Test intake" --description-file notes.md --json
plankton cards edit 123 --name "Validate intake" --json
plankton cards edit 123 --description-file notes.md --json
plankton cards edit 123 --description-file - --json < notes.md
plankton cards edit 123 --clear-description --json
plankton cards move 123 --list "In Progress" --json
plankton cards move 123 --to-board "Release" --list "Todo" --json
```

`cards create` requires `--board`, `--list`, and `--name`. Repeat `--member` and `--label` to assign members and labels during creation, for example `--member @alex --member @sam --label Programming`. The returned item includes `memberIds` and `labelIds` when these options are supplied. Optional `--type` is `project` (default) or `story`. Creation and moves accept a nonnegative `--position` (default `65535`).

`cards edit` requires at least one change. Description input replaces the whole description: read it first when preserving or appending existing content. Use exactly one of `--description <text>`, `--description-file <path>`, or, for edits, `--clear-description`. Omitting description input preserves it on edit. Empty descriptions are rejected; clear explicitly. The maximum is 1,048,576 characters.

Moves require `--list` and default to the current board. `--to-board` selects the destination; `--board` scopes the source card when using its name. Creating or moving into trash is excluded.

## Due dates, labels, and members

```sh
plankton cards edit 123 --due-date '2026-09-10T17:00:00-04:00' --json
plankton cards edit 123 --clear-due-date --json
plankton cards add-label 123 --label "Urgent" --json
plankton cards remove-label 123 --label "Urgent" --json
plankton cards assign 123 --member '@alex' --json
plankton cards unassign 123 --member '@alex' --json
```

Due dates require an ISO 8601 timestamp with `Z` or an explicit timezone offset and are normalized to UTC. `--due-date` and `--clear-due-date` are mutually exclusive. Omitting both preserves the due date. Card output includes `dueDate` when returned by the server.

Labels accept an existing board label's name or ID. Members accept a display name, `@username`, or user ID. Names resolve within the card's current board; ambiguous names require an ID. Add `--board` when identifying the card by name.

Repeat `--label` or `--member` to change multiple associations in one command. Single-association results use `data.item`; multiple-association results use `data.items`, with every result included and a card link in `data.url`. Removing a label detaches it from the card without deleting the board label; unassigning removes card membership without removing the user from the board. Results include the affected `labelId` or `userId` and the card link.

## Checklists and tasks

```sh
plankton checklists create --card 123 --name "Release" --json
plankton checklists edit 789 --card 123 --name "Launch checks" --json
plankton tasks add --card 123 --checklist 789 --name "Run smoke test" --json
plankton tasks complete 456 --json
plankton tasks complete 456 --undo --json
plankton tasks complete "Run smoke test" --card 123 --checklist 789 --json
```

Checklist creation and renaming require `--card` and `--name`. Task creation requires `--card`, `--checklist`, and `--name`. Checklist and task creation accept `--position`. Add `--board` when identifying the parent card by name.

Task completion accepts a bare task ID without parent flags. Names require `--card`; add `--checklist` to distinguish matching task names. Supplying a scope validates membership before writing; `--checklist` requires `--card`. Use `--undo` to reopen a task.

## Archive, restore, and delete

```sh
plankton cards archive 123 --json
plankton cards move 123 --list "Todo" --json
plankton cards delete 123 --json
plankton checklists delete 789 --card 123 --json
plankton tasks delete 456 --card 123 --checklist 789 --json
```

Archive is reversible; restore with `cards move` to the desired list. Delete commands permanently remove their targets, and checklist deletion also removes its tasks. Checklist deletion requires `--card`; task deletion requires both `--card` and `--checklist`, even with IDs.

## Pagination and search scope

All browse commands, `cards get`, and `checklists list` accept `--limit 1..100` (default `25`) and `--offset` (default `0`). Read `data.paging.<collection>.nextOffset` and repeat the same command with that offset while more rows remain. Collections are paged independently; one response may finish checklists but still have more tasks.

```sh
plankton cards list --board "Robot" --limit 100 --json
plankton cards list --board "Robot" --limit 100 --offset 100 --json
plankton cards get 123 --limit 100 --offset 100 --json
```

The offsets above are examples; use the returned `nextOffset`. Card list/find uses `data.paging.items`; its total is exhaustive only if `data.complete` is true. `data.truncated` can mean more output remains or the underlying scan is incomplete. Offsets cannot recover cards beyond a scan cap: narrow to a list or use a known card ID/link.

Board-wide listing, search, and name resolution cover active/closed lists. Archive and trash require explicit `cards list/find --board <reference> --list <id>` selection; these scans are bounded to ten pages per selected endless list. Use card IDs or links to read archived/trashed cards directly. `complete` describes only the selected scope.

## Connection and errors

`plankton doctor --json` checks the saved connection and account. For missing or expired authentication, direct the user to run `plankton setup <URL>` or `plankton login` in their own terminal. `--manual` imports cookies through hidden terminal prompts. Never request credentials in chat or pass them as arguments. `plankton install-browser` installs Chromium for browser login; `plankton logout` removes local credentials without revoking the server session.

Success exits 0 with `{ "ok": true, "data": ... }` on stdout. Failure exits 1 with `{ "ok": false, "error": { "code": "...", "message": "...", "details": {} } }` on stderr (`details` is optional).

| Error                  | Next action                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `USAGE` / `VALIDATION` | Check command help and correct the inputs before retrying.                                  |
| `AMBIGUOUS`            | Resolve the returned choices using context or clarification, then use an ID.                |
| `NOT_FOUND`            | Check the reference and parent scope.                                                       |
| `AUTHENTICATION`       | Have the user sign in again in their terminal.                                              |
| `STORAGE` / `LOGIN`    | Resolve the credential vault or browser issue; manual login can avoid browser requirements. |
| `PERMISSION`           | Report that the signed-in account lacks access.                                             |
| `NETWORK` / `API`      | Inspect the error and check connectivity with `doctor`.                                     |
| `UNCERTAIN_WRITE`      | Read current state before retrying; the write may have succeeded.                           |

Unresolved label or member names return `NOT_FOUND` with available `details.choices`, capped at 25 with `truncated` and `total` when more exist. Username errors preserve both display names and usernames. Use discovery commands to page through all choices, then retry with the correct name or ID; commands never automatically substitute a suggested choice.

Create-with-associations and batch commands perform sequential API writes. All names resolve before writing, and duplicate resolved IDs are applied once. These writes are not transactional and are never retried automatically. If an association write fails, error details include `cardId`, `url`, `completed`, `failed`, and `pending` changes; `created: true` indicates that creation already succeeded. Inspect the failed association after `UNCERTAIN_WRITE` before retrying. Do not recreate an already-created card or repeat the entire batch. If a sequence fails, report the steps already completed. Writes return compact summaries and useful links; fetch details when needed. Use `--debug` only for diagnosis: it adds sanitized JSON records to stderr, so stderr may contain multiple JSON lines.
