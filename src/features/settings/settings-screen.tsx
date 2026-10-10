'use client';

/**
 * شاشة الإعدادات — عرض الإعدادات مجمّعة حسب group (تبويبات) وتحرير القيمة حسب valueType.
 * - GET /settings?group= → { data: SettingDto[] }
 * - PUT /settings/[key] → body { value (بالنوع الصحيح), valueType?, group?, description? }
 *   (المفتاح يحتوي نقاطًا — تمريره عبر encodeURIComponent؛ النقاط مسموحة في مقطع المسار)
 * بوابة الواجهة: settings.manage (التنفيذ الفعلي في الخادم).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Save } from 'lucide-react';
import { apiPut } from '@/shared/api/client';
import type { SettingDto } from '@/shared/api/types';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Textarea } from '@/shared/ui-kit/textarea';
import { Checkbox } from '@/shared/ui-kit/date-picker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui-kit/tabs';
import { Card, CardContent } from '@/shared/ui-kit/card';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { useToast } from '@/shared/ui-kit/toast';

/** تمهيد JSON لعرضه في Textarea. */
function displayValue(s: SettingDto): string {
  if (s.valueType === 'json') {
    try {
      return JSON.stringify(s.value ?? null, null, 2);
    } catch {
      return s.rawValue;
    }
  }
  if (s.valueType === 'boolean') return s.value === true || s.value === 'true' ? 'true' : 'false';
  return String(s.value ?? '');
}

