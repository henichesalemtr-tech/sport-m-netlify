/**
 * أخطاء التطبيق الموحدة (4.3). كل خطأ له رمز ثابت يُترجم لرسالة عربية في i18n.
 */
export const ErrorCode = {
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  SESSION_CONFLICT: 'SESSION_CONFLICT',
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  OVERPAYMENT: 'OVERPAYMENT_NOT_ALLOWED',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  IDEMPOTENCY_REPLAY: 'IDEMPOTENCY_REPLAY',
  RATE_LIMITED: 'RATE_LIMITED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE_TYPE',
  IMMUTABLE_RECORD: 'IMMUTABLE_RECORD',
  LAST_SUPER_ADMIN: 'LAST_SUPER_ADMIN',
  BUSINESS_RULE: 'BUSINESS_RULE_VIOLATION',
  INTERNAL: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_BY_CODE: Record<string, number> = {
  [ErrorCode.VALIDATION]: 400,
  [ErrorCode.INVALID_AMOUNT]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.ACCOUNT_LOCKED]: 423,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.INSUFFICIENT_PERMISSION]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.VERSION_CONFLICT]: 409,
  [ErrorCode.CAPACITY_EXCEEDED]: 409,
  [ErrorCode.SESSION_CONFLICT]: 409,
  [ErrorCode.OVERPAYMENT]: 409,
  [ErrorCode.DUPLICATE_RECORD]: 409,
  [ErrorCode.IDEMPOTENCY_REPLAY]: 200,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.UNSUPPORTED_FILE]: 415,
  [ErrorCode.IMMUTABLE_RECORD]: 409,
  [ErrorCode.LAST_SUPER_ADMIN]: 409,
  [ErrorCode.BUSINESS_RULE]: 422,
  [ErrorCode.INTERNAL]: 500,
};

export class AppError extends Error {
  readonly code: ErrorCodeType;
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;
  readonly details?: unknown;

  constructor(
    code: ErrorCodeType,
    message?: string,
    options?: { fieldErrors?: Record<string, string[]>; details?: unknown; status?: number },
  ) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code] ?? 500;
    this.fieldErrors = options?.fieldErrors;
    this.details = options?.details;
  }
}

export const notFound = (entity: string) =>
  new AppError(ErrorCode.NOT_FOUND, `${entity} غير موجود`);
export const forbidden = (msg = 'ليس لديك صلاحية لهذه العملية') =>
  new AppError(ErrorCode.FORBIDDEN, msg);
export const conflict = (msg: string, details?: unknown) =>
  new AppError(ErrorCode.CONFLICT, msg, { details });
export const businessRule = (msg: string, details?: unknown) =>
  new AppError(ErrorCode.BUSINESS_RULE, msg, { details });
export const validationError = (fieldErrors: Record<string, string[]>) =>
  new AppError(ErrorCode.VALIDATION, 'بيانات غير صالحة', { fieldErrors });

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
