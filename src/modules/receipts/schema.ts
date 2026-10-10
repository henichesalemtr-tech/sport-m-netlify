import { z } from 'zod';
import { uuidSchema } from '@/shared/validation/common';

export const receiptParamsSchema = z.object({ id: uuidSchema });

export const receiptTemplateSchema = z.enum(['A4', '80mm']);

export type ReceiptParams = z.infer<typeof receiptParamsSchema>;
