/**
 * محوّلات قنوات الإشعارات (7.16):
 * - IN_APP مفعّلة دائمًا (الإشعار داخل التطبيق هو الأساس).
 * - EMAIL/SMS/WHATSAPP خلف واجهة Adapter ومعطّلة افتراضيًا.
 *   التفعيل يتم بالبيئة (SMTP_ENABLED وغيرها) + تهيئة مزوّد خارجي (نقطة توسعة موثّقة).
 * - كل محاولة إرسال تُسجَّل في NotificationDelivery (عبر notifications/service).
 */
import type { NotificationChannel } from '@prisma/client';
import { getEnv } from '@/shared/config/env';

export interface OutboundMessage {
  channel: NotificationChannel;
  /** بريد/هاتف/معرّف مستهدف. */
  recipient: string;
  title: string;
  body: string;
  /** معرّف الإشعار في القاعدة للربط. */
  referenceId?: string;
}

export interface DeliveryResult {
  status: 'SENT' | 'FAILED';
  error?: string;
}

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  /** هل القناة مفعّلة في الإعداد الحالي؟ */
  isEnabled(): boolean;
  /** محاولة الإرسال — لا ترمي؛ تعيد FAILED مع السبب. */
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

const disabledResult = (reason: string): DeliveryResult => ({ status: 'FAILED', error: reason });

/** القناة داخل التطبيق: "الإرسال" هو إنشاء سجل الإشعار نفسه — تُسجَّل Delivery بنجاح. */
export const inAppAdapter: NotificationChannelAdapter = {
  channel: 'IN_APP',
  isEnabled: () => true,
  async send() {
    return { status: 'SENT' };
  },
};

/**
 * البريد عبر SMTP — معطّل افتراضيًا (SMTP_ENABLED=false).
 * عند التفعيل يلزم ربط مزوّد SMTP (nodemailer أو ما يعادله)؛
 * حتى ذلك الحين يُعاد FAILED بسبب واضح ويُسجَّل في NotificationDelivery.
 */
export const emailAdapter: NotificationChannelAdapter = {
  channel: 'EMAIL',
  isEnabled: () => getEnv().SMTP_ENABLED,
  async send(message) {
    if (!this.isEnabled()) return disabledResult('قناة البريد غير مفعّلة (SMTP_ENABLED=false)');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.recipient)) {
      return disabledResult('عنوان البريد غير صالح');
    }
    // نقطة توسعة: ربط مزوّد SMTP فعلي (nodemailer). غير مهيأ في هذه النسخة.
    return disabledResult('مزوّد SMTP غير مهيأ — نقطة توسعة موثّقة');
  },
};

/** SMS — معطّل افتراضيًا (SMS_ENABLED غير مضبوط). */
export const smsAdapter: NotificationChannelAdapter = {
  channel: 'SMS',
  isEnabled: () => process.env.SMS_ENABLED === 'true',
  async send() {
    if (!this.isEnabled()) return disabledResult('قناة SMS غير مفعّلة (SMS_ENABLED!=true)');
    return disabledResult('مزوّد SMS غير مهيأ — نقطة توسعة موثّقة');
  },
};

/** WhatsApp — معطّل افتراضيًا (WHATSAPP_ENABLED غير مضبوط). */
export const whatsappAdapter: NotificationChannelAdapter = {
  channel: 'WHATSAPP',
  isEnabled: () => process.env.WHATSAPP_ENABLED === 'true',
  async send() {
    if (!this.isEnabled()) return disabledResult('قناة WhatsApp غير مفعّلة (WHATSAPP_ENABLED!=true)');
    return disabledResult('مزوّد WhatsApp غير مهيأ — نقطة توسعة موثّقة');
  },
};

export const channelAdapters: Record<NotificationChannel, NotificationChannelAdapter> = {
  IN_APP: inAppAdapter,
  EMAIL: emailAdapter,
  SMS: smsAdapter,
  WHATSAPP: whatsappAdapter,
};

export function getAdapter(channel: NotificationChannel): NotificationChannelAdapter {
  return channelAdapters[channel];
}

/** القنوات المفعّلة حاليًا (للعرض في مركز الإشعارات/التشخيص). */
export function getEnabledChannels(): NotificationChannel[] {
  return (Object.values(channelAdapters) as NotificationChannelAdapter[])
    .filter((a) => a.isEnabled())
    .map((a) => a.channel);
}
