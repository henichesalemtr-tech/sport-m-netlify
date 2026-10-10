/**
 * أنواع DTO للواجهة — تعكس أشكال الاستجابات الفعلية من الخدمات (4.3).
 * ملاحظات:
 * - المال يصل كنص بأصغر وحدة (BigInt في JSON) — نسقه عبر `@/shared/lib/format`.
 * - التواريخ ISO strings بعد JSON serialization.
 * - ممنوع `any` — كل حقل محدد.
 */

// ---------- قوائم مشتركة ----------

export type UserRoleName =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'RECEPTION'
  | 'COACH'
  | 'ACCOUNTANT'
  | 'VIEWER';

export type UserStatusName = 'ACTIVE' | 'DISABLED';

export type AthleteStatusName = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'WITHDRAWN' | 'BLOCKED';
export type GenderName = 'MALE' | 'FEMALE';
export type GroupStatusName = 'ACTIVE' | 'INACTIVE';
export type VenueTypeName = 'HALL' | 'FIELD' | 'COURT' | 'POOL' | 'GYM' | 'OTHER';
export type VenueStatusName = 'AVAILABLE' | 'MAINTENANCE' | 'CLOSED';
export type SessionTypeName = 'TRAINING' | 'MATCH' | 'TOURNAMENT' | 'EXAM' | 'ACTIVITY' | 'MEETING';
export type SessionStatusName = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
export type AttendanceStatusName = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
export type SubscriptionStatusName = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'RENEWING' | 'CANCELLED';
export type SubscriptionKindName =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUAL'
  | 'ANNUAL'
  | 'SESSIONS'
  | 'CUSTOM';
export type DiscountKindName = 'FIXED' | 'PERCENT';
export type PaymentStatusName = 'COMPLETED' | 'VOIDED';
export type ExpenseStatusName = 'ACTIVE' | 'VOIDED';
export type CashTxTypeName = 'OPENING_BALANCE' | 'INCOME' | 'EXPENSE' | 'ADJUSTMENT' | 'REVERSAL';
export type DocumentStatusName = 'ACTIVE' | 'EXPIRED' | 'DELETED';
export type NotificationTypeName =
  | 'SUBSCRIPTION_EXPIRING'
  | 'SUBSCRIPTION_EXPIRED'
  | 'ABSENCE'
  | 'CONSECUTIVE_ABSENCE'
  | 'REPEATED_LATE'
  | 'NEW_PAYMENT'
  | 'OVERDUE_DEBT'
  | 'UPCOMING_SESSION'
  | 'SESSION_RESCHEDULED'
  | 'SESSION_CANCELLED'
  | 'DOCUMENT_EXPIRING';
export type TrainingDayName = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type ReportTypeName =
  | 'athletes'
  | 'subscriptions'
  | 'payments'
  | 'debts'
  | 'attendance'
  | 'absence'
  | 'late'
  | 'coaches'
  | 'sports'
  | 'groups'
  | 'revenues'
  | 'expenses'
  | 'cash';

// ---------- الإعدادات ----------

/** AppSettings كما يعيدها settingsService.getSettings() (يُمرَّر من الخادم للسياق). */
export interface AppSettingsClient {
  orgName: string;
  currencyCode: string;
  currencyDecimals: number;
  timezone: string;
  fiscalStartMonth: number;
  numberSystem: string;
  attendanceLateMinutes: number;
  consecutiveAbsenceAlert: number;
  subscriptionExpiringDays: number;
  allowOverpay: boolean;
  receiptTemplate: string;
  scanDedupSeconds: number;
  athletesRegistrationFormat: string;
  totpEnabled: boolean;
}

export type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

export interface SettingDto {
  key: string;
  value: string | number | boolean | Record<string, unknown> | unknown[];
  rawValue: string;
  valueType: SettingValueType;
  group: string;
  description: string | null;
  updatedAt: string | null;
}

// ---------- الجلسة والمستخدمون ----------

export interface SessionUser {
  userId: string;
  email: string;
  fullName: string;
  role: UserRoleName;
  linkedCoachId: string | null;
}

export interface SessionPayload {
  user: SessionUser;
  /** رموز الصلاحيات الفعلية للمستخدم (تُحل في الخادم — 5.4). */
  permissions: string[];
  settings: AppSettingsClient;
}

