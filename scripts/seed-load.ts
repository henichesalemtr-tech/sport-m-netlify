/**
 * Seed تحميل (Load Seed) لاختبارات الأداء — للتطوير/الاختبار فقط.
 * ⛔ يرفض العمل عندما NODE_ENV=production.
 *
 * الأحجام الافتراضية (تُضبط بمتغيرات بيئة):
 *   LOAD_ATHLETES=5000   LOAD_GROUPS=100   LOAD_PAYMENTS=50000   LOAD_ATTENDANCE=500000
 *
 * يستخدم إدراجًا جماعيًا (createMany) عبر Prisma مباشرة — وليس طبقة الخدمات —
 * لأن الهدف حجم بيانات ضخم بسرعة لقياس الأداء (انظر docs/PERFORMANCE.md).
 * البيانات تُعرَّف بأرقام تسجيل ورموز بادئتها LOAD- لسهولة التنظيف:
 *   التنظيف: احذف الصفوف التي تبدأ بـ LOAD- أو أعد إنشاء قاعدة التطوير.
 *
 * خطة التوليد (حتمية Deterministic):
 *  - نشاط واحد + LOAD_GROUPS مجموعة (50 رياضيًا/مجموعة).
 *  - لكل رياضي اشتراك واحد (2000.00 DZD = 200000n بأصغر وحدة).
 *  - LOAD_PAYMENTS دفعة موزعة على الاشتراكات (10 دفعات × 200.00 لكل اشتراك
 *    عند الأحجام الافتراضية) مع paidAmount محدَّث مسبقًا ومتسق.
 *  - 100 حصة لكل مجموعة (يوم واحد لكل حصة — لا تعارض زمنيًا)،
 *    وLOAD_ATTENDANCE سجل حضور = رياضي × حصة ضمن مجموعته.
 *
 * التشغيل: npm run seed:load
 * لم يُشغَّل هذا السكربت في بيئة التوثيق (لا يتوفر node/npm/postgres هنا).
 */
import './load-env';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed-load] مرفوض: NODE_ENV=production. هذا السكربت للتطوير/الاختبار فقط.');
  process.exit(1);
}

import { randomUUID } from 'node:crypto';
import { prisma } from '@/shared/db/client';

const ATHLETES = Number(process.env.LOAD_ATHLETES ?? 5000);
const GROUPS = Number(process.env.LOAD_GROUPS ?? 100);
const PAYMENTS = Number(process.env.LOAD_PAYMENTS ?? 50000);
const ATTENDANCE = Number(process.env.LOAD_ATTENDANCE ?? 500000);
const ATHLETE_CHUNK = 1000;
const PAYMENT_CHUNK = 2000;
const ATTENDANCE_CHUNK = 5000;
const SESSIONS_PER_GROUP = Math.ceil(ATTENDANCE / Math.max(1, ATHLETES)); // ~100

/** مبلغ بأصغر وحدة (DZD بخانتين): 2000.00 → 200000n */
const SUB_PRICE = 200000n;
const INSTALLMENT = 20000n; // 200.00

