import { initializeDatabase, query } from './connection';
import bcrypt from 'bcryptjs';

async function seed() {
  await initializeDatabase();

  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  await query(`
    INSERT INTO users (email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (email) DO NOTHING
  `, ['admin@fintechcrm.com', adminPassword, 'Admin', 'System', 'admin']);

  // Create commercial user
  const commercialPassword = await bcrypt.hash('Commercial123!', 12);
  await query(`
    INSERT INTO users (email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (email) DO NOTHING
  `, ['commercial@fintechcrm.com', commercialPassword, 'Carlos', 'Mendoza', 'commercial']);

  // Create onboarding user
  const onboardingPassword = await bcrypt.hash('Onboarding123!', 12);
  await query(`
    INSERT INTO users (email, password_hash, first_name, last_name, role)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (email) DO NOTHING
  `, ['onboarding@fintechcrm.com', onboardingPassword, 'Ana', 'García', 'onboarding']);

  console.log('✅ Users created');
  console.log('');
  console.log('📋 Demo credentials:');
  console.log('  Admin:      admin@fintechcrm.com / Admin123!');
  console.log('  Commercial: commercial@fintechcrm.com / Commercial123!');
  console.log('  Onboarding: onboarding@fintechcrm.com / Onboarding123!');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
