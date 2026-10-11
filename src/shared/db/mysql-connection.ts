/**
 * قراءة اتصال MySQL/MariaDB من DATABASE_URL لأدوات سطر الأوامر (mysqldump/mysql).
 * كلمة المرور لا تُمرَّر في سطر الأوامر (تظهر في قائمة العمليات) بل عبر متغير MYSQL_PWD.
 */
export interface MysqlConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function getMysqlConnection(url = getEnvUrl()): MysqlConnection {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL غير صالح — يجب أن يكون بصيغة mysql://user:pass@host:port/database');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0] ?? '');
  if (!database) throw new Error('DATABASE_URL لا يتضمن اسم قاعدة البيانات');
  return {
    host: parsed.hostname || '127.0.0.1',
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username || 'root'),
    password: decodeURIComponent(parsed.password || ''),
    database,
  };
}

/** وسائط الاتصال المشتركة لـ mysqldump و mysql. */
export function mysqlConnectionArgs(conn: MysqlConnection): string[] {
  return [`--host=${conn.host}`, `--port=${conn.port}`, `--user=${conn.user}`, conn.database];
}

function getEnvUrl(): string {
  return process.env.DATABASE_URL ?? '';
}
