import { z } from 'zod';

/** معاملات القوائم الموحّدة (4.3): ?page&pageSize&q&sort&<filters> — حد أقصى 100. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  sort: z.string().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** تحويل sort="field,-other" إلى orderBy لـ Prisma. */
export function toOrderBy(sort: string | undefined, allowed: string[]): Record<string, 'asc' | 'desc'>[] {
  if (!sort) return [];
  return sort
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const desc = token.startsWith('-');
      const field = desc ? token.slice(1) : token;
      if (!allowed.includes(field)) return null;
      return { [field]: desc ? ('desc' as const) : ('asc' as const) };
    })
    .filter((x): x is Record<string, 'asc' | 'desc'> => x !== null);
}

export function pagination(query: ListQuery) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
