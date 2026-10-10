/**
 * مساعدات اختبار E2E (Playwright).
 * يتطلب تطبيقًا يعمل على baseURL (يشغّله Playwright عبر webServer) وقاعدة بيانات مزروعة
 * (npm run seed) مع SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD.
 * كل الدوال تتعامل مع Cookie الجلسة (httpOnly) تلقائيًا عبر سياق request في Playwright.
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';

export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? '';
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';

/** كلمة المرور الجديدة بعد تغيير القفل الإجباري (mustChangePassword). */
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'E2e#Passw0rd!';

export function unique(suffix = ''): string {
  return `${Date.now()}${suffix}`;
}

/**
 * 503 يعني أن الاتصال بقاعدة البيانات لم يُنشأ ولم يُنفَّذ أي استعلام (حوسبة serverless
 * مستيقظة من الخمول) — إعادة محاولة واحدة تعكس سلوك العميل الحقيقي ولا تغيّر الدلالة.
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
 */
export async function adminSession(request: APIRequestContext): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD غير مضبوطين — لا يمكن تشغيل E2E');
  }

  // 1) الكلمة الأصلية (الحساب المزروع لم يُغيَّر بعد).
  let res = await tryLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);

  if (!res.ok()) {
    // 2) ربما غُيِّرت سابقًا — نجرب كلمة الاختبار.
    res = await tryLogin(request, ADMIN_EMAIL, TEST_PASSWORD);
    if (!res.ok()) {
      throw new Error(`دخول المدير فشل: ${res.status()} ${await res.text()}`);
    }
    return; // جلسة سارية بكلمة الاختبار، لا تغيير مطلوب.
  }

  const body = (await res.json()) as { data: { mustChangePassword: boolean } };
  if (!body.data.mustChangePassword) return;

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
    return;
  }
  const relogin = await tryLogin(request, ADMIN_EMAIL, TEST_PASSWORD);
  if (!relogin.ok()) {
    throw new Error(`إعادة الدخول فشلت: ${relogin.status()} ${await relogin.text()}`);
  }
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
