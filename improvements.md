# Plankton CLI stress test findings (v0.2.1, 2026-09-05)

Tested against https://planka.ncssm.edu with a fresh login, exercising every command group,
reference formats (names, IDs, links), validation edge cases, JSON/stream/exit-code contract,
and paging. Findings are ordered by impact.

## Critical bug: all board-content operations fail with `NETWORK`

Everything that needs board content fails, consistently, with:

```
{"ok":false,"error":{"code":"NETWORK","message":"Could not read Planka. Check the URL, network and server response."}}
```

Affected commands (tested on all 6 boards, by ID, by link, retried over several minutes):

- `lists list --board <id|link>`
- `cards find --board <id> --query <text>`
- `cards edit <card-name> --board <id>` (fails while resolving the name)
- `cards create --board <id> --list <name>` (fails while resolving the list name)

The session itself is fine: `doctor` passes, `projects list` and `boards list` return fresh
data, and `cards get <bogus-id>` reaches the server and returns a proper `NOT_FOUND`. Only the
board-content fetch path fails. Net effect: the CLI cannot discover any card or list ID, so the
majority of its surface (find, get by name, create, edit, move, checklists, tasks) is unusable.

Suggestion: include the HTTP status (and maybe response body) in the `details` of `NETWORK`
errors. Right now an expired session, a server-side API change, and a CLI bug in URL/response
handling all look identical, and the "Check the URL" hint is misleading when the URL is fine.

## Bug: `cards get` rejects real Planka card links

- `plankton cards get https://planka.ncssm.edu/boards/<boardId>/cards/<cardId>` →
  `VALIDATION: "Use a cards link from the active Planka instance."` — even though this is the
  active instance and the `/boards/{b}/cards/{c}` shape is what the Planka web UI produces.
- Meanwhile `https://planka.ncssm.edu/cards/<cardId>` (a shape the web UI doesn't emit) parses
  fine and reaches the server (returned `NOT_FOUND` for a bogus ID).

So the accepted "cards link" format doesn't match the UI's card URL format, and the error
message tells the user to do exactly what they already did. The skill instruction "same-instance
links are accepted" does not hold for card links as copied from Planka.

## Gap: no way to list all cards in a board or list

`cards find` requires a non-empty `--query` substring (empty string → `VALIDATION`). There is no
browse/list-cards mode, no `--list` filter, and no filters by label/member/due date. For agents
this means the only way to discover a card is to guess substrings of its title — and when that
fails there is no fallback. Suggested: allow an empty/omitted query to enumerate cards, and add
a `--list` filter (and ideally label/assignee/due filters).

## Friction: task completion requires the full reference chain

`tasks complete <taskId>` refuses to run unless `--card` and `--checklist` are also supplied
(`VALIDATION: required option '--checklist <reference>' not specified`). Given a task ID, the
CLI could resolve the parent checklist itself (other commands, e.g. `checklists list --card
<id>`, accept bare IDs). Requiring card + checklist makes the task ID pointless.

## Unintuitive: ambiguous-name choices lack context

This instance has three boards all named "2025-2026" (one per project), so board-name
references almost always hit `AMBIGUOUS`. The error helpfully lists choices, but only as
`{id, name, projectId}` — the human/agent then has to run `projects list` and manually join on
`projectId` to decide. Include the project name (for boards) and board name (for lists/cards)
in the choices. Same applies to duplicate list names across the boards of one project.

## Gap: no delete/archive commands

There is no way to delete or archive a card, checklist, or task (the skill even documents
"Deletion has no command"). Anything created via automation is permanent until someone opens
the web UI. At minimum an `archive` (soft-delete) for cards would make automation safe.

## Minor

- `cards get <board-id>` returns bare `NOT_FOUND` with no hint that the ID resolved to a board,
  not a card. A targeted hint ("that ID is a board; pass it with --board") would save a
  round trip.
- No verbose/debug mode exists for diagnosing failures (tried `DEBUG=*` and a hypothetical
  `PLANKTON_DEBUG`; no effect). Combined with the opaque `NETWORK` code above, failures are
  undebuggable in the field.
- CLI-usage errors (unknown subcommand, too many args, missing options) are reported with code
  `VALIDATION` and raw commander.js text ("error: too many arguments for 'cards'..."). A
  distinct `USAGE` code with cleaner messages would let agents distinguish "bad invocation"
  from "bad input to a valid invocation".
- `--type` only allows `project|story`; if the server supports more card types they're
  unreachable (unverified — blocked by the NETWORK bug).
- `cards find` results were unverifiable end-to-end (blocked by the NETWORK bug), so paging
  behavior (`paging.<collection>.nextOffset`) could not be exercised.

## Re-verification against local build (2026-09-05)

Ran `pnpm check` (112 tests pass, typecheck clean) plus a live battery against
`packages/cli/dist/cli.js`. Fixed and verified working:

- `NETWORK` bug on board-content fetch — gone; `lists list`, `cards find`, name resolution,
  and the full create/edit/move lifecycle all reach the server.
- `cards list` added (optional `--query`, empty = all; `--list` filter; limit/offset).
- Real card links (`/boards/{b}/cards/{c}`) accepted by `cards get`.
- `tasks complete <taskId>` works without `--card`/`--checklist` (and `--undo` verified).
- `AMBIGUOUS` choices now include `projectName`.
- `cards get <board-id>` returns a targeted hint ("That ID identifies a board").
- CLI-usage errors use a distinct `USAGE` code.
- Error details now include HTTP `status`, `endpoint`, `method`.
- `cards archive` / `cards delete` added; verified via a scratch card (create → checklist →
  task → complete → undo → archive → delete), leaving no residue.

### Remaining bug: board-wide card scans 400 on the archive pseudo-list — FIXED

Originally any code path that scanned a board's cards list-by-list walked the board's
`archive`/`trash` pseudo-lists; Planka returned 400 on `lists/<archiveId>/cards`, aborting the
scan. Re-verified as fixed: `cards list --board` (no `--list`), `cards find --board --query`,
and card name resolution all work; archive/trash are excluded from results; confirmed on all
three projects' boards (e.g. Leviathan board-wide: 52 cards, `truncated:true` disclosure intact).

### Local fix for remaining scan bug

Board-wide listing, search, and exact card-name resolution now use the board response
without fetching archive/trash pseudo-lists. Archived/trashed cards remain accessible by
ID/link; explicit `--list <archive-or-trash-id>` browsing retains pagination and reports
server errors. Regression tests cover both pseudo-list types and the explicit-list error
path. Live re-verification of this follow-up is still pending.

## What worked well

- JSON contract is consistent: `{ok:true,data}` on stdout, `{ok:false,error}` on stderr, exit 1
  on failure — verified across success and every error path.
- Input validation is tight: `--limit` bounds (1–100), nonnegative `--offset`/`--position`,
  `--type` choices, empty `--name` rejected with a field-level detail.
- `--description-file -` (stdin) is accepted; `--project`/`--board` accept names, IDs, and
  same-instance links for projects and boards.
- `AMBIGUOUS` and `NOT_FOUND` codes with structured `details.choices` are the right idea.
