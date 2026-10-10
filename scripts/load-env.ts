/**
 * تحميل متغيرات البيئة من ملف .env للسكربتات المستقلة (tsx).
 *
 * لماذا؟ Next.js يحمّل .env تلقائيًا، لكن سكربتات tsx المستقلة
 * (seed/backup/restore/worker) تعمل خارج Next.js ولا تقرأ .env.
 * لا نستخدم حزمة dotenv (غير موجودة في الاعتماديات) — محلّل بسيط يكفي.
 *
 * القاعدة: متغيرات البيئة الفعلية (process.env) لها الأولوية دائمًا
 * ولا يُستبدل أي متغير موجود مسبقًا.
 *
 * يُستورد كأثر جانبي في أول سطر من كل سكربت:
 *   import './load-env';
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // إزالة علامات الاقتباس المحيطة
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadDotEnv();
