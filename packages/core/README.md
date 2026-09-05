# @evanston/plankton-core

Provider-independent TypeScript client for Planka 2.0.0-rc.4. Requires Node.js 22+. Original code is MIT licensed. This initial version has only source/fixture validation against rc.4, not live production testing.

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
