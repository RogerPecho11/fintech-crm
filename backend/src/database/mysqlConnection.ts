import mysql from 'mysql2/promise';
import { mysqlCache, MysqlCache } from './mysqlCache';

function createPool() {
  return mysql.createPool({
    host: 'replica-produccion-brasil.chm5clze4j9i.us-east-1.rds.amazonaws.com',
    port: 3306,
    user: 'roger.pecho',
    password: 'T9x#vB7q!LmZ2rWdXf6A',
    database: 'prontopaga_com',
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 10,
    connectTimeout: 15000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    idleTimeout: 60000,
  });
}

let pool = createPool();

// ─── Rate Limiter: máximo N consultas por ventana de tiempo ───────────────────
const RATE_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_QUERIES_PER_WINDOW = 30; // máximo 30 queries por minuto
let queryCount = 0;
let windowStart = Date.now();

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > RATE_WINDOW_MS) {
    queryCount = 0;
    windowStart = now;
  }
  queryCount++;
  return queryCount <= MAX_QUERIES_PER_WINDOW;
}

// Cola secuencial — solo 1 query a la vez contra la réplica
let queryQueue: Promise<any> = Promise.resolve();

/**
 * Ejecuta una query contra la réplica MySQL de producción.
 * Incluye: cola secuencial, rate limiting, reconexión automática.
 */
export async function mysqlQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = queryQueue.then(async () => {
    if (!checkRateLimit()) {
      console.warn('[MySQL] Rate limit alcanzado. Esperando...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    try {
      const [rows] = await pool.execute(sql, params);
      return rows as T[];
    } catch (err: any) {
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.message?.includes('ETIMEDOUT') || err.message?.includes('execution time')) {
        console.log('[MySQL] Reconectando tras error:', err.code || err.message?.slice(0, 50));
        pool = createPool();
        const [rows] = await pool.execute(sql, params);
        return rows as T[];
      }
      throw err;
    }
  });
  queryQueue = result.catch(() => {});
  return result;
}

export async function mysqlQueryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await mysqlQuery<T>(sql, params);
  return rows[0] || null;
}

/**
 * Query con cache automático.
 * Si el resultado está en cache y no ha expirado, lo devuelve sin tocar la réplica.
 */
export async function mysqlQueryCached<T = any>(
  cacheKey: string,
  sql: string,
  params?: any[],
  ttl: number = MysqlCache.TTL_SUMMARY
): Promise<T[]> {
  const cached = mysqlCache.get(cacheKey);
  if (cached) return cached as T[];

  const rows = await mysqlQuery<T>(sql, params);
  mysqlCache.set(cacheKey, rows, ttl);
  return rows;
}

/**
 * Query paginada contra la réplica.
 * Agrega LIMIT/OFFSET automáticamente y devuelve metadata de paginación.
 */
export async function mysqlQueryPaginated<T = any>(
  sql: string,
  params: any[] = [],
  page: number = 1,
  limit: number = 50,
  countSql?: string,
  countParams?: any[]
): Promise<{ data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  // Limitar el máximo a 100 registros por página
  const safeLimit = Math.min(limit, 100);
  const offset = (page - 1) * safeLimit;

  // Query de datos con LIMIT
  const paginatedSql = `${sql} LIMIT ${safeLimit} OFFSET ${offset}`;
  const data = await mysqlQuery<T>(paginatedSql, params);

  // Query de conteo (si se proporciona)
  let total = 0;
  if (countSql) {
    const countResult = await mysqlQuery<{ total: number }>(countSql, countParams || params);
    total = countResult[0]?.total || 0;
  } else {
    // Si no hay countSql, estimar basado en si hay más datos
    total = offset + data.length + (data.length === safeLimit ? safeLimit : 0);
  }

  return {
    data,
    pagination: {
      page,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

/**
 * Query paginada CON cache.
 * Combina paginación + cache para máxima eficiencia.
 */
export async function mysqlQueryPaginatedCached<T = any>(
  cacheKey: string,
  sql: string,
  params: any[] = [],
  page: number = 1,
  limit: number = 50,
  ttl: number = MysqlCache.TTL_SUMMARY,
  countSql?: string,
  countParams?: any[]
): Promise<{ data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const fullKey = `${cacheKey}:p${page}:l${limit}`;
  const cached = mysqlCache.get(fullKey);
  if (cached) return cached;

  const result = await mysqlQueryPaginated<T>(sql, params, page, limit, countSql, countParams);
  mysqlCache.set(fullKey, result, ttl);
  return result;
}

/** Obtener estadísticas del cache y rate limiter */
export function getMysqlStats() {
  return {
    cache: mysqlCache.stats(),
    rateLimit: {
      queriesInWindow: queryCount,
      maxPerWindow: MAX_QUERIES_PER_WINDOW,
      windowResetIn: Math.max(0, RATE_WINDOW_MS - (Date.now() - windowStart)),
    },
  };
}

/** Limpiar cache (útil para forzar refresh) */
export function clearMysqlCache(): void {
  mysqlCache.clear();
}

export { mysqlCache, MysqlCache };
export default pool;
