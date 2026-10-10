/**
 * مساعدات اختبار E2E (Playwright).
 * ⚠️ غير مُتحقق منه بالتشغيل (بيئة البناء بلا node/متصفح). يتطلب:
 *    - تطبيقًا يعمل على baseURL (npm run dev)
 *    - قاعدة بيانات مزروعة (npm run seed) مع SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD
 * كل الدوال تتعامل مع Cookie الجلسة (httpOnly) تلقائيًا عبر سياق request في Playwright.
 */
import type { APIRequestContext } from '@playwright/test';

export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? '';
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';

/** كلمة مرور جديدة لقفل حساب الاختبار بعد أول دخول (mustChangePassword). */
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'E2e#Passw0rd!';

let changedOnce = false;

export function unique(suffix = ''): string {
  return `${Date.now()}${suffix}`;
}

/** تسجيل دخول كمدير مع تغيير كلمة المرور الإجبارية مرة واحدة ثم إعادة الدخول. */
export async function adminSession(request: APIRequestContext): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD غير مضبوطين — لا يمكن تشغيل E2E');
  }

  let res = await request.post('/api/v1/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) throw new Error(`دخول المدير فشل: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { data: { mustChangePassword: boolean } };

  if (body.data.mustChangePassword && !changedOnce) {
    const change = await request.post('/api/v1/auth/change-password', {
      data: { currentPassword: ADMIN_PASSWORD, newPassword: TEST_PASSWORD },
    });
    if (!change.ok()) throw new Error(`تغيير كلمة المرور فشل: ${change.status()} ${await change.text()}`);
    changedOnce = true;
    // تغيير كلمة المرور يبطل الجلسات — نعيد الدخول بالكلمة الجديدة.
    res = await request.post('/api/v1/auth/login', {
      data: { email: ADMIN_EMAIL, password: TEST_PASSWORD },
    });
    if (!res.ok()) throw new Error(`إعادة الدخول فشلت: ${res.status()} ${await res.text()}`);
  }
}

/** إنشاء مستخدم بدور معيّن وتسجيل الدخول بحسابه (سياق request مستقل). */
export async function loginAs(
  request: APIRequestContext,
  role: string,
): Promise<{ email: string; password: string }> {
  const email = `e2e.${role.toLowerCase()}.${unique()}@example.test`;
  const password = 'E2eUser#12345';
  const created = await request.post('/api/v1/users', { data: { email, fullName: `E2E ${role}`, password, role } });
  if (!created.ok()) throw new Error(`إنشاء مستخدم ${role} فشل: ${created.status()} ${await created.text()}`);

  const login = await request.post('/api/v1/auth/login', { data: { email, password } });
  if (!login.ok()) throw new Error(`دخول ${role} فشل: ${login.status()} ${await login.text()}`);
  return { email, password };
}
