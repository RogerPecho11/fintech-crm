/**
 * ─── Cache centralizado para consultas a la réplica MySQL de producción ───────
 * 
 * Objetivo: Reducir la carga sobre la réplica de producción almacenando
 * resultados en memoria dentro del contenedor Docker.
 * 
 * Estrategia:
 * - Datos estáticos (comercios, países): cache 30 min
 * - Datos semi-estáticos (métodos de pago): cache 15 min  
 * - Datos transaccionales (resúmenes): cache 5 min
 * - Datos en tiempo real (movimientos): cache 2 min
 * 
 * Límites:
 * - Máximo 500 entradas en cache
 * - Máximo 50MB de memoria estimada
 * - Auto-limpieza de entradas expiradas cada 5 min
 */

export interface CacheEntry {
  data: any;
  expires: number;
  size: number; // estimación en bytes
  hits: number;
  createdAt: number;
}

export class MysqlCache {
  private store = new Map<string, CacheEntry>();
  private maxEntries = 500;
  private maxMemoryMB = 50;
  private currentMemory = 0;
  private cleanupInterval: NodeJS.Timer;

  // TTLs predefinidos
  static readonly TTL_STATIC = 30 * 60 * 1000;      // 30 min (comercios, países)
  static readonly TTL_SEMI_STATIC = 15 * 60 * 1000;  // 15 min (métodos, configuraciones)
  static readonly TTL_SUMMARY = 5 * 60 * 1000;       // 5 min (resúmenes, totales)
  static readonly TTL_REALTIME = 2 * 60 * 1000;      // 2 min (movimientos recientes)

  constructor() {
    // Limpieza automática cada 5 minutos
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  get(key: string): any | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.remove(key);
      return null;
    }

    entry.hits++;
    return entry.data;
  }

  set(key: string, data: any, ttl: number): void {
    // Estimar tamaño del dato
    const size = this.estimateSize(data);

    // Si excede memoria, limpiar entradas menos usadas
    if (this.currentMemory + size > this.maxMemoryMB * 1024 * 1024) {
      this.evictLeastUsed();
    }

    // Si excede max entradas, limpiar las más viejas
    if (this.store.size >= this.maxEntries) {
      this.evictOldest();
    }

    // Remover entrada anterior si existe
    if (this.store.has(key)) {
      this.remove(key);
    }

    this.store.set(key, {
      data,
      expires: Date.now() + ttl,
      size,
      hits: 0,
      createdAt: Date.now(),
    });
    this.currentMemory += size;
  }

  remove(key: string): void {
    const entry = this.store.get(key);
    if (entry) {
      this.currentMemory -= entry.size;
      this.store.delete(key);
    }
  }

  /** Invalidar todas las entradas que coincidan con un patrón */
  invalidatePattern(pattern: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.remove(key);
        count++;
      }
    }
    return count;
  }

  /** Limpiar todo el cache */
  clear(): void {
    this.store.clear();
    this.currentMemory = 0;
  }

  /** Estadísticas del cache */
  stats() {
    return {
      entries: this.store.size,
      memoryMB: (this.currentMemory / (1024 * 1024)).toFixed(2),
      maxEntries: this.maxEntries,
      maxMemoryMB: this.maxMemoryMB,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expires) {
        this.remove(key);
      }
    }
  }

  private evictLeastUsed(): void {
    // Eliminar el 20% con menos hits
    const entries = [...this.store.entries()]
      .sort((a, b) => a[1].hits - b[1].hits);
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.remove(entries[i][0]);
    }
  }

  private evictOldest(): void {
    const entries = [...this.store.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.remove(entries[i][0]);
    }
  }

  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // UTF-16
    } catch {
      return 1024; // fallback 1KB
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval as any);
    this.clear();
  }
}

// Singleton
export const mysqlCache = new MysqlCache();
export default mysqlCache;
