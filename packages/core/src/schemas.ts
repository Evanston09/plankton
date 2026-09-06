import { z } from "zod";
const id = z.string().regex(/^\d+$/);
export const entitySchema = z
  .object({
    id,
    name: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    projectId: id.optional(),
    boardId: id.optional(),
    listId: id.optional(),
    cardId: id.optional(),
    labelId: id.optional(),
    userId: id.optional(),
    dueDate: z.string().nullable().optional(),
    taskListId: id.optional(),
    type: z.string().optional(),
    listChangedAt: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    isCompleted: z.boolean().optional(),
    position: z.number().finite().nullable().optional(),
  })
  .catchall(z.unknown());
export type Entity = z.infer<typeof entitySchema>;
export const itemResponseSchema = z.object({ item: entitySchema });
export const itemsResponseSchema = z.object({ items: z.array(entitySchema) });
export const projectsResponseSchema = itemsResponseSchema.extend({
  included: z.object({ boards: z.array(entitySchema) }),
});
const associations = {
  cardMemberships: z
    .array(entitySchema.extend({ cardId: id, userId: id }))
    .default([]),
  cardLabels: z
    .array(entitySchema.extend({ cardId: id, labelId: id }))
    .default([]),
};
export const cardPageResponseSchema = itemsResponseSchema.extend({
  included: z
    .object(associations)
    .default({ cardMemberships: [], cardLabels: [] }),
});
export const boardResponseSchema = itemResponseSchema.extend({
  included: z.object({
    ...associations,
    lists: z.array(entitySchema),
    cards: z.array(entitySchema),
    labels: z.array(entitySchema).optional(),
    users: z.array(entitySchema).optional(),
    boardMemberships: z.array(entitySchema.extend({ userId: id })).optional(),
  }),
});
export const cardResponseSchema = itemResponseSchema.extend({
  included: z.object({
    taskLists: z.array(entitySchema),
    tasks: z.array(entitySchema),
    ...associations,
  }),
});
export type CardResponse = z.infer<typeof cardResponseSchema>;
export type BoardResponse = z.infer<typeof boardResponseSchema>;
export type CardAssociations = Pick<
  CardResponse["included"],
  "cardMemberships" | "cardLabels"
>;
export type CardSummary = Entity & {
  url: string;
  boardId: string;
  boardName: Entity["name"];
  listName: Entity["name"];
  members: Pick<Entity, "id" | "name" | "username">[];
  labels: (Pick<Entity, "id" | "name"> & { color: unknown })[];
  memberIds: string[];
  labelIds: string[];
};

export type CollectionResult = { items: Entity[] };
export type SearchResult = {
  items: CardSummary[];
  truncated: boolean;
  complete: boolean;
  paging: { items: { total: number; nextOffset?: number } };
};
export type ItemResult = { item: Entity; url?: string };
export type CardResult = {
  item: CardSummary;
  taskLists: Entity[];
  tasks: Entity[];
};
export type TaskListsResult = CollectionResult & {
  tasks: Entity[];
  url: string;
};
export interface OperationResults {
  projects: CollectionResult;
  boards: CollectionResult;
  lists: CollectionResult;
  board_labels: CollectionResult;
  board_members: CollectionResult;
  find_cards: SearchResult;
  read_card: CardResult;
  create_card: ItemResult;
  edit_card: ItemResult;
  add_card_label: AssociationResult;
  remove_card_label: AssociationResult;
  assign_card: AssociationResult;
  unassign_card: AssociationResult;
  move_card: ItemResult;
  task_lists: TaskListsResult;
  create_task_list: ItemResult;
  edit_task_list: ItemResult;
  add_task: ItemResult;
  complete_task: ItemResult;
  archive_card: ItemResult;
  delete_card: ItemResult;
  delete_task_list: ItemResult;
  delete_task: ItemResult;
}
export type AssociationResult =
  ItemResult | (CollectionResult & { url: string });
export type OperationResult = OperationResults[Operation];
const ref = z.string().trim().min(1).max(2048);
const refs = z
  .union([ref, z.array(ref).min(1)])
  .transform((value) => (typeof value === "string" ? [value] : value));
const name = z.string().trim().min(1).max(1024);
const position = z.number().finite().nonnegative().default(65535);
const description = z.string().min(1).max(1048576).nullable();
export const operationSchemas = {
  projects: z.object({}).strict(),
  boards: z.object({ project: ref.optional() }).strict(),
  lists: z.object({ board: ref }).strict(),
  board_labels: z.object({ board: ref }).strict(),
  board_members: z.object({ board: ref }).strict(),
  find_cards: z
    .object({
      board: ref,
      query: z.string().trim().max(128).default(""),
      list: ref.optional(),
      offset: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER)
        .default(0),
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
      member: refs.optional(),
      label: refs.optional(),
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
      dueDate: z.iso
        .datetime({ offset: true })
        .transform((value) => new Date(value).toISOString())
        .nullable()
        .optional(),
    })
    .strict()
    .refine(
      (v) =>
        v.name !== undefined ||
        v.description !== undefined ||
        v.dueDate !== undefined,
    ),
  add_card_label: z
    .object({ card: ref, board: ref.optional(), label: refs })
    .strict(),
  remove_card_label: z
    .object({ card: ref, board: ref.optional(), label: refs })
    .strict(),
  assign_card: z
    .object({ card: ref, board: ref.optional(), member: refs })
    .strict(),
  unassign_card: z
    .object({ card: ref, board: ref.optional(), member: refs })
    .strict(),
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
  archive_card: z.object({ card: ref, board: ref.optional() }).strict(),
  delete_card: z.object({ card: ref, board: ref.optional() }).strict(),
  delete_task_list: z
    .object({ card: ref, board: ref.optional(), taskList: ref })
    .strict(),
  delete_task: z
    .object({ card: ref, board: ref.optional(), taskList: ref, task: ref })
    .strict(),
  complete_task: z
    .object({
      card: ref.optional(),
      board: ref.optional(),
      taskList: ref.optional(),
      task: ref,
      isCompleted: z.boolean().default(true),
    })
    .strict()
    .refine(
      (v) =>
        Boolean(v.card) || (!v.board && !v.taskList && /^\d+$/.test(v.task)),
      {
        message:
          "Supply --card for task names or scope checks, or use a bare task ID.",
        path: ["card"],
      },
    ),
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
