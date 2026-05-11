import mysql from 'mysql2/promise';

function createPool() {
  return mysql.createPool({
    host: 'replica-produccion-brasil.chm5clze4j9i.us-east-1.rds.amazonaws.com',
    port: 3306,
    user: 'roger.pecho',
    password: 'T9x#vB7q!LmZ2rWdXf6A',
    database: 'prontopaga_com',
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
    connectTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

let pool = createPool();

export async function mysqlQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows as T[];
  } catch (err: any) {
    // Si la conexión se perdió, recrear el pool e intentar de nuevo
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.message?.includes('ETIMEDOUT')) {
      console.log('[MySQL] Reconectando...');
      pool = createPool();
      const [rows] = await pool.execute(sql, params);
      return rows as T[];
    }
    throw err;
  }
}

export async function mysqlQueryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await mysqlQuery<T>(sql, params);
  return rows[0] || null;
}

export default pool;
