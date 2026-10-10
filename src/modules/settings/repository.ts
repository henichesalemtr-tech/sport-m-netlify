import { prisma, type PrismaTransaction } from '@/shared/db/client';
import type { Setting } from '@prisma/client';

type Db = typeof prisma | PrismaTransaction;

export interface SettingUpsertData {
  value: string;
  valueType: string;
  group: string;
  description?: string | null;
  updatedBy?: string | null;
}

/** استعلامات الإعدادات فقط — لا قواعد عمل هنا (4.2). */
export const settingsRepository = {
  findAll(db: Db = prisma): Promise<Setting[]> {
    return db.setting.findMany({ orderBy: { key: 'asc' } });
  },

  findByGroup(group: string, db: Db = prisma): Promise<Setting[]> {
    return db.setting.findMany({ where: { group }, orderBy: { key: 'asc' } });
  },

  findByKey(key: string, db: Db = prisma): Promise<Setting | null> {
    return db.setting.findUnique({ where: { key } });
  },

  findByKeys(keys: string[], db: Db = prisma): Promise<Setting[]> {
    return db.setting.findMany({ where: { key: { in: keys } } });
  },

  upsert(key: string, data: SettingUpsertData, db: Db = prisma): Promise<Setting> {
    return db.setting.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
  },
};
