/**
 * تسجيل دخول المدير لاختبارات E2E.
 * الافتراضي هو حساب `seed:demo` (admin@demo.test / Demo@12345 — ثابتان منشوران في
 * scripts/seed-demo.ts)، حتى تعمل `npm run test:e2e` بعد `npm run seed:demo` بلا أي
 * ضبط متغيرات بيئة. للبيئة الحقيقية استخدم SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD.
 * لا نستخدم حساب seed المرجعي (admin@club.local) لأن Suite E2E يغيّر كلمة المرور
 * الإجبارية أحيانًا، فيستهلك حساب المدير الذي يدخل منه الإنسان.
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';

export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@demo.test';
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD?.trim() || 'Demo@12345';

/** كلمة المرور الجديدة بعد تغيير القفل الإجباري (mustChangePassword). */
export const TEST_PASSWORD = process.env.E2E_PASSWORD?.trim() || 'E2e#Passw0rd!';

export function unique(suffix = ''): string {
  return `${Date.now()}${suffix}`;
}

/**
 * 503 يعني أن اتصال قاعدة البيانات فشل قبل تنفيذ أي استعلام (الخادم لم يكتمل إقلاعه أو
 * القاعدة مستيقظة لحظيًّا) — إعادة محاولة واحدة تعكس سلوك العميل الحقيقي ولا تغيّر الدلالة.
 */
export async function postLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<APIResponse> {
  const first = await tryLogin(request, email, password);
  if (first.status() !== 503) return first;
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return tryLogin(request, email, password);
}

async function tryLogin(request: APIRequestContext, email: string, password: string) {
  return request.post('/api/v1/auth/login', { data: { email, password } });
}

/**
 * تسجيل دخول كمدير مع التعامل مع تغيير كلمة المرور الإجباري مرة واحدة.
 * idempotent وآمن من السباق: إذا سبق عامل/مشروع آخر بتغيير كلمة المرور فإن الدخول
 * بالكلمة الأصلية يفشل فنجرّب كلمة المرور الجديدة مباشرة.
 * تُرجع كلمة المرور الصالحة فعليًا الآن (ليستعملها تسجيل الدخول من المتصفح).
 */
export async function adminSession(request: APIRequestContext): Promise<string> {
  // 1) الكلمة الأصلية (الحساب المزروع لم يُغيَّر بعد).
  let res = await tryLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);

  if (!res.ok()) {
    // 2) ربما غُيِّرت سابقًا — نجرب كلمة الاختبار.
    res = await tryLogin(request, ADMIN_EMAIL, TEST_PASSWORD);
    if (!res.ok()) {
      throw new Error(`دخول المدير فشل: ${res.status()} ${await res.text()}`);
    }
    return TEST_PASSWORD; // جلسة سارية بكلمة الاختبار، لا تغيير مطلوب.
  }

  const body = (await res.json()) as { data: { mustChangePassword: boolean } };
  if (!body.data.mustChangePassword) return ADMIN_PASSWORD;

  // 3) تغيير الكلمة الإجباري ثم إعادة الدخول (التغيير يُبطل الجلسات).
  const change = await request.post('/api/v1/auth/change-password', {
    data: { currentPassword: ADMIN_PASSWORD, newPassword: TEST_PASSWORD },
  });
  if (!change.ok()) {
    // عامل متزامن غيَّرها بين دخولنا ومحاولة التغيير — نتراجع إلى الدخول بكلمة الاختبار.
    const retry = await tryLogin(request, ADMIN_EMAIL, TEST_PASSWORD);
    if (!retry.ok()) {
      throw new Error(`تغيير كلمة المرور فشل: ${change.status()} ${await change.text()}`);
    }
    return TEST_PASSWORD;
  }
  const relogin = await tryLogin(request, ADMIN_EMAIL, TEST_PASSWORD);
  if (!relogin.ok()) {
    throw new Error(`إعادة الدخول فشلت: ${relogin.status()} ${await relogin.text()}`);
  }
  return TEST_PASSWORD;
}

/** إنشاء مستخدم بدور معيّن وتسجيل الدخول بحسابه (سياق request مستقل). */
export async function loginAs(
  request: APIRequestContext,
  role: string,
): Promise<{ email: string; password: string }> {
  const email = `e2e.${role.toLowerCase()}.${unique()}@example.test`;
  const password = 'E2eUser#12345';
  const created = await request.post('/api/v1/users', {
    data: { email, fullName: `E2E ${role}`, password, role },
  });
  if (!created.ok()) throw new Error(`إنشاء مستخدم ${role} فشل: ${created.status()} ${await created.text()}`);

  const login = await tryLogin(request, email, password);
  if (!login.ok()) throw new Error(`دخول ${role} فشل: ${login.status()} ${await login.text()}`);
  return { email, password };
}
