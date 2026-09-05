import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander";
import {
  normalizeUrl,
  operationSchemas,
  PlanktonError,
  sessionSchema,
  type Operation,
} from "@evanston/plankton-core";
import {
  KeyringStore,
  connectedClient,
  saveValidatedConnection,
} from "./storage.js";
import { compactResult, printResult } from "./output.js";

const cliPackage = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

function integer(min: number, max: number) {
  return (value: string) => {
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    ) {
      throw new InvalidArgumentError(
        `Expected an integer from ${min} to ${max}.`,
      );
    }
    return Number(value);
  };
}
function position(value: string) {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number < 0)
    throw new InvalidArgumentError("Expected a nonnegative number.");
  return number;
}
function page(command: Command) {
  return command
    .option(
      "--limit <count>",
      "Maximum rows per collection (1–100)",
      integer(1, 100),
      25,
    )
    .option(
      "--offset <count>",
      "Skip rows in each collection",
      integer(0, Number.MAX_SAFE_INTEGER),
      0,
    );
}
function cardScope(command: Command) {
  return command.option(
    "--board <reference>",
    "Board name, ID or link (required when using a card name)",
  );
}
function taskScope(command: Command) {
  return cardScope(
    command.requiredOption(
      "--card <reference>",
      "Parent card name, ID or link",
    ),
  );
}
function descriptions(command: Command, clear = false) {
  command
    .addOption(
      new Option("--description <text>", "Card description").conflicts([
        "descriptionFile",
        "clearDescription",
      ]),
    )
    .addOption(
      new Option(
        "--description-file <path>",
        "UTF-8 description file; use - for stdin",
      ).conflicts(["description", "clearDescription"]),
    );
  if (clear)
    command.addOption(
      new Option("--clear-description", "Clear the card description").conflicts(
        ["description", "descriptionFile"],
      ),
    );
  return command;
}
async function description(options: Record<string, any>) {
  if (options.clearDescription) return null;
  if (options.descriptionFile !== undefined) {
    try {
      if (options.descriptionFile === "-") {
        if (process.stdin.isTTY) throw new Error("stdin must be piped");
        let text = "";
        process.stdin.setEncoding("utf8");
        for await (const chunk of process.stdin) {
          text += chunk.toString();
          if (text.length > 1048576) throw new Error("too long");
        }
        return text;
      }
      return await readFile(options.descriptionFile, "utf8");
    } catch {
      throw new PlanktonError(
        "VALIDATION",
        "Cannot read description input. Use a readable UTF-8 file or pipe stdin (maximum 1,048,576 characters).",
      );
    }
  }
  return options.description;
}

