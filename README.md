# Fintech CRM — Sistema de Gestión de Comercios

Sistema CRM empresarial para gestión de onboarding de comercios fintech, con scoring automático, dashboard en tiempo real, y comunicación interna.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express + TypeScript |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Base de datos | PostgreSQL 16 |
| Tiempo real | Socket.IO |
| Autenticación | JWT |
| Reportes | ExcelJS + PDFKit |

## Inicio Rápido

### Con Docker (recomendado)

```bash
cd fintech-crm
docker-compose up -d
```

Luego ejecuta el seed:
```bash
docker-compose exec backend node -r ts-node/register src/database/seed.ts
```

Accede en: http://localhost:3000

### Desarrollo local

**Backend:**
```bash
cd backend
cp .env.example .env
# Edita .env con tus credenciales de PostgreSQL
npm install
npm run db:migrate   # Crea tablas automáticamente
npm run db:seed      # Crea usuarios demo
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Credenciales Demo

| Rol | Email | Contraseña |
|-----|-------|-----------|
| Admin | admin@fintechcrm.com | Admin123! |
| Comercial | commercial@fintechcrm.com | Commercial123! |
| Onboarding | onboarding@fintechcrm.com | Onboarding123! |

## Funcionalidades

### Roles de Usuario
- **Admin**: Acceso total, gestión de usuarios y webhooks
- **Comercial**: Registro de comercios, seguimiento, reportes
- **Onboarding**: Cambio de estados, documentos, comentarios, tareas

### Módulos
- **Dashboard**: Métricas en tiempo real, gráficos, alertas de inactividad
- **Comercios**: CRUD completo con formulario de 6 pasos (incluye MCC obligatorio)
- **Timeline**: Historial de comentarios, cambios de estado, documentos y tareas
- **Documentos**: Upload drag & drop, verificación, descarga
- **Tareas**: Kanban board con prioridades y asignación
- **Calendario**: Vista mensual con eventos por comercio
- **Reportes**: Exportación CSV, Excel y PDF con filtros
- **Notificaciones**: Tiempo real via WebSocket + alertas automáticas
- **Webhooks**: Configuración con firma HMAC y logs de ejecución

### Sistema de Scoring Automático
Calcula un score 0-100 basado en:
- Completitud del perfil (30 pts)
- Actividad reciente (25 pts)
- Documentos subidos (20 pts)
- Integración técnica (15 pts)
- Nivel de riesgo (10 pts)

### Alertas Automáticas (Cron Jobs)
- Comercios sin actividad > 48h → notificación al responsable
- Tareas vencidas → notificación al asignado
- Recálculo de scores cada 6 horas

## API REST

Base URL: `http://localhost:3001/api/v1`

### Endpoints principales
```
POST   /auth/login
GET    /auth/me
GET    /merchants          # Lista con filtros y paginación
POST   /merchants          # Crear comercio
GET    /merchants/:id      # Detalle + historial de estados
PUT    /merchants/:id      # Actualizar
PATCH  /merchants/:id/status  # Cambiar estado
GET    /merchants/:id/timeline
GET    /dashboard/metrics
GET    /dashboard/inactivity-alerts
GET    /reports/merchants?format=csv|excel|pdf
POST   /documents/upload
POST   /comments
GET    /tasks
POST   /calendar/events
GET    /notifications
POST   /webhooks
```

## Webhooks

Eventos disponibles:
- `merchant.created`
- `merchant.updated`
- `merchant.status_changed`
- `document.uploaded`
- `task.completed`
- `comment.added`

Cada webhook incluye firma HMAC-SHA256 en el header `X-Webhook-Signature`.

## Estados del Comercio

```
lead → pending → in_review → documentation_required
                           ↓
                        approved → certified
                           ↓
                        rejected
                        suspended
                        inactive
```
