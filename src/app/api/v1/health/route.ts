import { NextResponse } from 'next/server';

/**
 * تشخيص إقلاع المنصّة: كل فحص يُحمَّل ديناميكيًا داخل try/catch، لأن أعطال وقت
 * الاستيراد (محرك Prisma أو مرغون2 في دوال سيرفرية) تُسقط الصفحة الافتراضية 500
 * بلا أي معلومة — وهذا المسار هو ما يفرّق بينها.
 * لا يُعيد أي قيمة سرّية: تُحذف قيم متغيرات البيئة ومضيف القاعدة من كل رسالة.
 */
export const dynamic = 'force-dynamic';

const SECRET_KEYS = ['DATABASE_URL', 'APP_SECRET', 'SESSION_SECRET', 'CRON_SECRET'] as const;

function scrub(text: string): string {
  let out = text.replace(/\s+/g, ' ').trim().slice(0, 300);
  for (const key of SECRET_KEYS) {
    const value = process.env[key];
    if (!value || value.length < 5) continue;
    out = out.split(value).join('<redacted>');
    const at = value.lastIndexOf('@');
    const host = at > 0 ? value.slice(at + 1).split('?')[0] ?? '' : '';
    if (host.length > 3) out = out.split(host).join('<db-host>');
  }
  return out;
}

type Check = { ok: true } | { ok: false; kind: string; detail: string };

async function attempt(load: () => Promise<unknown>): Promise<Check> {
  try {
    await load();
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { ok: false, kind: err.name || (err.constructor?.name ?? 'unknown'), detail: scrub(err.message) };
  }
}

export async function GET() {
  const envPresent: Record<string, boolean> = {};
  for (const key of SECRET_KEYS) envPresent[key] = Boolean(process.env[key]);

  const checks = {
    runtime: {
      node: process.version,
      nodeEnv: process.env.NODE_ENV ?? null,
      storageDir: Boolean(process.env.STORAGE_LOCAL_DIR),
    },
    envPresent,
    prismaGeneratedClient: await attempt(() => import('@prisma/client')),
    apiRouteLayer: await attempt(() => import('@/shared/api/route')),
    argon2: await attempt(async () => {
      const { hashPassword, verifyPassword } = await import('@/shared/auth/password');
      const hash = await hashPassword('health-check');
      if (!(await verifyPassword(hash, 'health-check'))) throw new Error('تحقق مرغون2 فشل');
    }),
    database: await attempt(async () => {
      const { prisma } = await import('@/shared/db/client');
      await prisma.$queryRaw`SELECT 1`;
    }),
  };

  const failing = Object.entries(checks).filter(
    ([, v]) => typeof v === 'object' && v !== null && 'ok' in v && v.ok === false,
  );
  return NextResponse.json(
    { ok: failing.length === 0, failing: failing.map(([name]) => name), checks },
    { headers: { 'cache-control': 'no-store' } },
  );
}