export async function runCli(argv: string[]) {
  const program = new Command()
    .name("plankton")
    .description("Browse and update Planka boards, cards and checklists")
    .version(cliPackage.version)
    .option("--debug", "Print sanitized request diagnostics on stderr")
    .option("--json", "Machine-readable results on stdout, errors on stderr")
    .addHelpCommand()
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  const json = () => Boolean(program.opts().json);
  const execute = async (
    operation: Operation,
    input: Record<string, unknown>,
    options: Record<string, any> = {},
  ) => {
    // Validate before accessing the vault or making any requests.
    const parsed = operationSchemas[operation].parse(input);
    const client = await connectedClient(new KeyringStore(), {
      debug: program.opts().debug
        ? (details) => console.error(JSON.stringify({ debug: details }))
        : undefined,
    });
    const data = await client.execute(operation, parsed);
    printResult(
      compactResult(data, {
        limit: options.limit ?? 25,
        offset: options.offset ?? 0,
      }),
      json(),
    );
  };

  for (const name of ["setup", "login"]) {
    program
      .command(name)
      .description(
        "Open browser sign-in and save the connection (5 minute timeout)",
      )
      .argument("[URL]", "Planka URL; reuses the saved URL when omitted")
      .option("--manual", "Import session cookies in hidden terminal prompts")
      .action(
        async (url: string | undefined, options: { manual?: boolean }) => {
          const store = new KeyringStore();
          const old = await store.read();
          if (!url && !old?.url && !process.stdin.isTTY) {
            throw new PlanktonError(
              "VALIDATION",
              "Supply your Planka URL: plankton setup https://your-planka.example",
            );
          }
          const ask = async (prompt: string, secret = false) =>
            (await import("./prompt.js")).ask(prompt, secret);
          const target = normalizeUrl(
            url ?? old?.url ?? (await ask("Planka URL:")),
          );
          let session;
          if (options.manual) {
            session = sessionSchema.parse({
              accessToken: await ask("accessToken cookie (hidden):", true),
              httpOnlyToken:
                (await ask(
                  "httpOnlyToken cookie (hidden; blank if absent):",
                  true,
                )) || undefined,
            });
          } else {
            await (await import("./browser.js")).ensureBrowser();
            console.error(
              "Opening browser. Complete sign-in there; Plankton will save the connection and close the window.",
            );
            session = await (await import("./login.js")).browserLogin(target);
          }
          const account = await saveValidatedConnection(store, target, session);
          printResult({ url: target, account }, json());
        },
      );
  }
  program
    .command("install-browser")
    .description("Install Chromium for browser login")
    .action(async () => {
      await (await import("./browser.js")).installBrowser();
      printResult({ message: "Chromium installed." }, json());
    });
  program
    .command("doctor")
    .description("Check the credential vault and Planka account")
    .action(async () => {
      const account = await (
        await connectedClient(new KeyringStore(), {
          debug: program.opts().debug
            ? (details) => console.error(JSON.stringify({ debug: details }))
            : undefined,
        })
      ).account();
      printResult(
        { account, node: process.version, platform: process.platform },
        json(),
      );
    });
  program
    .command("logout")
    .description("Remove saved credentials; does not revoke the server session")
    .action(async () => {
      await new KeyringStore().clear();
      printResult(
        {
          message:
            "Local connection removed. Revoke the server session in Planka settings if needed.",
        },
        json(),
      );
    });

  const projects = program.command("projects").description("Browse projects");
  page(projects.command("list").description("List accessible projects")).action(
    (o) => execute("projects", {}, o),
  );
  const boards = program.command("boards").description("Browse boards");
  page(
    boards
      .command("list")
      .description("List boards")
      .option("--project <reference>", "Filter by project name, ID or link"),
  ).action((o) => execute("boards", { project: o.project }, o));
  for (const command of ["labels", "members"] as const) {
    page(
      boards
        .command(command)
        .description(`List board ${command}`)
        .requiredOption("--board <reference>", "Board name, ID or link"),
    ).action((o) =>
      execute(
        command === "labels" ? "board_labels" : "board_members",
        { board: o.board },
        o,
      ),
    );
  }
  const lists = program.command("lists").description("Browse board lists");
  page(
    lists
      .command("list")
      .description("List columns in a board")
      .requiredOption("--board <reference>", "Board name, ID or link"),
  ).action((o) => execute("lists", { board: o.board }, o));
  const cards = program
    .command("cards")
    .description("Find, read, create, edit and move cards");
  for (const command of ["list", "find"]) {
    page(
      cards
        .command(command)
        .description(
          command === "list"
            ? "List cards within a board"
            : "Search card titles within a board",
        )
        .requiredOption("--board <reference>", "Board name, ID or link")
        .option("--list <reference>", "Filter by list name or ID")
        .option(
          "--query <text>",
          "Case-insensitive title substring; omitted or empty lists all cards",
        ),
    ).action((o) =>
      execute(
        "find_cards",
        {
          board: o.board,
          list: o.list,
          query: o.query,
          limit: o.limit,
          offset: o.offset,
        },
        o,
      ),
    );
  }
  for (const command of ["archive", "delete"] as const) {
    cardScope(
      cards
        .command(`${command} <card>`)
        .description(
          command === "archive"
            ? "Move a card to its board archive"
            : "Permanently delete a card",
        ),
    ).action((card, o) =>
      execute(command === "archive" ? "archive_card" : "delete_card", {
        card,
        board: o.board,
      }),
    );
  }
  page(
    cardScope(
      cards
        .command("get <card>")
        .description(
          "Read a card description, members, labels and paged checklists/tasks",
        ),
    ),
  ).action((card, o) => execute("read_card", { card, board: o.board }, o));
  descriptions(
    cards
      .command("create")
      .description("Create one card")
      .requiredOption(
        "--board <reference>",
        "Destination board name, ID or link",
      )
      .requiredOption("--list <reference>", "Destination list name or ID")
      .requiredOption("--name <text>", "Card title")
      .addOption(
        new Option("--type <type>", "Card type")
          .choices(["project", "story"])
          .default("project"),
      )
      .option("--position <number>", "Sort position", position, 65535),
  ).action(async (o) =>
    execute("create_card", {
      board: o.board,
      list: o.list,
      name: o.name,
      description: await description(o),
      type: o.type,
      position: o.position,
    }),
  );
  descriptions(
    cardScope(
      cards
        .command("edit <card>")
        .description("Change title, description or due date")
        .addOption(
          new Option(
            "--due-date <datetime>",
            "Due date as ISO 8601 with timezone, e.g. 2026-09-10T17:00:00Z",
          ).conflicts("clearDueDate"),
        )
        .addOption(
          new Option("--clear-due-date", "Clear the card due date").conflicts(
            "dueDate",
          ),
        )
        .option("--name <text>", "New card title"),
    ),
    true,
  ).action(async (card, o) =>
    execute("edit_card", {
      card,
      board: o.board,
      name: o.name,
      description: await description(o),
      dueDate: o.clearDueDate ? null : o.dueDate,
    }),
  );
  cardScope(
    cards
      .command("move <card>")
      .description("Move one card to another list or board"),
  )
    .option(
      "--to-board <reference>",
      "Destination board; defaults to the card’s current board",
    )
    .requiredOption("--list <reference>", "Destination list name or ID")
    .option("--position <number>", "Sort position", position, 65535)
    .action((card, o) =>
      execute("move_card", {
        card,
        board: o.board,
        destinationBoard: o.toBoard,
        list: o.list,
        position: o.position,
      }),
    );

  for (const command of ["add-label", "remove-label"] as const) {
    cardScope(
      cards
        .command(`${command} <card>`)
        .description(
          command === "add-label"
            ? "Add an existing board label to a card"
            : "Remove a label from a card",
        ),
    )
      .requiredOption("--label <reference>", "Label name or ID")
      .action((card, o) =>
        execute(
          command === "add-label" ? "add_card_label" : "remove_card_label",
          { card, board: o.board, label: o.label },
        ),
      );
  }
  for (const command of ["assign", "unassign"] as const) {
    cardScope(
      cards
        .command(`${command} <card>`)
        .description(
          command === "assign"
            ? "Assign a board member to a card"
            : "Unassign a card member",
        ),
    )
      .requiredOption(
        "--member <reference>",
        "Member display name, @username or user ID",
      )
      .action((card, o) =>
        execute(command === "assign" ? "assign_card" : "unassign_card", {
          card,
          board: o.board,
          member: o.member,
        }),
      );
  }

  const checklists = program
    .command("checklists")
    .description("Read, create and rename card checklists");
  page(
    taskScope(
      checklists.command("list").description("Read checklists and their tasks"),
    ),
  ).action((o) => execute("task_lists", { card: o.card, board: o.board }, o));
  taskScope(checklists.command("create").description("Create one checklist"))
    .requiredOption("--name <text>", "Checklist name")
    .option("--position <number>", "Sort position", position, 65535)
    .action((o) =>
      execute("create_task_list", {
        card: o.card,
        board: o.board,
        name: o.name,
        position: o.position,
      }),
    );
  taskScope(
    checklists.command("edit <checklist>").description("Rename one checklist"),
  )
    .requiredOption("--name <text>", "New checklist name")
    .action((taskList, o) =>
      execute("edit_task_list", {
        card: o.card,
        board: o.board,
        taskList,
        name: o.name,
      }),
    );
  const tasks = program
    .command("tasks")
    .description("Add tasks and set completion");
  taskScope(
    tasks.command("add").description("Add one task to an existing checklist"),
  )
    .requiredOption("--checklist <reference>", "Checklist name or ID")
    .requiredOption("--name <text>", "Task name")
    .option("--position <number>", "Sort position", position, 65535)
    .action((o) =>
      execute("add_task", {
        card: o.card,
        board: o.board,
        taskList: o.checklist,
        name: o.name,
        position: o.position,
      }),
    );
  cardScope(
    tasks
      .command("complete <task>")
      .description("Complete a task, or reopen it with --undo"),
  )
    .option(
      "--card <reference>",
      "Parent card; required for task names or scope checks",
    )
    .option("--checklist <reference>", "Checklist name or ID within --card")
    .option("--undo", "Mark incomplete")
    .action((task, o) =>
      execute("complete_task", {
        card: o.card,
        board: o.board,
        taskList: o.checklist,
        task,
        isCompleted: !o.undo,
      }),
    );
  taskScope(
    checklists
      .command("delete <checklist>")
      .description("Permanently delete a checklist and its tasks"),
  ).action((taskList, o) =>
    execute("delete_task_list", { card: o.card, board: o.board, taskList }),
  );
  taskScope(
    tasks.command("delete <task>").description("Permanently delete a task"),
  )
    .requiredOption("--checklist <reference>", "Checklist name or ID")
    .action((task, o) =>
      execute("delete_task", {
        card: o.card,
        board: o.board,
        taskList: o.checklist,
        task,
      }),
    );
  for (const group of [projects, boards, lists, cards, checklists, tasks])
    group.action(() => group.outputHelp());
  program.action(() => program.outputHelp());
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return;
      throw new PlanktonError(
        error.code === "commander.invalidArgument" ? "VALIDATION" : "USAGE",
        error.message.replace(/^error: /, ""),
      );
    }
    throw error;
  }
}
