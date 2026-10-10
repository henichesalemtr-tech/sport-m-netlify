# ============================================================
# Dockerfile متعدد المراحل — Next.js 14 (نظام إدارة رياضية)
# يُبنى من جذر المستودع:
#   docker build -f docker/Dockerfile -t sms-app .
#
# ملاحظات:
# - node:20-slim (Debian) وليس Alpine: وحدات أصلية (argon2) + Prisma engines.
# - postgresql-client مُثبَّت في الصورة النهائية لأن خدمة النسخ الاحتياطي
#   تستدعي pg_dump/pg_restore عبر child_process.
# - لا نستخدم output:'standalone' لأنه غير مفعّل في next.config.js الحالي —
#   ننسخ node_modules كاملة (تشمل tsx لتشغيل scripts/worker|seed|backup).
# - هذه الصورة لم تُبنَ/تُختبر في بيئة التوثيق (لا docker هنا) — NOT VERIFIED.
# ============================================================

# ---------- المرحلة 1: الاعتماديات ----------
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ---------- المرحلة 2: البناء ----------
FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# متغيرات بناء عامة فقط — الأسرار تُحقن وقت التشغيل لا وقت البناء
ARG APP_URL=http://localhost:3000
ENV APP_URL=$APP_URL
RUN npx prisma generate && npm run build

# ---------- المرحلة 3: التشغيل ----------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# أدوات PostgreSQL لعمليات النسخ/الاستعادة + openssl لـ Prisma
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

# مستخدم غير جذري
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/postcss.config.js ./postcss.config.js
COPY --from=build /app/tailwind.config.ts ./tailwind.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts

# مجلدات التخزين الخاصة (تُركَّب كـ volumes في docker-compose)
RUN mkdir -p /app/storage/private /app/storage/backups \
  && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/auth/login',{method:'HEAD'}).then(()=>process.exit(0)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start"]
