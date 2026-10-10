'use client';

/**
 * خطافات API (C): useApi / useList / useMutation
 * - حالات loading/error موحّدة
 * - حماية من الإرسال المزدوج (double-submit) في useMutation
 * - إلغاء الطلبات عند التفكيك (AbortController)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ApiClientError,
  apiRequest,
  type ApiListMeta,
  type QueryParams,
  type RequestOptions,
} from '@/shared/api/client';

// ---------- useApi ----------

export interface UseApiOptions {
  params?: QueryParams;
  /** تعطيل الجلب (مثل انتظار اختيار مرشح إلزامي). */
  enabled?: boolean;
}

export interface UseApiResult<T> {
  data: T | null;
  meta: ApiListMeta | undefined;
  loading: boolean;
  error: ApiClientError | null;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

export function useApi<T>(path: string | null, options: UseApiOptions = {}): UseApiResult<T> {
  const { params, enabled = true } = options;
  const [data, setDataState] = useState<T | null>(null);
  const [meta, setMeta] = useState<ApiListMeta | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(enabled && path !== null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [nonce, setNonce] = useState(0);
  const paramsKey = useMemo(() => JSON.stringify(params ?? {}), [params]);

  useEffect(() => {
    if (!enabled || path === null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiRequest<T>(path, {
      method: 'GET',
      params: JSON.parse(paramsKey) as QueryParams,
      signal: controller.signal,
    })
      .then((result) => {
        if (cancelled) return;
        setDataState(result.data);
        setMeta(result.meta);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(e instanceof ApiClientError ? e : new ApiClientError(0, { code: 'INTERNAL_ERROR', message: String(e) }));
        setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater));
  }, []);

  return { data, meta, loading, error, reload, setData };
}

// ---------- useList ----------

export interface ListState {
  page: number;
  pageSize: number;
  q: string;
  sort: string | undefined;
  filters: QueryParams;
}

export interface UseListResult<T> extends UseApiResult<T[]> {
  list: ListState;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setQ: (q: string) => void;
  setSort: (sort: string | undefined) => void;
  setFilters: (filters: QueryParams) => void;
  resetFilters: () => void;
  totalPages: number;
  total: number;
}

export function useList<T>(
  path: string,
  initial: Partial<Pick<ListState, 'pageSize' | 'sort' | 'filters'>> = {},
): UseListResult<T> {
  const [list, setList] = useState<ListState>({
    page: 1,
    pageSize: initial.pageSize ?? 20,
    q: '',
    sort: initial.sort,
    filters: initial.filters ?? {},
  });

  const params = useMemo<QueryParams>(
    () => ({ page: list.page, pageSize: list.pageSize, q: list.q || undefined, sort: list.sort, ...list.filters }),
    [list],
  );

  const api = useApi<T[]>(path, { params });

  const setPage = useCallback((page: number) => setList((s) => ({ ...s, page })), []);
  const setPageSize = useCallback(
    (pageSize: number) => setList((s) => ({ ...s, pageSize, page: 1 })),
    [],
  );
  const setQ = useCallback((q: string) => setList((s) => ({ ...s, q, page: 1 })), []);
  const setSort = useCallback((sort: string | undefined) => setList((s) => ({ ...s, sort })), []);
  const setFilters = useCallback(
    (filters: QueryParams) => setList((s) => ({ ...s, filters: { ...s.filters, ...filters }, page: 1 })),
    [],
  );
  const resetFilters = useCallback(
    () => setList((s) => ({ ...s, page: 1, q: '', filters: initial.filters ?? {} })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return {
    ...api,
    list,
    setPage,
    setPageSize,
    setQ,
    setSort,
    setFilters,
    resetFilters,
    totalPages: api.meta?.totalPages ?? 1,
    total: api.meta?.total ?? 0,
  };
}

// ---------- useMutation ----------

export interface UseMutationResult<TInput, TOutput> {
  /** تنفيذ التغيير — يعيد null إذا كان التنفيذ جاريًا (حماية إرسال مزدوج) أو فشل. */
  mutate: (input: TInput, opts?: { idempotencyKey?: string }) => Promise<TOutput | null>;
  pending: boolean;
  error: ApiClientError | null;
  data: TOutput | null;
  reset: () => void;
}

export type MutationFn<TInput, TOutput> = (
  input: TInput,
  opts: RequestOptions & { idempotencyKey?: string },
) => Promise<TOutput>;

/** غلاف لتغيير عبر API مع قفل إرسال مزدوج. */
export function makeApiMutation<TInput, TOutput>(
  path: (input: TInput) => string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  toBody?: (input: TInput) => unknown,
): MutationFn<TInput, TOutput> {
  return async (input, opts) => {
    const result = await apiRequest<TOutput>(path(input), {
      method,
      body: toBody ? toBody(input) : (input as unknown),
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
    });
    return result.data;
  };
}

export function useMutation<TInput, TOutput>(
  fn: MutationFn<TInput, TOutput>,
): UseMutationResult<TInput, TOutput> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [data, setData] = useState<TOutput | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (input: TInput, opts?: { idempotencyKey?: string }): Promise<TOutput | null> => {
      // حماية الإرسال المزدوج: تجاهل أي استدعاء أثناء التنفيذ
      if (pendingRef.current) return null;
      pendingRef.current = true;
      setPending(true);
      setError(null);
      try {
        const output = await fn(input, { idempotencyKey: opts?.idempotencyKey });
        if (mountedRef.current) setData(output);
        return output;
      } catch (e: unknown) {
        const apiErr =
          e instanceof ApiClientError
            ? e
            : new ApiClientError(0, { code: 'INTERNAL_ERROR', message: String(e) });
        if (mountedRef.current) setError(apiErr);
        return null;
      } finally {
        pendingRef.current = false;
        if (mountedRef.current) setPending(false);
      }
    },
    [fn],
  );

  const reset = useCallback(() => {
    setError(null);
    setData(null);
  }, []);

  return { mutate, pending, error, data, reset };
}

// ---------- ترجمة أخطاء API ----------

/**
 * يترجم أخطاء API إلى نص عرض: errors.{CODE} إن وُجد وإلا رسالة الخادم/نص عام.
 */
export function useErrorText(): (error: unknown) => string {
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiClientError) {
        // tErrors على مفتاح مفقود يرمي استثناءً في next-intl — نفحص .has أولًا.
        const known =
          KNOWN_ERROR_CODES.has(error.code) && tErrors.has(error.code) ? tErrors(error.code) : undefined;
        return known ?? error.message ?? tCommon('errorGeneric');
      }
      return tCommon('errorGeneric');
    },
    [tErrors, tCommon],
  );
}

const KNOWN_ERROR_CODES = new Set<string>([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'CAPACITY_EXCEEDED',
  'SESSION_CONFLICT',
  'OVERPAYMENT_NOT_ALLOWED',
  'DUPLICATE_RECORD',
  'INSUFFICIENT_PERMISSION',
  'VERSION_CONFLICT',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'IMMUTABLE_RECORD',
  'LAST_SUPER_ADMIN',
  'INVALID_AMOUNT',
  'BUSINESS_RULE_VIOLATION',
  'IDEMPOTENCY_REPLAY',
  'INTERNAL_ERROR',
]);

// ---------- تأخير (debounce) ----------

export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
