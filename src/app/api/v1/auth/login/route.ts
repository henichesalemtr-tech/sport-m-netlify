import { NextResponse } from 'next/server';
import { authService } from '@/modules/auth/service';
import { loginSchema } from '@/modules/auth/schema';
import { getEnv } from '@/shared/config/env';
import { SESSION_COOKIE } from '@/shared/auth/session';

/** POST /api/v1/auth/login — عام (بدون مصادقة). حماية Brute-Force داخل الخدمة. */
export async function POST(req: Request) {
  const env = getEnv();
  const body = await req.json();
  
  // التحقق من صحة البيانات
  const parsed = loginSchema.parse(body);
  
  // تسجيل الدخول
  const result = await authService.login(parsed, { 
    user: null, 
    requestId: crypto.randomUUID(), 
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
  });
  
  // إنشاء الاستجابة مع الكوكي
  const response = NextResponse.json(
    { data: { user: result.user, mustChangePassword: result.mustChangePassword } },
    { status: 200 }
  );
  
  // إضافة كوكي الجلسة
  response.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_IDLE_MINUTES * 60,
  });
  
  return response;
}
