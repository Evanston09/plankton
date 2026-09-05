# CLI reference

Install with `npm install --global @evanston/plankton@latest` (Node.js 22+). Version 0.2.1 provides the CLI; `plankton --version` confirms the installed version. See [authentication](authentication.md) for first-time setup.

Run `plankton --help`, `plankton <group> --help`, or `plankton <group> <command> --help` for focused help. Discovery requires no credentials and does not load a browser. `--json` is a global option accepted before or after the command. Help and version output remain text.

## Commands

| Command                                        | Required inputs                         | Optional inputs                                               |
| ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `projects list`                                | —                                       | `--limit`, `--offset`                                         |
| `boards list`                                  | —                                       | `--project`, `--limit`, `--offset`                            |
| `boards labels`                                | `--board`                               | `--limit`, `--offset`                                         |
| `boards members`                               | `--board`                               | `--limit`, `--offset`                                         |
| `lists list`                                   | `--board`                               | `--limit`, `--offset`                                         |
| `cards list` / `cards find`                    | `--board`                               | `--query`, `--list`, `--limit`, `--offset`                    |
| `cards archive <card>` / `cards delete <card>` | card reference                          | `--board`                                                     |
| `cards get <card>`                             | card reference                          | `--board`, `--limit`, `--offset`                              |
| `cards create`                                 | `--board`, `--list`, `--name`           | description input, `--type`, `--position`                     |
| `cards edit <card>`                            | card reference and at least one change  | `--board`, `--name`, description input, `--clear-description` |
| `cards move <card>`                            | card reference, `--list`                | `--board`, `--to-board`, `--position`                         |
| `checklists list`                              | `--card`                                | `--board`, `--limit`, `--offset`                              |
| `checklists create`                            | `--card`, `--name`                      | `--board`, `--position`                                       |
| `checklists edit <checklist>`                  | checklist reference, `--card`, `--name` | `--board`                                                     |
| `tasks add`                                    | `--card`, `--checklist`, `--name`       | `--board`, `--position`                                       |
| `tasks complete <task>`                        | task ID, or name with `--card`          | `--card`, `--checklist`, `--board`, `--undo`                  |
| `checklists delete <checklist>`                | checklist reference, `--card`           | `--board`                                                     |
| `tasks delete <task>`                          | task reference, `--card`, `--checklist` | `--board`                                                     |

`--board` scopes a card name; card IDs and same-instance card links do not require it. Project and board references accept names, IDs or same-instance links. List, checklist and task references accept names or IDs within their parent scope. Use quotes around names with spaces. IDs are strings.

`cards list` and `cards find` match title substrings case-insensitively; an omitted or empty query enumerates cards. `--list` restricts results to one list. Direct name resolution requires an exact case-insensitive match. Duplicate names return `AMBIGUOUS` with compact choices, capped at 25 with truncation disclosed. The agent can select an ID from context or obtain more detail before deciding whether clarification is needed. Exact name resolution is independent of the display search limit: a unique exact match can resolve even when a substring search would exceed 100 matches. An incomplete underlying board scan cannot safely establish a unique name match.

Moves default to the card's current board. `--to-board` changes the destination board; `--board` identifies the source when using a card name. Positions default to `65535`. Card type defaults to `project`; `story` is also supported. Creating/moving into trash is excluded.

Card links accept both `/cards/<id>` and the web UI’s `/boards/<boardId>/cards/<id>` under the active instance path. Archive moves a card to its board’s archive list; restore it with `cards move`. Delete commands permanently remove their targets; deleting a checklist also removes its tasks. Task completion by bare ID sends one update; supplying scope requires `--card` and validates membership before writing.

## Due dates, labels and members

Board discovery accepts a board name, ID or link and supports `--limit` and `--offset`. Labels include ID, name and color; members include user ID, display name, username and board role. Only current board members appear in member discovery.

```sh
plankton boards labels --board "Robot" --json
plankton boards members --board "Robot" --json
plankton cards edit 123 --due-date '2026-09-10T17:00:00-04:00'
plankton cards edit 123 --clear-due-date
plankton cards add-label 123 --label 'Urgent'
plankton cards remove-label 123 --label 'Urgent'
plankton cards assign 123 --member '@alex'
plankton cards unassign 123 --member '@alex'
```

Due dates require an ISO 8601 timestamp with `Z` or an explicit timezone offset and are normalized to UTC. Setting and clearing are mutually exclusive; omitting both leaves the due date unchanged. Card output includes `dueDate` when returned by the server.

Labels accept an existing board label's name or ID. Members accept a display name, `@username`, or user ID. Names resolve within the card's current board; duplicate names require an ID. Add `--board <reference>` when addressing a card by name. Removing a label detaches it from the card; unassigning removes card membership. These commands do not delete board labels or board members. Results include the affected `labelId` or `userId` and a card link. Each command changes one label or member and supports `--json`.

