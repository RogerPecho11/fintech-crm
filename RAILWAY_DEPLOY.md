# Guía de Deploy en Railway

## Pasos para subir el proyecto

### 1. Crear cuenta y proyecto en Railway
1. Ve a https://railway.app y crea una cuenta
2. Haz clic en **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Conecta tu cuenta de GitHub y sube este proyecto a un repositorio

### 2. Agregar PostgreSQL
1. En tu proyecto Railway, haz clic en **"+ New"**
2. Selecciona **"Database" → "PostgreSQL"**
3. Railway creará la base de datos automáticamente

### 3. Crear el servicio Backend
1. Haz clic en **"+ New" → "GitHub Repo"**
2. Selecciona tu repositorio
3. En **"Root Directory"** escribe: `fintech-crm/backend`
4. Railway detectará automáticamente Node.js

**Variables de entorno del Backend** (Settings → Variables):
```
NODE_ENV=production
PORT=3001
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
JWT_SECRET=tu_clave_secreta_muy_larga_aqui_cambiar
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://tu-frontend.up.railway.app
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_app_password_gmail
EMAIL_FROM=noreply@prontopaga.com
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
WEBHOOK_SECRET=webhook_secret_cambiar
```

### 4. Crear el servicio Frontend
1. Haz clic en **"+ New" → "GitHub Repo"**
2. Selecciona el mismo repositorio
3. En **"Root Directory"** escribe: `fintech-crm/frontend`

**Variables de entorno del Frontend** (Settings → Variables):
```
VITE_API_URL=https://tu-backend.up.railway.app
```
> Reemplaza con la URL real del backend que Railway te asigna

### 5. Ejecutar migraciones y seed
Una vez desplegado el backend, ve a la terminal de Railway:
```bash
node -r ts-node/register src/database/seed.ts
```

O desde tu máquina local apuntando a la DB de Railway:
```bash
DATABASE_URL=postgresql://... node -r ts-node/register src/database/seed.ts
```

### 6. Credenciales de acceso
```
Admin:      admin@fintechcrm.com / Admin123!
Comercial:  commercial@fintechcrm.com / Commercial123!
Onboarding: onboarding@fintechcrm.com / Onboarding123!
```

## Notas importantes
- El backend necesita la variable `FRONTEND_URL` con la URL del frontend para CORS
- El frontend necesita `VITE_API_URL` con la URL del backend
- Railway asigna URLs automáticamente tipo `https://xxx.up.railway.app`
- Los archivos subidos (documentos) se pierden al redeploy — considera usar AWS S3 o Cloudinary para producción
