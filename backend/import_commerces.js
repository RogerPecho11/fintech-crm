/**
 * Script para importar comercios de la réplica MySQL de producción al CRM (PostgreSQL).
 * Importa comercios creados entre 2025-10-01 y 2026-06-02.
 * NO borra comercios existentes — solo inserta los que no existen.
 * 
 * Ejecutar dentro del contenedor: node import_commerces.js
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');

const DATE_FROM = '2025-10-01';
const DATE_TO = '2026-06-02';

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  IMPORTACIÓN DE COMERCIOS: Réplica MySQL → CRM PostgreSQL');
  console.log('  Período: ' + DATE_FROM + ' a ' + DATE_TO);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Conexión MySQL (réplica producción)
  const mysqlConn = await mysql.createConnection({
    host: 'replica-produccion-brasil.chm5clze4j9i.us-east-1.rds.amazonaws.com',
    port: 3306,
    user: 'roger.pecho',
    password: 'T9x#vB7q!LmZ2rWdXf6A',
    database: 'prontopaga_com',
    connectTimeout: 15000,
  });
  console.log('✅ Conectado a MySQL (réplica)');

  // Conexión PostgreSQL (CRM) — usa las mismas variables que el backend
  const pgPool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'fintech_crm',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });
  await pgPool.query('SELECT 1');
  console.log('✅ Conectado a PostgreSQL (CRM)\n');

  // 1. Obtener comercios de MySQL
  const [commerces] = await mysqlConn.execute(
    'SELECT id, name, slug, rut, country, enabled, created_at, updated_at FROM commerce WHERE (is_deleted IS NULL OR is_deleted = 0) AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC',
    [DATE_FROM, DATE_TO]
  );

  console.log('📊 Comercios encontrados en réplica: ' + commerces.length + '\n');

  if (commerces.length === 0) {
    console.log('No hay comercios para importar.');
    await mysqlConn.end();
    await pgPool.end();
    return;
  }

  // 2. Obtener merchant_ids ya existentes en el CRM
  const existingResult = await pgPool.query(
    'SELECT merchant_id FROM merchants WHERE merchant_id IS NOT NULL'
  );
  const existingIds = new Set(existingResult.rows.map(r => r.merchant_id));
  console.log('📋 Comercios ya existentes en CRM (con merchant_id): ' + existingIds.size);

  // También verificar por nombre
  const existingNames = await pgPool.query('SELECT LOWER(legal_name) as name FROM merchants');
  const existingNameSet = new Set(existingNames.rows.map(r => r.name));

  // 3. Filtrar los que no existen
  const toImport = commerces.filter(c => {
    if (existingIds.has(String(c.id))) return false;
    if (existingNameSet.has((c.name || '').toLowerCase())) return false;
    return true;
  });

  console.log('🆕 Comercios nuevos a importar: ' + toImport.length);
  console.log('⏭️  Comercios omitidos (ya existen): ' + (commerces.length - toImport.length) + '\n');

  if (toImport.length === 0) {
    console.log('✅ Todos los comercios ya están en el CRM. Nada que importar.');
    await mysqlConn.end();
    await pgPool.end();
    return;
  }

  // 4. Importar
  let imported = 0;
  let errors = 0;

  for (const c of toImport) {
    try {
      await pgPool.query(
        `INSERT INTO merchants (
          legal_name, trade_name, tax_id, country, status, risk_level,
          merchant_id, created_at, updated_at, last_activity_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          c.name || 'Sin nombre',
          c.name || null,
          c.rut || null,
          c.country || null,
          'lead',
          'diamond',
          String(c.id),
          c.created_at || new Date(),
          c.updated_at || new Date(),
          c.updated_at || c.created_at || new Date(),
        ]
      );
      imported++;
      if (imported % 10 === 0) {
        process.stdout.write('\r  Importados: ' + imported + '/' + toImport.length);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error('\n  ❌ Error importando "' + c.name + '" (ID: ' + c.id + '): ' + err.message);
      }
    }
  }

  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('  RESULTADO:');
  console.log('  ✅ Importados: ' + imported);
  console.log('  ❌ Errores: ' + errors);
  console.log('  ⏭️  Omitidos: ' + (commerces.length - toImport.length));
  console.log('═══════════════════════════════════════════════════════════\n');

  await mysqlConn.end();
  await pgPool.end();
}

main().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
