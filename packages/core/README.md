# @evanston/plankton-core

Provider-independent TypeScript client for Planka 2.0.0-rc.4. Requires Node.js 22+. Original code is MIT licensed. Version 0.2.1 accompanies the CLI release. Validation covers source contracts and fixtures against rc.4, not live production testing.

```sh
npm install @evanston/plankton-core@latest
```

For the command-line application, install [`@evanston/plankton`](https://www.npmjs.com/package/@evanston/plankton) globally instead.

```ts
import { PlankaClient, errorResult } from "@evanston/plankton-core";
const client = new PlankaClient({
  url: "https://planka.example",
  session: await yourVault.read(),
});
try {
  const result = await client.execute("create_card", {
    board: "Product",
    list: "Todo",
    name: "Review onboarding",
  });
  console.log(result.item);
} catch (error) {
  console.error(errorResult(error));
}
```

Session input is `{ accessToken, httpOnlyToken? }`; keep it in a credential vault. Core uses native fetch and Zod. It has no browser, MCP, keyring or AI-provider dependency.

`account()` verifies the current user. `execute(operation, input)` exposes projects, boards, lists, find_cards, read_card, create_card, edit_card, move_card, task_lists, create_task_list, edit_task_list, add_task and complete_task. Exported `operationSchemas` define each input. Board/card IDs and same-instance links work directly; names are scoped and ambiguous matches return choices. Card search is bounded and returns `truncated` when incomplete. Error results are safe to share; write uncertainty is never retried automatically. Moving/creating cards in trash is excluded.

`OperationResults` maps each operation to its typed result; `OperationResult` is their union. Responses validate the resource and collections consumed by each request. Malformed reads fail rather than appearing as empty results; malformed write responses remain `UNCERTAIN_WRITE`. Exact card-name resolution uses the full collected set independently of display limits, while refusing resolution if the underlying scan is incomplete.