export function SettingsScreen() {
  const t = useTranslations('setting');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const { can } = useSession();
  const manage = can('settings.manage');

  const settings = useApi<SettingDto[]>('/settings');

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const s of settings.data ?? []) set.add(s.group);
    return [...set].sort();
  }, [settings.data]);

  const [activeGroup, setActiveGroup] = useState<string>('');
  useEffect(() => {
    if (groups.length > 0 && !groups.includes(activeGroup)) setActiveGroup(groups[0]!);
  }, [groups, activeGroup]);

  const byGroup = useMemo(() => {
    const map = new Map<string, SettingDto[]>();
    for (const s of settings.data ?? []) {
      const arr = map.get(s.group);
      if (arr) arr.push(s);
      else map.set(s.group, [s]);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.key.localeCompare(b.key));
    return map;
  }, [settings.data]);

  const onSaved = (updated: SettingDto) => {
    settings.setData((prev) => (prev ?? []).map((s) => (s.key === updated.key ? updated : s)));
  };

  return (
    <div>
      <PageHeader title={tr(t, 'title', 'الإعدادات')} />

      {settings.loading ? <Loading label={tc('loading')} /> : null}
      {settings.error ? <ErrorState message={errorText(settings.error)} onRetry={settings.reload} /> : null}

      {!settings.loading && !settings.error && (settings.data ?? []).length === 0 ? (
        <EmptyState title={tc('noData')} />
      ) : null}

      {!settings.loading && !settings.error && groups.length > 0 ? (
        <Tabs value={activeGroup} onValueChange={setActiveGroup} dir="rtl">
          <TabsList aria-label={tr(t, 'title', 'الإعدادات')}>
            {groups.map((g) => (
              <TabsTrigger key={g} value={g}>
                {tr(t, `groups.${g}`, g)}
              </TabsTrigger>
            ))}
          </TabsList>
          {groups.map((g) => (
            <TabsContent key={g} value={g} className="space-y-3">
              {(byGroup.get(g) ?? []).map((s) => (
                <SettingRow key={s.key} setting={s} canManage={manage} onSaved={onSaved} />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}

// ---------- صف إعداد واحد ----------

function SettingRow({
  setting,
  canManage,
  onSaved,
}: {
  setting: SettingDto;
  canManage: boolean;
  onSaved: (updated: SettingDto) => void;
}) {
  const t = useTranslations('setting');
  const tc = useTranslations('common');
  const tv = useTranslations('ui.validation');
  const toast = useToast();
  const errorText = useErrorText();
  const fmt = useFormatters();

  const [text, setText] = useState<string>(() => displayValue(setting));
  const [boolValue, setBoolValue] = useState<boolean>(setting.value === true || setting.value === 'true');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // إعادة المزامنة عند استبدال الصف من الخادم
  useEffect(() => {
    setText(displayValue(setting));
    setBoolValue(setting.value === true || setting.value === 'true');
    setError(null);
  }, [setting]);

  const label = tr(t, `keys.${setting.key}`, setting.description ?? setting.key);

  const buildBody = (): { ok: true; value: unknown } | { ok: false; message: string } => {
    switch (setting.valueType) {
      case 'boolean':
        return { ok: true, value: boolValue };
      case 'number': {
        const cleaned = text.trim().replace(/,/g, '.');
        if (cleaned === '' || !Number.isFinite(Number(cleaned))) {
          return { ok: false, message: tv('number') };
        }
        return { ok: true, value: Number(cleaned) };
      }
      case 'json': {
        try {
          return { ok: true, value: JSON.parse(text) as unknown };
        } catch {
          return { ok: false, message: tr(tv, 'json', 'قيمة JSON غير صالحة') };
        }
      }
      case 'string':
      default:
        return { ok: true, value: text };
    }
  };

  const save = async () => {
    setError(null);
    const body = buildBody();
    if (!body.ok) {
      setError(body.message);
      return;
    }
    setSaving(true);
    try {
      const r = await apiPut<SettingDto>(`/settings/${encodeURIComponent(setting.key)}`, {
        value: body.value,
        valueType: setting.valueType,
      });
      toast.success(tr(t, 'saved', 'تم حفظ الإعداد'));
      onSaved(r.data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    setting.valueType === 'boolean'
      ? boolValue !== (setting.value === true || setting.value === 'true')
      : text !== displayValue(setting);

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="ltr-field font-mono text-xs text-muted-foreground" dir="ltr">
            {setting.key}
          </span>
        </div>
        {setting.description && setting.description !== label ? (
          <p className="text-xs text-muted-foreground">{setting.description}</p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            {setting.valueType === 'boolean' ? (
              <Checkbox
                label={boolValue ? tr(t, 'booleanTrue', 'نعم') : tr(t, 'booleanFalse', 'لا')}
                checked={boolValue}
                disabled={!canManage || saving}
                onChange={(e) => setBoolValue(e.target.checked)}
              />
            ) : setting.valueType === 'json' ? (
              <Field label={tr(t, 'value', 'القيمة')} error={error}>
                <Textarea
                  dir="ltr"
                  className="ltr-field font-mono text-xs"
                  rows={6}
                  value={text}
                  disabled={!canManage || saving}
                  onChange={(e) => setText(e.target.value)}
                  invalid={Boolean(error)}
                />
              </Field>
            ) : setting.valueType === 'number' ? (
              <Field label={tr(t, 'value', 'القيمة')} error={error}>
                <Input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={text}
                  disabled={!canManage || saving}
                  onChange={(e) => setText(e.target.value)}
                  invalid={Boolean(error)}
                />
              </Field>
            ) : (
              <Field label={tr(t, 'value', 'القيمة')} error={error}>
                <Input
                  type="text"
                  value={text}
                  disabled={!canManage || saving}
                  onChange={(e) => setText(e.target.value)}
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          </div>
          {canManage ? (
            <Button type="button" onClick={() => void save()} loading={saving} disabled={!dirty}>
              <Save className="size-4" aria-hidden />
              {tr(t, 'saveSetting', 'حفظ')}
            </Button>
          ) : null}
        </div>

        {setting.updatedAt ? (
          <p className="text-xs text-muted-foreground">
            {tc('updatedAt')}: <span className="ltr-field">{fmt.dateTime(setting.updatedAt)}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
