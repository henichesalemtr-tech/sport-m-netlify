'use client';

/**
 * عميل API موحّد (C). يرسل Idempotency-Key للعمليات التغييرية،
 * ويحلّل شكل الرد { data, meta? } / { error: { code, message, fieldErrors?, requestId } }.
 */

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export interface ApiListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: ApiListMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: QueryParams;
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors;
    this.requestId = body.requestId;
  }
}

const API_BASE = '/api/v1';

function buildUrl(path: string, params?: QueryParams): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  // المسارات النسبية تُوجَّه لـ API v1؛ المسارات الصريحة (/api/...) تبقى كما هي
  const base = normalized.startsWith('/api/') ? normalized : `${API_BASE}${normalized}`;
  if (!params) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/** تنفيذ طلب API. يرمي ApiClientError عند الفشل. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiSuccess<T>> {
  const { method = 'GET', body, params, idempotencyKey, signal, headers } = options;

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  // منع التكرار: مفتاح idempotency للعمليات التغييرية
  if (idempotencyKey && method !== 'GET') finalHeaders['Idempotency-Key'] = idempotencyKey;

  const url = buildUrl(path, params);
  const init = {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    credentials: 'same-origin' as RequestCredentials,
  };

  let res = await fetch(url, init);
  // 503 من القراءة يعني أن الطلب لم يُنفَّذ أصلًا — إعادة محاولة واحدة تعالج استيقاظ
  // قاعدة البيانات Serverless من الخمول بلا أثر جانبي.
  if (res.status === 503 && method === 'GET' && !signal?.aborted) {
    await sleep(retryAfterMs(res.headers.get('retry-after')));
    if (!signal?.aborted) res = await fetch(url, init);
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : null;

  if (!res.ok) {
    const errBody: ApiErrorBody =
      payload && 'error' in payload
        ? (payload.error as ApiErrorBody)
        : { code: 'INTERNAL_ERROR', message: res.statusText };
    throw new ApiClientError(res.status, errBody);
  }

  return (payload ?? { data: null }) as ApiSuccess<T>;
}

function retryAfterMs(headerValue: string | null): number {
  const seconds = Number(headerValue);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 5) * 1000 : 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** تنزيل ملف (تصدير/طباعة) مع احترام أخطاء API. */
export async function apiDownload(path: string, params?: QueryParams): Promise<Blob> {
  const res = await fetch(buildUrl(path, params), { credentials: 'same-origin' });
  if (!res.ok) {
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await res.json() : null;
    const errBody: ApiErrorBody =
      payload && 'error' in payload
        ? (payload.error as ApiErrorBody)
        : { code: 'INTERNAL_ERROR', message: res.statusText };
    throw new ApiClientError(res.status, errBody);
  }
  return res.blob();
}

/** توليد مفتاح idempotency عشوائي للعميل. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------- مساعدات مختصرة (تستهلكها الشاشات) ----------

/** رفع multipart/form-data (وثائق/استيراد) — لا يضبط Content-Type يدويًا. */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  opts: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<ApiSuccess<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = opts.idempotencyKey ?? newIdempotencyKey();
  headers['Idempotency-Key'] = key;
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers,
    body: form,
    signal: opts.signal,
    credentials: 'same-origin',
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : null;
  if (!res.ok) {
    const errBody: ApiErrorBody =
      payload && 'error' in payload
        ? (payload.error as ApiErrorBody)
        : { code: 'INTERNAL_ERROR', message: res.statusText };
    throw new ApiClientError(res.status, errBody);
  }
  return (payload ?? { data: null }) as ApiSuccess<T>;
}

// ---------- اختصارات مريحة فوق apiRequest (تُستخدم في الشاشات) ----------

export interface MutateOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function apiGet<T>(
  path: string,
  params?: QueryParams,
  options: Pick<MutateOptions, 'signal'> = {},
): Promise<ApiSuccess<T>> {
  return apiRequest<T>(path, { method: 'GET', params, signal: options.signal });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options: MutateOptions = {},
): Promise<ApiSuccess<T>> {
  return apiRequest<T>(path, {
    method: 'POST',
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  options: MutateOptions = {},
): Promise<ApiSuccess<T>> {
  return apiRequest<T>(path, {
    method: 'PUT',
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  options: MutateOptions = {},
): Promise<ApiSuccess<T>> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

export async function apiDelete<T>(
  path: string,
  body?: unknown,
  options: MutateOptions = {},
): Promise<ApiSuccess<T>> {
  return apiRequest<T>(path, {
    method: 'DELETE',
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/** تنزيل ملف وحفظه في المتصفح (تصدير/طباعة) — يبني الاسم من المسار عند عدم تحديده. */
export async function downloadFile(path: string, params?: QueryParams, filename?: string): Promise<void> {
  const blob = await apiDownload(path, params);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `${path.split('/').filter(Boolean).pop() ?? 'download'}-${Date.now()}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
