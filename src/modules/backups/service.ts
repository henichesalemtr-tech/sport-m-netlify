/**
 * خدمة النسخ الاحتياطي (Super Admin — backup.manage):
 * - إنشاء نسخة عبر mysqldump (child_process) — تفشل برسالة واضحة إن لم تتوفر الأداة.
 * - قائمة/تنزيل/استعادة (وضع صيانة + تأكيد مكتوب RESTORE + نسخة تلقائية قبل الاستعادة + Audit).
 * - سياسة احتفاظ GFS: يومي 7 / أسبوعي 4 / شهري 6 (retention.ts نقية).
 *
 * متطلبات التشغيل: MySQL/MariaDB client tools (mysqldump/mysql) مثبتة وفي PATH
 * (تأتي مع XAMPP في C:\xampp\mysql\bin). عند غيابها ترمي الخدمة BUSINESS_RULE
 * برسالة عربية واضحة ولا تنهار العملية.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { BackupRecord, Prisma } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { getEnv } from '@/shared/config/env';
import { getMysqlConnection, mysqlConnectionArgs } from '@/shared/db/mysql-connection';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, notFound } from '@/shared/errors';
import { settingsService } from '@/modules/settings/service';
import type { Meta } from '@/shared/api/meta';
import { backupRepository } from './repository';
import { scheduledKind, selectExpiredBackups } from './retention';
import type { BackupListQuery, CreateBackupInput, RestoreBackupInput } from './schema';

const ENTITY = 'BackupRecord';
const MAINTENANCE_KEY = 'system.maintenanceMode';

export interface BackupFileDto {
  bytes: Buffer;
  fileName: string;
  sizeBytes: bigint;
}

/** تنفيذ أمر خارجي مع فشل رقيق عند غياب الأداة (ENOENT). */
function runCommand(
  command: string,
  args: string[],
  options?: { stdinFile?: string; env?: Record<string, string> },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { env: { ...process.env, ...options?.env } });
    } catch (e) {
      reject(new AppError(ErrorCode.BUSINESS_RULE, `تعذر تشغيل ${command}: ${e instanceof Error ? e.message : String(e)}`));
      return;
    }
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(
          new AppError(
            ErrorCode.BUSINESS_RULE,
            `أداة ${command} غير متوفرة على الخادم — ثبّت أدوات MySQL/MariaDB (تأتي مع XAMPP في C:\\xampp\\mysql\\bin) وأضفها إلى PATH، أو عيّن مسارها في .env عبر MYSQLDUMP_BIN / MYSQL_BIN`,
          ),
        );
      } else {
        reject(new AppError(ErrorCode.INTERNAL, `فشل تشغيل ${command}: ${err.message}`));
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new AppError(
            ErrorCode.INTERNAL,
            `${command} انتهى برمز ${code ?? 'null'}: ${stderr.slice(0, 500) || 'بدون تفاصيل'}`,
          ),
        );
      }
    });
    if (options?.stdinFile) {
      const stream = createReadStream(options.stdinFile);
      stream.on('error', (err) => {
        child.stdin?.destroy();
        reject(new AppError(ErrorCode.INTERNAL, `تعذر قراءة ملف النسخة: ${err.message}`));
      });
      stream.pipe(child.stdin!);
    }
  });
}

/** وسائط الاتصال + تمرير كلمة المرور عبر MYSQL_PWD (لا تظهر في سطر العمليات). */
function mysqlArgs(extra: string[]): string[] {
  const conn = getMysqlConnection();
  return [...mysqlConnectionArgs(conn), ...extra];
}

function mysqlPasswordEnv(): Record<string, string> {
  const conn = getMysqlConnection();
  return conn.password ? { MYSQL_PWD: conn.password } : {};
}

