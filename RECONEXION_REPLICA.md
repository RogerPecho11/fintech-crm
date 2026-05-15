# 🔄 Reconexión de la Réplica MySQL de Producción

## Problema
La réplica MySQL (`replica-produccion-brasil.chm5clze4j9i.us-east-1.rds.amazonaws.com`) está en una VPC privada de AWS y solo es accesible a través de la VPN.

## Datos de conexión
- **Host:** replica-produccion-brasil.chm5clze4j9i.us-east-1.rds.amazonaws.com
- **IP privada:** 10.200.15.96
- **Puerto:** 3306
- **Usuario:** roger.pecho
- **Base de datos:** prontopaga_com

## Pasos para reconectar

### 1. Conectar la VPN en el servidor
```bash
ssh root@srv1639209
# o conectar por la IP del servidor

# Verificar si la VPN ya está activa
ip addr show tun0

# Si NO está activa, conectar:
systemctl start openvpn-client@client

# O directamente:
openvpn --config /etc/openvpn/client/client.conf --daemon

# Esperar 5 segundos y verificar
sleep 5 && ip addr show tun0
```

### 2. Verificar conectividad a la réplica
```bash
# Verificar que el puerto responde
timeout 5 bash -c 'echo > /dev/tcp/10.200.15.96/3306' && echo "PUERTO ABIERTO" || echo "PUERTO CERRADO"

# Verificar rutas
ip route | grep 10.200
```

### 3. Habilitar forwarding para Docker (si es necesario)
```bash
# Permitir que los contenedores Docker accedan a la VPN
iptables -t nat -A POSTROUTING -o tun0 -j MASQUERADE
iptables -A FORWARD -i docker0 -o tun0 -j ACCEPT
iptables -A FORWARD -i tun0 -o docker0 -m state --state RELATED,ESTABLISHED -j ACCEPT
```

### 4. Reiniciar el backend
```bash
cd /opt/fintech-crm
docker restart fintech_crm_backend

# Verificar logs
docker logs fintech_crm_backend --tail 30
```

## Sistema de Cache (implementado)

El backend tiene un sistema de cache en memoria para reducir consultas a la réplica:

- **Datos estáticos** (comercios, países): cache 30 min
- **Datos semi-estáticos** (métodos de pago): cache 15 min
- **Resúmenes transaccionales**: cache 5 min
- **Datos en tiempo real**: cache 2 min
- **Rate limit:** máximo 30 queries por minuto a la réplica

### Endpoints de cache
- `GET /api/v1/monitoring/cache-stats` — Ver estadísticas del cache
- `POST /api/v1/monitoring/cache-clear` — Limpiar cache manualmente

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| ETIMEDOUT | VPN desconectada | Reconectar VPN (paso 1) |
| ECONNRESET | Réplica reiniciándose | Esperar 2-3 min y reintentar |
| Puerto cerrado | Falta iptables forwarding | Ejecutar paso 3 |
| Datos desactualizados | Cache activo | Limpiar cache (endpoint) |
