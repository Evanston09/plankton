import { z } from "zod";
const id = z.string().regex(/^\d+$/);
export const entitySchema = z
  .object({
    id,
    name: z.string().optional(),
    username: z.string().optional(),
    projectId: id.optional(),
    boardId: id.optional(),
    listId: id.optional(),
    cardId: id.optional(),
    taskListId: id.optional(),
    type: z.string().optional(),
    listChangedAt: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    isCompleted: z.boolean().optional(),
    position: z.number().finite().optional(),
  })
  .catchall(z.unknown());
export type Entity = z.infer<typeof entitySchema>;
export const itemResponseSchema = z.object({ item: entitySchema });
export const itemsResponseSchema = z.object({ items: z.array(entitySchema) });
export const projectsResponseSchema = itemsResponseSchema.extend({
  included: z.object({ boards: z.array(entitySchema) }),
});
export const boardResponseSchema = itemResponseSchema.extend({
  included: z.object({
    lists: z.array(entitySchema),
    cards: z.array(entitySchema),
  }),
});
export const cardResponseSchema = itemResponseSchema.extend({
  included: z.object({
    taskLists: z.array(entitySchema),
    tasks: z.array(entitySchema),
  }),
});
export type CardResponse = z.infer<typeof cardResponseSchema>;

export type CollectionResult = { items: Entity[] };
export type SearchResult = CollectionResult & { truncated: boolean };
export type ItemResult = { item: Entity; url?: string };
export type CardResult = ItemResult & { taskLists: Entity[]; tasks: Entity[] };
export type TaskListsResult = CollectionResult & {
  tasks: Entity[];
  url: string;
};
export interface OperationResults {
  projects: CollectionResult;
  boards: CollectionResult;
  lists: CollectionResult;
  find_cards: SearchResult;
  read_card: CardResult;
  create_card: ItemResult;
  edit_card: ItemResult;
  move_card: ItemResult;
  task_lists: TaskListsResult;
  create_task_list: ItemResult;
  edit_task_list: ItemResult;
  add_task: ItemResult;
  complete_task: ItemResult;
}
export type OperationResult = OperationResults[Operation];
const ref = z.string().trim().min(1).max(2048);
const name = z.string().trim().min(1).max(1024);
const position = z.number().finite().nonnegative().default(65535);
const description = z.string().min(1).max(1048576).nullable();
export const operationSchemas = {
  projects: z.object({}).strict(),
  boards: z.object({ project: ref.optional() }).strict(),
  lists: z.object({ board: ref }).strict(),
  find_cards: z
    .object({
      board: ref,
      query: z.string().trim().min(1).max(128),
      limit: z.number().int().min(1).max(100).default(25),
    })
    .strict(),
  read_card: z.object({ card: ref, board: ref.optional() }).strict(),
  create_card: z
    .object({
      board: ref,
      list: ref,
      name,
      description: description.optional(),
      type: z.enum(["project", "story"]).default("project"),
      position,
    })
    .strict(),
  edit_card: z
    .object({
      card: ref,
      board: ref.optional(),
      name: name.optional(),
      description: description.optional(),
    })
    .strict()
    .refine((v) => v.name !== undefined || v.description !== undefined),
  move_card: z
    .object({
      card: ref,
      board: ref.optional(),
      destinationBoard: ref.optional(),
      list: ref,
      position,
    })
    .strict(),
  task_lists: z.object({ card: ref, board: ref.optional() }).strict(),
  create_task_list: z
    .object({ card: ref, board: ref.optional(), name: name.max(128), position })
    .strict(),
  edit_task_list: z
    .object({
      card: ref,
      board: ref.optional(),
      taskList: ref,
      name: name.max(128),
    })
    .strict(),
  add_task: z
    .object({ card: ref, board: ref.optional(), taskList: ref, name, position })
    .strict(),
  complete_task: z
    .object({
      card: ref,
      board: ref.optional(),
      taskList: ref,
      task: ref,
      isCompleted: z.boolean().default(true),
    })
    .strict(),
};
export type Operation = keyof typeof operationSchemas;
export type OperationInput<K extends Operation> = z.input<
  (typeof operationSchemas)[K]
>;
export type ParsedOperation = {
  [K in Operation]: z.output<(typeof operationSchemas)[K]> & {
    operation: K;
  };
}[Operation];