export interface UserDto {
  id: string;
  email: string;
  username: string | null;
  fullName: string;
  role: UserRoleName;
  status: UserStatusName;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  linkedCoachId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ---------- الأدوار والصلاحيات ----------

export interface PermissionDto {
  id: string;
  code: string;
  module: string;
  description: string | null;
}

export interface RoleDto {
  role: UserRoleName;
  permissions: string[];
  isSystem: boolean;
}

export interface RolesPayload {
  roles: RoleDto[];
  permissions: PermissionDto[];
}

// ---------- الرياضيون ----------

export interface SportRef {
  id: string;
  name: string;
  color: string | null;
}

export interface AgeCategoryRef {
  id: string;
  name: string;
  kind: 'NORMAL' | 'SENIOR';
  minAge: number | null;
  maxAge: number | null;
}

export interface AthleteParentRef {
  id: string;
  relationship: string | null;
  isPrimary: boolean;
  isPayer: boolean;
  isEmergency: boolean;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    phone2: string | null;
  };
}

export interface AthleteDto {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  gender: GenderName;
  birthDate: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  sportId: string | null;
  sport: SportRef | null;
  ageCategoryId: string | null;
  ageCategory: AgeCategoryRef | null;
  registrationDate: string;
  status: AthleteStatusName;
  notes: string | null;
  additionalInfo: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  imageConsent: boolean;
  scanCodeVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  parents: AthleteParentRef[];
  /** حقول حساسة — تظهر فقط لحامل athletes.view_sensitive. */
  medicalNotes?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
}

export interface AthleteDuplicateMatch {
  athleteId: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string | null;
  reasons: string[];
  score: number;
}

// ---------- الملف الشخصي ----------

export interface ProfileSubscription {
  id: string;
  status: SubscriptionStatusName;
  startDate: string;
  endDate: string;
  dueDate: string;
  typeName: string;
  typeKind: SubscriptionKindName;
  groupName: string | null;
  price: string;
  netAmount: string;
  paidAmount: string;
  remainingAmount: string;
  sessionsTotal: number | null;
  sessionsUsed: number;
}

export interface ProfilePayment {
  id: string;
  transactionNo: string;
  amount: string;
  netAmount: string;
  refundedAmount: string;
  paymentDate: string;
  method: string;
  status: PaymentStatusName;
  subscriptionId: string;
}

export interface ProfileGroup {
  id: string;
  name: string;
  code: string;
  sportName: string;
  coachName: string | null;
  joinedAt: string;
  leftAt: string | null;
  isActive: boolean;
}

export interface ProfileEvaluation {
  id: string;
  templateName: string;
  coachName: string;
  evaluationDate: string;
  scores: Record<string, number> | unknown;
  notes: string | null;
}

export interface ProfileDocument {
  id: string;
  typeName: string;
  originalName: string;
  expiryDate: string | null;
  status: DocumentStatusName;
  createdAt: string;
}

export interface ProfileTimelineEvent {
  id: string;
  action: string;
  userId: string | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AthleteProfile {
  athlete: AthleteDto;
  subscriptions: ProfileSubscription[];
  payments: ProfilePayment[];
  finances: { totalNet: string; totalPaid: string; totalDue: string };
  attendance: {
    PRESENT: number;
    ABSENT: number;
    LATE: number;
    EXCUSED: number;
    total: number;
    ratePercent: number | null;
  };
  groups: ProfileGroup[];
  evaluations: ProfileEvaluation[];
  documents: ProfileDocument[];
  timeline: ProfileTimelineEvent[];
}

// ---------- الأولياء ----------

export interface ParentAthleteRef {
  id: string;
  relationship: string | null;
  isPrimary: boolean;
  isPayer: boolean;
  isEmergency: boolean;
  athlete: { id: string; registrationNo: string; firstName: string; lastName: string };
}

export interface ParentDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  address: string | null;
  relationship: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  athleteParents?: ParentAthleteRef[];
}

// ---------- الأنشطة والفئات والأماكن ----------

