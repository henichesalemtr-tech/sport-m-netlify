/**
 * E2E لوارد الاستيراد (UI حقيقي): رفع ← ربط أعمدة ← معاينة ← اعتماد ← تنزيل ملف الأخطاء.
 * الملف الاختباري صفّان مرفوضان (تاريخ بصيغة خاطئة + نشاط غير مسجّل)، فلا تُنشأ أي
 * رياضيين — يبقى أثر الاختبار على سجلّات العمليات فقط.
 */
import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { ADMIN_EMAIL, adminSession } from './helpers';

const FIXTURE = resolve(__dirname, 'fixtures', 'import-invalid.csv');

/** دخول حقيقي من الواجهة بعد ضبط الحساب عبر الـ API (adminSession تُرجع الكلمة الصالحة). */
async function loginInBrowser(page: Page, request: Parameters<typeof adminSession>[0]): Promise<void> {
  const password = await adminSession(request);
  await page.goto('/ar/login');
  await page.getByLabel(/البريد|email/i).first().fill(ADMIN_EMAIL);
  await page.getByLabel(/كلمة المرور|password/i).first().fill(password);
  await page.getByRole('button', { name: /تسجيل الدخول|sign in|connexion/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

test.describe('Import wizard UI', () => {
  test('معالج الاستيراد يمرّ الأربع خطوات ويرفض الصفوف الفاسدة دون إنشاء رياضيين', async ({ page, request }) => {
    test.setTimeout(180_000);
    await loginInBrowser(page, request);

    await page.goto('/ar/imports');
    await expect(page.getByRole('heading', { name: /استيراد الرياضيين/ })).toBeVisible();

    // 1) الرفع
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await page.getByRole('button', { name: /بدء الاستيراد/ }).click();

    // 2) ربط الأعمدة (اقتراح تلقائي من ترويسات الملف)
    await expect(page.getByText('2) ربط الأعمدة')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /حفظ الربط ومعاينة الصفوف/ }).click();

    // 3) المعاينة: صفّان إجمالي، صفر صالح، صفر مكرر
    // الملخّصات تحمل <b> للرقم، فترويسة الجدول (نفس التسمية بلا رقم) لا تدخل التضييق
    const stat = (label: string) => page.locator('span:has(b)', { hasText: new RegExp(`^${label}`) });
    await expect(page.getByText('3) المعاينة والتحقق')).toBeVisible({ timeout: 60_000 });
    await expect(stat('إجمالي الصفوف')).toContainText('2');
    await expect(stat('غير صالحة')).toContainText('2');
    await expect(stat('صالحة')).toContainText('0');
    await expect(stat('مكررة')).toContainText('0');
    // على المقاسات الصغيرة يبدّل DataTable بين الجدول والبطاقات — نطلب نسخة مرئية واحدة
    const reason = (text: RegExp) => page.getByText(text).filter({ visible: true }).first();
    await expect(reason(/نشاط غير موجود/)).toBeVisible();
    await expect(reason(/YYYY-MM-DD/)).toBeVisible();

    // 4) الاعتماد: لا شيء يُستورد، والنتيجة تعرض الصفوف الفاشلة
    await page.getByRole('button', { name: /تأكيد الاستيراد/ }).click();
    await expect(page.getByText('النتيجة', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(stat('فاشلة')).toContainText('2');
    await expect(stat('ناجحة')).toContainText('0');

    // التنزيل: ملف أخطاء CSV بكل أسباب الرفض
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: /تنزيل ملف الأخطاء/ }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const csvText = path ? readFileSync(path, 'utf8') : '';
    expect(csvText).toContain('نشاط غير موجود');
    expect(csvText).toContain('birthDate');

    // لا رياضيين جدد: الصفّان مرفوضان، فاسماهما لا يظهران في قائمة الرياضيين
    const list = await request.get('/api/v1/athletes', { params: { q: 'القاسمي', pageSize: 50 } });
    expect(list.status()).toBe(200);
    const items = (await list.json()).data as Array<{ firstName: string; lastName: string }>;
    expect(items.some((a) => a.firstName === 'نور' && a.lastName === 'القاسمي')).toBe(false);
  });
});
