#!/bin/bash
# ─── Deploy script para crm-onboarding.online ───────────────────────────────
# Ejecutar en el servidor: bash /opt/fintech-crm/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
cd /opt/fintech-crm

echo "📥 Descargando cambios de GitHub..."
git pull origin master

echo "🔨 Reconstruyendo backend..."
docker compose build --no-cache backend
docker compose up -d backend

echo "🔨 Reconstruyendo frontend..."
docker rmi fintech-crm-frontend 2>/dev/null || true
docker compose build --no-cache frontend
docker compose up -d frontend

echo "📂 Copiando build a /opt/fintech-crm/frontend-dist/..."
rm -rf /opt/fintech-crm/frontend-dist/*
docker cp fintech_crm_frontend:/usr/share/nginx/html/. /opt/fintech-crm/frontend-dist/

echo "🔄 Recargando nginx del servidor..."
systemctl reload nginx

echo "✅ Deploy completado exitosamente"
