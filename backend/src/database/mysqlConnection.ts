import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'replica-produccion-brasil.chm5clze4j9i.us-east-1.rds.amazonaws.com',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'roger.pecho',
  password: process.env.MYSQL_PASSWORD || 'T9x#vB7q!LmZ2rWdXf6A',
  database: process.env.MYSQL_DATABASE || 'prontopaga_com',
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
  connectTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

export async function mysqlQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function mysqlQueryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await mysqlQuery<T>(sql, params);
  return rows[0] || null;
}

export default pool;