export interface SportDto {
  id: string;
  name: string;
  nameEn: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgeCategoryDto {
  id: string;
  name: string;
  kind: 'NORMAL' | 'SENIOR';
  minAge: number | null;
  maxAge: number | null;
  seasonStartMonth: number;
  sortOrder: number;
  isActive: boolean;
  version: number;
}

export interface VenueDto {
  id: string;
  name: string;
  type: VenueTypeName;
  capacity: number | null;
  status: VenueStatusName;
  location: string | null;
  notes: string | null;
  version: number;
}

export interface CoachDto {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
  specialization: string | null;
  certificate: string | null;
  joinedAt: string | null;
  isActive: boolean;
  notes: string | null;
  version: number;
  coachSports?: Array<{ id: string; sportId: string; sport?: SportRef }>;
}

// ---------- المجموعات ----------

export interface GroupDto {
  id: string;
  name: string;
  code: string;
  sportId: string;
  sport?: SportRef;
  ageCategoryId: string | null;
  ageCategory?: AgeCategoryRef | null;
  coachId: string | null;
  coach?: { id: string; firstName: string; lastName: string } | null;
  venueId: string | null;
  venue?: { id: string; name: string } | null;
  maxCapacity: number;
  trainingDays: string | null;
  startTime: string | null;
  endTime: string | null;
  status: GroupStatusName;
  notes: string | null;
  version: number;
  _count?: { members?: number };
  membersCount?: number;
}

export interface GroupMemberDto {
  id: string;
  athleteId: string;
  joinedAt: string;
  leftAt: string | null;
  leaveReason: string | null;
  athlete: {
    id: string;
    registrationNo: string;
    firstName: string;
    lastName: string;
    status: AthleteStatusName;
    photoUrl?: string | null;
  };
}

// ---------- الحصص ----------

export interface SessionDto {
  id: string;
  type: SessionTypeName;
  title: string;
  sportId: string | null;
  sport?: SportRef | null;
  groupId: string | null;
  group?: { id: string; name: string; code: string } | null;
  coachId: string | null;
  coach?: { id: string; firstName: string; lastName: string } | null;
  venueId: string | null;
  venue?: { id: string; name: string } | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  description: string | null;
  status: SessionStatusName;
  seriesId: string | null;
  isException: boolean;
  version: number;
}

// ---------- الحضور ----------

export interface AttendanceRecordDto {
  id: string;
  athleteId: string;
  sessionId: string;
  groupId: string;
  status: AttendanceStatusName;
  method: string;
  recordDate: string;
  recordedAt: string;
  minutesLate: number;
  notes: string | null;
  athlete?: { id: string; registrationNo: string; firstName: string; lastName: string };
}

export interface AttendanceSheetRow {
  id: string | null;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  sessionId: string | null;
  status: AttendanceStatusName | null;
  minutesLate: number;
}

export interface BulkAttendanceResult {
  created: number;
  updated: number;
  skipped: number;
}

// ---------- الاشتراكات ----------

export interface SubscriptionTypeDto {
  id: string;
  name: string;
  kind: SubscriptionKindName;
  sportId: string | null;
  sport?: SportRef | null;
  defaultPrice: string;
  durationDays: number | null;
  sessionsTotal: number | null;
  allowPriceEdit: boolean;
  isActive: boolean;
  version: number;
}

export interface SubscriptionDto {
  id: string;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  sportId: string | null;
  groupId: string | null;
  groupName: string | null;
  subscriptionTypeId: string;
  subscriptionTypeName: string;
  subscriptionTypeKind: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  price: string;
  discountKind: DiscountKindName | null;
  discountValue: string | null;
  discountReason: string | null;
  discountAmount: string;
  netAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: SubscriptionStatusName;
  effectivelyExpired: boolean;
  sessionsTotal: number | null;
  sessionsUsed: number;
  suspendStart: string | null;
  suspendEnd: string | null;
  suspendReason: string | null;
  cancelReason: string | null;
  renewedFromId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ---------- المدفوعات ----------

export interface PaymentMethodDto {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface PaymentDto {
  id: string;
  transactionNo: string;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  subscriptionId: string;
  subscriptionTypeName: string;
  subscriptionNetAmount: string;
  subscriptionRemaining: string;
  amount: string;
  discount: string;
  netAmount: string;
  refundedAmount: string;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentDate: string;
  status: PaymentStatusName;
  voidReason: string | null;
  voidedAt: string | null;
  employeeId: string | null;
  notes: string | null;
  receiptId: string | null;
  receiptNo: string | null;
  createdAt: string;
}

export interface PaymentCreateResult {
  payment: PaymentDto;
  receiptNo: string;
  remainingAfter: string;
  replayed: boolean;
}

export interface ReceiptViewDto {
  id: string;
  receiptNo: string;
  fiscalYear: number;
  sequence: number;
  status: PaymentStatusName;
  isVoid: boolean;
  isCopy: boolean;
  reprintCount: number;
  lastReprintAt: string | null;
  template: string;
  org: { name: string; address: string | null; phone: string | null; logoUrl: string | null };
  transactionNo: string | null;
  athleteName: string | null;
  registrationNo: string | null;
  subscription: {
    id: string;
    typeName: string;
    startDate: string;
    endDate: string;
  } | null;
  amount: string | null;
  discount: string | null;
  netAmount: string | null;
  methodName: string | null;
  paymentDate: string | null;
  employeeName: string | null;
  createdAt: string;
}

// ---------- المصاريف والخزينة ----------

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ExpenseDto {
  id: string;
  amount: string;
  categoryId: string;
  category: { id: string; name: string };
  expenseDate: string;
  description: string | null;
  beneficiary: string | null;
  employeeId: string | null;
  status: ExpenseStatusName;
  voidReason: string | null;
  attachments: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CashTransactionDto {
  id: string;
  type: CashTxTypeName;
  amount: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  txDate: string;
  createdBy: string | null;
  createdAt: string;
}

export interface CashClosingDto {
  id: string;
  closingDate: string;
  expectedAmount: string;
  countedAmount: string;
  difference: string;
  reason: string | null;
  closedBy: string | null;
  closedAt: string;
}

// ---------- التقارير ----------

export interface ExportColumn {
  key: string;
  label: string;
  type?: string;
}

export type ReportRow = Record<string, string | number | null>;

export interface ReportResult {
  type: ReportTypeName;
  columns: ExportColumn[];
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  summary?: Record<string, string | number | null>;
}

// ---------- التقييمات ----------

export interface EvaluationCriterion {
  key: string;
  label: string;
  min: number;
  max: number;
}

export interface EvaluationTemplateDto {
  id: string;
  name: string;
  sportId: string | null;
  sport?: SportRef | null;
  criteria: EvaluationCriterion[] | string;
  isActive: boolean;
  createdAt: string;
}

export interface EvaluationDto {
  id: string;
  athleteId: string;
  athlete?: { id: string; firstName: string; lastName: string; registrationNo: string };
  templateId: string;
  template?: { id: string; name: string };
  coachId: string;
  coach?: { id: string; firstName: string; lastName: string };
  evaluationDate: string;
  scores: Record<string, number> | string;
  notes: string | null;
  createdAt: string;
}

export interface EvaluationTimeSeries {
  athleteId: string;
  points: Array<{
    evaluationId: string;
    date: string;
    templateId: string;
    templateName: string;
    scores: Record<string, number>;
    total: number;
    average: number;
    coachName: string;
  }>;
}

// ---------- الوثائق ----------

export interface DocumentTypeDto {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface AthleteDocumentDto {
  id: string;
  athleteId: string;
  athlete?: { id: string; firstName: string; lastName: string; registrationNo: string };
  documentTypeId: string;
  documentType: { id: string; name: string };
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiryDate: string | null;
  status: DocumentStatusName;
  createdAt: string;
}

// ---------- الإشعارات ----------

export interface NotificationDto {
  id: string;
  type: NotificationTypeName;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

// ---------- سجل التدقيق والنسخ الاحتياطي ----------

export interface AuditLogDto {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
}

export interface BackupDto {
  id: string;
  fileName: string;
  storageKey: string;
  sizeBytes: string;
  kind: string;
  checksum: string | null;
  createdBy: string | null;
  createdAt: string;
  restoredAt: string | null;
}

// ---------- لوحة المؤشرات ----------

export interface GeneralDashboard {
  athletes: {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    withdrawn: number;
    blocked: number;
  };
  coaches: number | null;
  sports: number | null;
  groups: number;
  subscriptions: { active: number; expiring: number; expired: number };
  finance: {
    collected: number;
    due: number;
    debtors: number;
    expenses: number | null;
    netRevenue: number | null;
  } | null;
  asOf: string;
}

export interface DashboardCharts {
  revenueVsExpenses: Array<{ key: string; revenue: number; expenses: number }> | null;
  attendanceTrend: Array<{
    date: string;
    rate: number | null;
    present: number;
    absent: number;
    late: number;
  }>;
  athletesBySport: Array<{ sport: string; athletes: number }>;
  subscriptionsByStatus: Array<{ status: string; count: number }>;
}

export interface DashboardAttendance {
  today: string;
  counts: { present: number; absent: number; late: number; excused: number; total: number };
  rate: number | null;
  highAbsenceGroups: Array<{ groupId: string; name: string; absences: number }>;
  lastRecords: Array<{
    athleteName: string;
    sessionTitle: string;
    status: AttendanceStatusName;
    recordDate: string;
    recordedAt: string;
  }>;
}

// ---------- المسح ----------

export interface ScanCard {
  duplicate: boolean;
  athlete: {
    id: string;
    registrationNo: string;
    fullName: string;
    photoUrl: string | null;
    status: string;
  };
  groups: Array<{ id: string; name: string; code: string }>;
  subscription: {
    status: string;
    expired: boolean;
    typeName: string;
    typeKind: string;
    endDate: string;
    remainingAmount: string;
    sessionsTotal: number | null;
    sessionsUsed: number;
  } | null;
  payment: { state: 'PAID' | 'PARTIAL' | 'UNPAID'; remaining: string } | null;
  session: { id: string; title: string } | null;
  attendance: AttendanceRecordDto | null;
  warnings: string[];
}

// ---------- الإعداد الأولي ----------

export interface SetupStatus {
  needsSetup: boolean;
}
