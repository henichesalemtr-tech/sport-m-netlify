/**
 * ⚠️ UNVERIFIED — لم يُشغَّل (لا متصفح/بناء في بيئة العمل).
 * يتطلب: تطبيق يعمل (npm run dev) + قاعدة مزروعة (npm run seed) + SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD.
 *
 * دورة مالية عبر الـ API (بدون واجهة): فتح خزينة → مصروف → تقرير مصروفات → تصدير CSV → قائمة إغلاقات.
 * كل العقد مستمد من المسارات/المخططات الفعلية:
 *   POST /cash/opening   body: { amount: moneyString, txDate: YYYY-MM-DD }   perm cash.adjust
 *   POST /expense-categories body: { name }                                  perm expenses.create
 *   POST /expenses        body: { amount, categoryId, expenseDate }          perm expenses.create
 *   GET  /reports/expenses → { data: rows[], meta:{ columns,total,...} }      perm reports.view(+view_finance)
 *   GET  /reports/expenses/export?format=csv                                  perm reports.export(+view_finance)
 *   GET  /cash/closings → paginated                                           perm cash.view
 */
import { test, expect } from '@playwright/test';
import { adminSession } from './helpers';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const AMOUNT = /^\d+(\.\d{1,2})?$/;

test.describe('Finance cycle (API)', () => {
  test.describe.configure({ mode: 'serial' });

  test('فتح خزينة → تسجيل مصروف → تقرير → تصدير CSV', async ({ request }) => {
    await adminSession(request);

    // 1) فتح رصيد الخزينة
    const opening = await request.post('/api/v1/cash/opening', {
      data: { amount: '500.00', txDate: today(), reason: 'افتتاح E2E' },
    });
    expect(opening.ok()).toBeTruthy();
    const openingBody = await opening.json();
    expect(openingBody.data).toBeTruthy();

    // 2) فئة مصروف جديدة
    const category = await request.post('/api/v1/expense-categories', {
      data: { name: `فئة E2E ${Date.now()}` },
    });
    expect(category.ok()).toBeTruthy();
    const categoryId = (await category.json()).data.id as string;
    expect(categoryId).toBeTruthy();

    // 3) مصروف (مبلغ كنص عشري — ممنوع float)
    const expense = await request.post('/api/v1/expenses', {
      data: { amount: '25.50', categoryId, expenseDate: today(), description: 'مصروف E2E' },
    });
    expect(expense.ok()).toBeTruthy();
    const expenseBody = await expense.json();
    expect(String(expenseBody.data.amount ?? '')).toMatch(AMOUNT);

    // 4) تقرير المصروفات
    const report = await request.get('/api/v1/reports/expenses', { params: { pageSize: '50' } });
    expect(report.ok()).toBeTruthy();
    const reportBody = await report.json();
    expect(Array.isArray(reportBody.data)).toBeTruthy();
    expect(reportBody.meta).toBeTruthy();
    expect(Array.isArray(reportBody.meta.columns)).toBeTruthy();

    // 5) تصدير CSV
    const csv = await request.get('/api/v1/reports/expenses/export', { params: { format: 'csv' } });
    expect(csv.ok()).toBeTruthy();
    expect(csv.headers()['content-type'] ?? '').toContain('csv');

    // 6) قائمة الإغلاقات (نقطة نهاية للقراءة فقط)
    const closings = await request.get('/api/v1/cash/closings', { params: { pageSize: '10' } });
    expect(closings.ok()).toBeTruthy();
  });
});
