# Guía de Deploy en Render

## Pasos

### 1. Subir código a GitHub
```bash
cd "C:\Users\ROGER PECHO\Desktop\CRM- ProntoPaga\fintech-crm"
git init
git add .
git commit -m "ProntoPaga CRM"
```
Crea repo en https://github.com/new y luego:
```bash
git remote add origin https://github.com/TU_USUARIO/prontopaga-crm.git
git push -u origin main
```

### 2. Crear cuenta en Render
Ve a https://render.com → Sign up con GitHub

### 3. Deploy con Blueprint (automático)
1. En Render → **"New" → "Blueprint"**
2. Conecta tu repositorio
3. Render detectará el archivo `render.yaml` y creará todo automáticamente:
   - Base de datos PostgreSQL
   - Servicio Backend
   - Servicio Frontend (estático)

### 4. Ejecutar seed (usuarios demo)
En Render → servicio backend → **"Shell"**:
```bash
node -r ts-node/register src/database/seed.ts
```

### 5. Acceso
- Frontend: https://prontopaga-frontend.onrender.com
- Credenciales:
  - admin@fintechcrm.com / Admin123!
  - commercial@fintechcrm.com / Commercial123!
  - onboarding@fintechcrm.com / Onboarding123!

## Notas
- Plan gratuito: el servicio "duerme" tras 15 min sin uso (tarda ~30s en despertar)
- Para evitar esto: plan Starter a $7/mes por servicio
- La base de datos gratuita expira en 90 días → actualiza a $7/mes para producción