async function sha256File(filePath: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function ensureBackupDir(): Promise<string> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.resolve(getEnv().BACKUP_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** حماية من Path Traversal عند بناء مسار ملف نسخة. */
function backupPath(dir: string, fileName: string): string {
  return `${dir}/${fileName.replace(/^.*[/\\]/, '').replace(/[^\w.\-]/g, '_')}`;
}

/** سجل نسخة بصيغة الإدراج المباشر — لإعادة بناء صفّه بعد الاستعادة. */
function recordSnapshot(b: BackupRecord, createdBy: string | null): Prisma.BackupRecordUncheckedCreateInput {
  return {
    id: b.id,
    fileName: b.fileName,
    storageKey: b.storageKey,
    sizeBytes: b.sizeBytes,
    kind: b.kind,
    checksum: b.checksum,
    createdAt: b.createdAt,
    createdBy,
  };
}

function systemMeta(meta: Meta | null): { user: null | Meta['user']; requestId: string; ip?: string; userAgent?: string } {  return {
    user: meta?.user ?? null,
    requestId: meta?.requestId ?? 'system',
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  };
}

export const backupService = {
  /** إنشاء نسخة احتياطية (يدوية أو مجدولة) + تطبيق سياسة الاحتفاظ. */
  async create(meta: Meta | null, input: CreateBackupInput = {}): Promise<BackupRecord> {
    const kind = input.kind ?? 'manual';
    const dir = await ensureBackupDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `backup-${kind}-${stamp}.sql`;
    const filePath = backupPath(dir, fileName);

    // SQL نصي (--single-transaction لقراءة متسقة دون قفل الجداول)
    await runCommand(
      getEnv().MYSQLDUMP_BIN,
      mysqlArgs([
        '--single-transaction',
        '--routines',
        '--triggers',
        '--default-character-set=utf8mb4',
        `--result-file=${filePath}`,
      ]),
      { env: mysqlPasswordEnv() },
    );

    const fs = await import('node:fs/promises');
    const stat = await fs.stat(filePath);
    const checksum = await sha256File(filePath);

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.backupRecord.create({
        data: {
          fileName,
          storageKey: filePath,
          sizeBytes: BigInt(stat.size),
          kind,
          checksum,
          createdBy: meta?.user.userId ?? null,
        },
      });
      await writeAudit(
        {
          userId: meta?.user.userId ?? null,
          action: 'BACKUP',
          entityType: ENTITY,
          entityId: created.id,
          requestId: systemMeta(meta).requestId,
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
          after: { fileName, kind, sizeBytes: String(created.sizeBytes), checksum, reason: input.reason ?? null },
        },
        tx,
      );
      return created;
    });

    await this.enforceRetention(meta);
    return record;
  },

  async list(query: BackupListQuery): Promise<{ items: BackupRecord[]; total: number }> {
    return backupRepository.list(query);
  },

  /** تنزيل نسخة — يسجَّل في Audit كوصول لبيانات حساسة. */
  async download(id: string, meta: Meta): Promise<BackupFileDto> {
    const record = await backupRepository.findById(id);
    if (!record) throw notFound('النسخة الاحتياطية');
    const fs = await import('node:fs/promises');
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(record.storageKey);
    } catch {
      throw notFound('ملف النسخة الاحتياطية');
    }
    await writeAudit({
      userId: meta.user.userId,
      action: 'VIEW_SENSITIVE',
      entityType: ENTITY,
      entityId: id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { operation: 'download', fileName: record.fileName },
    });
    return { bytes, fileName: record.fileName, sizeBytes: record.sizeBytes };
  },

  /**
   * استعادة نسخة — أخطر عملية في النظام:
   * 1) نسخة تلقائية قبل الاستعادة (pre-restore) — إن فشلت تُوقف العملية كاملة.
   * 2) تفعيل وضع الصيانة (Setting).
   * 3) mysql < الملف (mysqldump يتضمن DROP TABLE قبل كل CREATE).
   * 4) Audit + تسجيل restoredAt.
   * عند الفشل يبقى وضع الصيانة مفعّلًا عمدًا (حماية للبيانات) ويُبلَّغ المدير.
   */
  async restore(input: RestoreBackupInput, meta: Meta): Promise<{ restoredFrom: string; preRestoreBackupId: string | null }> {
    const record = await backupRepository.findById(input.backupId);
    if (!record) throw notFound('النسخة الاحتياطية');
    const fs = await import('node:fs/promises');
    try {
      await fs.access(record.storageKey);
    } catch {
      throw notFound('ملف النسخة الاحتياطية');
    }

    // 1) نسخة أمان تلقائية قبل الاستعادة
    let preRestore: BackupRecord | null = null;
    try {
      preRestore = await this.create(meta, { kind: 'manual', reason: `pre-restore before ${record.fileName}` });
    } catch (e) {
      if (e instanceof AppError) {
        throw new AppError(e.code, `تعذر إنشاء نسخة أمان قبل الاستعادة — أُلغيت العملية. ${e.message}`);
      }
      throw e;
    }

    // 2) وضع الصيانة
    await settingsService.set(
      MAINTENANCE_KEY,
      { value: true, valueType: 'boolean', group: 'system', description: 'وضع الصيانة أثناء استعادة نسخة احتياطية' },
      systemMeta(meta),
    );

    try {
      // 3) الاستعادة — mysql يقرأ أمر SQL من stdin
      await runCommand(getEnv().MYSQL_BIN, mysqlArgs([]), {
        stdinFile: record.storageKey,
        env: mysqlPasswordEnv(),
      });

      // 4) إعادة بناء سجلّات النسخ بعد الاستعادة ثم Audit + restoredAt
      // الاستيراد استبدل جدول backup_records بنسخته القديمة، فصفّ النسخة
      // المستعاد منها (وصفّة نسخة الأمان) اختفى مع أن ملفيهما موجودان.
      const ownerExists = await prisma.user.findUnique({ where: { id: meta.user.userId }, select: { id: true } });
      const ownerId = ownerExists ? meta.user.userId : null;
      await prisma.$transaction(async (tx) => {
        if (preRestore) await backupRepository.upsertRecord(recordSnapshot(preRestore, ownerId), tx);
        await backupRepository.upsertRecord(recordSnapshot(record, ownerId), tx);
        await backupRepository.markRestored(record.id, tx);
        await writeAudit(
          {
            userId: ownerId,
            action: 'RESTORE_BACKUP',
            entityType: ENTITY,
            entityId: record.id,
            requestId: meta.requestId,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
            before: { fileName: record.fileName, checksum: record.checksum },
            metadata: { reason: input.reason, preRestoreBackupId: preRestore?.id ?? null },
          },
          tx,
        );
      });

      // إنهاء وضع الصيانة عند النجاح فقط
      await settingsService.set(
        MAINTENANCE_KEY,
        { value: false, valueType: 'boolean', group: 'system' },
        systemMeta(meta),
      );
      return { restoredFrom: record.fileName, preRestoreBackupId: preRestore?.id ?? null };
    } catch (e) {
      // الفشل: يبقى وضع الصيانة مفعّلًا عمدًا — يتطلب تدخل المدير.
      // استيراد الملف يمسح جدول الإعدادات بنسخته القديمة، فالراية تُعاد كتابتها
      // هنا حتى لا يظن المدير أن النظام يعمل عاديًا فوق قاعدة نصف مستعادة.
      try {
        await settingsService.set(
          MAINTENANCE_KEY,
          { value: true, valueType: 'boolean', group: 'system' },
          systemMeta(meta),
        );
      } catch {
        // تعذر ضبط الراية — الخطأ الأصلي هو المهم
      }
      const message = e instanceof Error ? e.message : String(e);
      await writeAudit({
        userId: meta.user.userId,
        action: 'RESTORE_BACKUP',
        entityType: ENTITY,
        entityId: record.id,
        requestId: meta.requestId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { result: 'failed', reason: input.reason, error: message.slice(0, 1000) },
      });
      throw new AppError(
        ErrorCode.INTERNAL,
        `فشلت الاستعادة وبقي وضع الصيانة مفعّلًا — تحقق من السجلات. التفاصيل: ${message.slice(0, 300)}`,
      );
    }
  },

  /** حذف النسخ المنتهية حسب سياسة الاحتفاظ، والسجلات التي فقدت ملفها (ملف + سجل + Audit). */
  async enforceRetention(meta: Meta | null): Promise<number> {
    const all = await backupRepository.listAll();
    const fs = await import('node:fs/promises');
    const expiredIds = selectExpiredBackups(
      all.map((b) => ({ id: b.id, createdAt: b.createdAt, kind: b.kind })),
    );

    // سجل بلا ملف على القرص = رابط تنزيل ميت في الواجهة؛ يظهر غالبًا بعد استعادة
    // نسخة قديمة (الاستيراد يعيد جدول السجلات كما كان وقت الالتقاط).
    const missing = new Set<string>();
    if (getEnv().STORAGE_DRIVER === 'local') {
      for (const b of all) {
        try {
          await fs.access(b.storageKey);
        } catch {
          missing.add(b.id);
        }
      }
    }

    const targets = [...new Set([...expiredIds, ...missing])];
    if (targets.length === 0) return 0;

    let deleted = 0;
    for (const id of targets) {
      const record = all.find((b) => b.id === id);
      if (!record) continue;
      try {
        await fs.unlink(record.storageKey);
      } catch {
        // الملف غير موجود أصلًا — يُحذف السجل رغم ذلك
      }
      await prisma.$transaction(async (tx) => {
        await backupRepository.deleteRecord(id, tx);
        await writeAudit(
          {
            userId: meta?.user.userId ?? null,
            action: 'DELETE',
            entityType: ENTITY,
            entityId: id,
            requestId: systemMeta(meta).requestId,
            ipAddress: meta?.ip,
            userAgent: meta?.userAgent,
            before: { fileName: record.fileName, kind: record.kind },
            metadata: { operation: missing.has(id) ? 'missing_file' : 'retention' },
          },
          tx,
        );
      });
      deleted++;
    }
    return deleted;
  },

  /** نوع النسخة المجدولة اليوم (تستخدمه مهمة النسخ الاحتياطي). */
  scheduledKindForToday(now: Date = new Date()): 'daily' | 'weekly' | 'monthly' {
    return scheduledKind(now);
  },

  /** فحص توفر أدوات MySQL/MariaDB (للتشخيص من الواجهة). */
  async checkToolsAvailable(): Promise<{ mysqldump: boolean; mysql: boolean }> {
    const check = (cmd: string) =>
      runCommand(cmd, ['--version'])
        .then(() => true)
        .catch(() => false);
    const [mysqldump, mysql] = await Promise.all([
      check(getEnv().MYSQLDUMP_BIN),
      check(getEnv().MYSQL_BIN),
    ]);
    return { mysqldump, mysql };
  },
};