## Descriptions

Use one of `--description <text>` or `--description-file <path>`. With `--description-file -`, UTF-8 content is read from piped stdin. Edits also support `--clear-description`; these three options are mutually exclusive. Omitting a description leaves it unchanged on edit. Empty descriptions are rejected; clear explicitly instead. Maximum length is 1,048,576 characters.

```sh
plankton cards create --board Robot --list Todo --name "Test intake" --description-file notes.md --json
plankton cards edit 123 --description-file - --json < notes.md
plankton cards edit 123 --clear-description --json
plankton tasks complete 456 --card 123 --checklist 789 --undo --json
```

## Output and bounds

Success exits **0**, with one `{ "ok": true, "data": ... }` JSON object on stdout in JSON mode. Failure exits **1**, with one `{ "ok": false, "error": { "code", "message", "details"? } }` object on stderr. Ordinary operation commands never prompt. Setup progress and browser-install logs go to stderr; final setup success remains a single object on stdout.

Text mode shows labeled fields. Control characters and line breaks in field values are escaped so terminal output cannot execute escape sequences. JSON mode preserves the original field strings through JSON decoding.

Collections and write results contain selected summary fields: ID, name, parent IDs, type, position, completion state and links where available. Card searches also include board/list names when available. `checklists list` returns checklist and task collections plus the parent card link. Writes return the affected item and its card link where applicable.

`cards get` includes `members` and `labels` alongside the description and checklists, with independent paging for each collection. It resolves assignment names through the current board; an unavailable user or label remains visible by ID. Use it on sibling cards to inspect shared assignments. `cards list` and `cards find` continue to return compact card summaries.

Browse/checklist collections default to **25 rows**, with `--limit 1..100`. Each collection is paged independently using `--offset` (default 0). `data.paging.<collection>` reports the collection's `total` and, when more rows remain, `nextOffset`. `data.truncated` is true if any collection has further rows. An offset beyond the end returns an empty collection. Pagination is over the current response, not a persistent snapshot; concurrent board changes may shift rows.

Card list/find results include `paging.items.total`, optional `nextOffset`, and `complete`. The total counts discovered matches; it is exhaustive only when `complete` is true. Archive/trash scans are bounded to ten pages per selected endless list. `truncated` means more output remains or the scan is incomplete. Offsets cannot recover cards beyond the scan cap; use a known ID or narrow to a list.

## Setup and recovery

- `setup [URL]` / `login [URL]`: reuse the saved URL or accept it as an argument. Download missing Chromium and open sign-in. Browser sign-in times out after five minutes. Without a saved URL, interactive terminals ask for one; noninteractive calls return an actionable error.
- `setup [URL] --manual` / `login [URL] --manual`: hidden cookie prompts in the user's terminal; no browser download. Credentials never belong in chat or CLI arguments.
- `doctor`: verify credential-vault access and the active Planka account.
- `logout`: remove saved credentials without revoking the server session.
- `install-browser`: install Chromium explicitly.

| Error code        | Recovery                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `USAGE`           | Fix command syntax, missing options, or conflicting flags using help.                              |
| `VALIDATION`      | Correct inputs using command help. No retry with unchanged arguments.                              |
| `AUTHENTICATION`  | Direct the user to run setup/login in their own terminal; see [authentication](authentication.md). |
| `STORAGE`         | Make the OS credential vault available and unlock it.                                              |
| `LOGIN`           | Resolve browser/display prerequisites or use manual login in a terminal.                           |
| `AMBIGUOUS`       | Resolve intent using returned choices and context, then pass an ID.                                |
| `NOT_FOUND`       | Check the reference and parent scope.                                                              |
| `PERMISSION`      | The signed-in Planka account lacks permission.                                                     |
| `NETWORK` / `API` | Check connectivity and `doctor`; inspect the error message.                                        |
| `UNCERTAIN_WRITE` | Read current state before retrying; the write may already have succeeded.                          |

Unresolved label or member names return `NOT_FOUND` with available `details.choices`, capped at 25 with `truncated` and `total` when more exist. Username errors preserve both display names and usernames. Use discovery commands to page through all choices, then retry with the correct name or ID; commands never automatically substitute a suggested choice.

There is no multi-operation transaction or automatic write retry. If the agent executes several commands and one fails, earlier successful commands remain applied.

Use `--debug` for sanitized request method, endpoint, status, phase and duration records on stderr. With debug enabled, stderr may contain multiple JSON lines. Headers, credentials and response bodies are omitted. API response errors include failing schema field paths; `NETWORK` denotes transport failures.

Board-wide card listing, search, and name resolution cover active/closed lists from the board response. Archive and trash are excluded unless selected explicitly with `cards list/find --list <id>`. Explicit endless-list scans remain bounded and report errors rather than silently skipping failed pages. `complete` describes the selected scope. Use card IDs or links to access archived/trashed cards directly.