function day(offsetDays: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function timeStr(offsetDays: number): string {
  return day(offsetDays).toISOString().slice(0, 10);
}

async function chunkedInsert<T>(
  label: string,
  rows: T[],
  size: number,
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  const start = Date.now();
  let done = 0;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    await insert(batch);
    done += batch.length;
    if (done % (size * 10) === 0 || done === rows.length) {
      console.log(`[seed-load] ${label}: ${done}/${rows.length} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    }
  }
}

async function main(): Promise<void> {
  console.log(
    `[seed-load] الأهداف: athletes=${ATHLETES} groups=${GROUPS} payments=${PAYMENTS} attendance=${ATTENDANCE}`,
  );
  const t0 = Date.now();

  // ---------- أساسيات ----------
  const sport = await prisma.sport.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'LOAD-نشاط الأداء',
      color: '#64748b',
    },
  });
  const subType = await prisma.subscriptionType.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'LOAD-شهري',
      kind: 'MONTHLY',
      sportId: sport.id,
      defaultPrice: SUB_PRICE,
      durationDays: 30,
    },
  });
  const method = await prisma.paymentMethod.upsert({
    where: { name: 'LOAD-نقدًا' },
    update: {},
    create: { name: 'LOAD-نقدًا', sortOrder: 90 },
  });

  // ---------- المجموعات ----------
  const groupIds: string[] = [];
  const groupRows = [];
  for (let g = 0; g < GROUPS; g++) {
    const id = randomUUID();
    groupIds.push(id);
    groupRows.push({
      id,
      name: `LOAD-مجموعة ${g + 1}`,
      code: `LOAD-GRP-${String(g + 1).padStart(4, '0')}`,
      sportId: sport.id,
      maxCapacity: 60,
      status: 'ACTIVE' as const,
    });
  }
  await chunkedInsert('groups', groupRows, 100, (b) =>
    prisma.group.createMany({ data: b, skipDuplicates: true }),
  );

  // ---------- الرياضيون ----------
  const athleteRows = [];
  const athleteIds: string[] = [];
  for (let a = 0; a < ATHLETES; a++) {
    const id = randomUUID();
    athleteIds.push(id);
    athleteRows.push({
      id,
      registrationNo: `LOAD-${String(a + 1).padStart(6, '0')}`,
      firstName: `رياضي${a + 1}`,
      lastName: `اختبار${(a % 50) + 1}`,
      gender: (a % 2 === 0 ? 'MALE' : 'FEMALE') as 'MALE' | 'FEMALE',
      birthDate: day(-(365 * (10 + (a % 20)) + (a % 300))),
      sportId: sport.id,
      registrationDate: day(-(a % 365)),
      status: 'ACTIVE' as const,
    });
  }
  await chunkedInsert('athletes', athleteRows, ATHLETE_CHUNK, (b) =>
    prisma.athlete.createMany({ data: b, skipDuplicates: true }),
  );

  // ---------- العضويات ----------
  const perGroup = Math.ceil(ATHLETES / GROUPS);
  const memberRows = [];
  for (let a = 0; a < ATHLETES; a++) {
    const g = Math.floor(a / perGroup);
    memberRows.push({
      id: randomUUID(),
      groupId: groupIds[Math.min(g, GROUPS - 1)]!,
      athleteId: athleteIds[a]!,
      joinedAt: day(-(a % 200)),
    });
  }
  await chunkedInsert('group_members', memberRows, ATHLETE_CHUNK, (b) =>
    prisma.groupMember.createMany({ data: b, skipDuplicates: true }),
  );

  // ---------- الاشتراكات ----------
  const paymentsPerSub = Math.max(1, Math.floor(PAYMENTS / ATHLETES));
  const subscriptionRows = [];
  for (let a = 0; a < ATHLETES; a++) {
    const paid = BigInt(Math.min(paymentsPerSub, 10)) * INSTALLMENT;
    subscriptionRows.push({
      id: randomUUID(),
      athleteId: athleteIds[a]!,
      sportId: sport.id,
      groupId: memberRows[a]!.groupId,
      subscriptionTypeId: subType.id,
      startDate: day(-20),
      endDate: day(10),
      price: SUB_PRICE,
      netAmount: SUB_PRICE,
      paidAmount: paid,
      dueDate: day(10),
      status: 'ACTIVE' as const,
    });
  }
  await chunkedInsert('subscriptions', subscriptionRows, PAYMENT_CHUNK, (b) =>
    prisma.subscription.createMany({ data: b, skipDuplicates: true }),
  );

  // ---------- الدفعات ----------
  const paymentRows = [];
  let p = 0;
  outer: for (let a = 0; a < ATHLETES; a++) {
    for (let k = 0; k < paymentsPerSub; k++) {
      if (p >= PAYMENTS) break outer;
      paymentRows.push({
        id: randomUUID(),
        transactionNo: `LOAD-TX-${String(p + 1).padStart(8, '0')}`,
        athleteId: athleteIds[a]!,
        subscriptionId: subscriptionRows[a]!.id,
        amount: INSTALLMENT,
        discount: 0n,
        netAmount: INSTALLMENT,
        paymentMethodId: method.id,
        paymentDate: day(-(paymentsPerSub - k)),
        status: 'COMPLETED' as const,
      });
      p++;
    }
  }
  await chunkedInsert('payments', paymentRows, PAYMENT_CHUNK, (b) =>
    prisma.payment.createMany({ data: b, skipDuplicates: true }),
  );
  console.log(`[seed-load] دفعات مولّدة فعليًا: ${paymentRows.length}`);

  // ---------- الحصص ----------
  // 100 حصة لكل مجموعة: حصة واحدة في اليوم (لا تداخل زمنيًا ⇒ لا كسر لقيد EXCLUDE).
  const sessionRows = [];
  const sessionsByGroup: string[][] = [];
  for (let g = 0; g < GROUPS; g++) {
    const ids: string[] = [];
    for (let s = 0; s < SESSIONS_PER_GROUP; s++) {
      const id = randomUUID();
      ids.push(id);
      const date = day(-(SESSIONS_PER_GROUP - s) + 10);
      sessionRows.push({
        id,
        type: 'TRAINING' as const,
        title: `LOAD-حصة ${g + 1}/${s + 1}`,
        sportId: sport.id,
        groupId: groupIds[g]!,
        venueId: null,
        coachId: null,
        sessionDate: date,
        startTime: new Date(date.getTime() + 17 * 3600_000),
        endTime: new Date(date.getTime() + 18.5 * 3600_000),
        status: 'COMPLETED' as const,
      });
    }
    sessionsByGroup.push(ids);
  }
  await chunkedInsert('training_sessions', sessionRows, PAYMENT_CHUNK, (b) =>
    prisma.trainingSession.createMany({ data: b, skipDuplicates: true }),
  );

  // ---------- الحضور ----------
  // رياضي × حصة ضمن مجموعته ⇒ (athleteId, sessionId) فريد طبيعيًا.
  const totalTarget = Math.min(ATTENDANCE, ATHLETES * SESSIONS_PER_GROUP);
  const start = Date.now();
  let done = 0;
  let a = 0;
  while (done < totalTarget) {
    const batch = [];
    while (batch.length < ATTENDANCE_CHUNK && done < totalTarget) {
      const athleteIndex = a % ATHLETES;
      const sessionIndex = Math.floor(a / ATHLETES) % SESSIONS_PER_GROUP;
      const groupId = memberRows[athleteIndex]!.groupId;
      const groupIndex = groupIds.indexOf(groupId);
      const sessionId = sessionsByGroup[groupIndex]![sessionIndex]!;
      const sessionDate = sessionRows[groupIndex! * SESSIONS_PER_GROUP + sessionIndex]!.sessionDate;
      batch.push({
        id: randomUUID(),
        athleteId: athleteIds[athleteIndex]!,
        sessionId,
        groupId,
        status: (athleteIndex % 10 === 9 ? 'ABSENT' : athleteIndex % 7 === 6 ? 'LATE' : 'PRESENT') as
          | 'PRESENT'
          | 'ABSENT'
          | 'LATE',
        method: 'BULK' as const,
        recordDate: sessionDate,
        recordedAt: sessionDate,
        minutesLate: athleteIndex % 7 === 6 ? 12 : 0,
        consumedSession: false,
      });
      a++;
      done++;
    }
    await prisma.attendanceRecord.createMany({ data: batch, skipDuplicates: true });
    if (done % (ATTENDANCE_CHUNK * 20) === 0 || done === totalTarget) {
      console.log(`[seed-load] attendance: ${done}/${totalTarget} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    }
  }

  console.log(
    `[seed-load] اكتمل في ${((Date.now() - t0) / 1000).toFixed(1)}s — ` +
      'شغّل ANALYZE لتحديث إحصاءات المخطط: psql "$DATABASE_URL" -c "ANALYZE;"',
  );
  void timeStr;
}

main()
  .catch((e) => {
    console.error('[seed-load] فشل:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
