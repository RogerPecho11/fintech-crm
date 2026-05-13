import mysql from 'mysql2/promise';

function createPool() {
  return mysql.createPool({
    host: 'replica-produccion-brasil.chm5clze4j9i.us-east-1.rds.amazonaws.com',
    port: 3306,
    user: 'roger.pecho',
    password: 'T9x#vB7q!LmZ2rWdXf6A',
    database: 'prontopaga_com',
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 10,
    connectTimeout: 15000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    idleTimeout: 60000,
  });
}

let pool = createPool();

// Cola secuencial — solo 1 query a la vez contra la réplica
let queryQueue: Promise<any> = Promise.resolve();

export async function mysqlQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = queryQueue.then(async () => {
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

export default pool;
