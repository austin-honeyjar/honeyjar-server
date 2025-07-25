import { z } from 'zod';

export const createTableSchema = z.object({
  columns: z.array(z.string()).min(1),
  data: z.array(z.array(z.any())).min(1),
  fileName: z.string().min(1)
});

export const deleteTableSchema = z.object({
  tableName: z.string().min(1)
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type DeleteTableInput = z.infer<typeof deleteTableSchema>; 