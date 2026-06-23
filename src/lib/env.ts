import { z } from 'zod';

const schema = z.object({
  POSTGRES_URL: z.string().min(1, 'POSTGRES_URL é obrigatória'),
  POSTGRES_URL_DIRECT: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET é obrigatória'),
  APP_URL: z.string().url().default('http://localhost:3000'),
});

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return schema.parse(source);
}

export const serverEnv = parseServerEnv();
