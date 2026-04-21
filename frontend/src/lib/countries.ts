export interface Country {
  code: string;
  name: string;
  flag: string;
  currency: string;
  currencyCode: string;
  phonePrefix: string;
}

/** Países activos por defecto (Perú, Chile, Ecuador) */
export const DEFAULT_COUNTRIES: Country[] = [
  { code: 'PE', name: 'Perú',    flag: '🇵🇪', currency: 'Sol',          currencyCode: 'PEN', phonePrefix: '+51' },
  { code: 'CL', name: 'Chile',   flag: '🇨🇱', currency: 'Peso Chileno', currencyCode: 'CLP', phonePrefix: '+56' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', currency: 'Dólar',        currencyCode: 'USD', phonePrefix: '+593' },
];

/** Catálogo completo de países disponibles para agregar */
export const AVAILABLE_COUNTRIES: Country[] = [
  { code: 'AR', name: 'Argentina',  flag: '🇦🇷', currency: 'Peso Argentino',  currencyCode: 'ARS', phonePrefix: '+54' },
  { code: 'BO', name: 'Bolivia',    flag: '🇧🇴', currency: 'Boliviano',        currencyCode: 'BOB', phonePrefix: '+591' },
  { code: 'BR', name: 'Brasil',     flag: '🇧🇷', currency: 'Real',             currencyCode: 'BRL', phonePrefix: '+55' },
  { code: 'CO', name: 'Colombia',   flag: '🇨🇴', currency: 'Peso Colombiano',  currencyCode: 'COP', phonePrefix: '+57' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', currency: 'Colón',            currencyCode: 'CRC', phonePrefix: '+506' },
  { code: 'CU', name: 'Cuba',       flag: '🇨🇺', currency: 'Peso Cubano',      currencyCode: 'CUP', phonePrefix: '+53' },
  { code: 'DO', name: 'Rep. Dominicana', flag: '🇩🇴', currency: 'Peso Dominicano', currencyCode: 'DOP', phonePrefix: '+1' },
  { code: 'GT', name: 'Guatemala',  flag: '🇬🇹', currency: 'Quetzal',          currencyCode: 'GTQ', phonePrefix: '+502' },
  { code: 'HN', name: 'Honduras',   flag: '🇭🇳', currency: 'Lempira',          currencyCode: 'HNL', phonePrefix: '+504' },
  { code: 'MX', name: 'México',     flag: '🇲🇽', currency: 'Peso Mexicano',    currencyCode: 'MXN', phonePrefix: '+52' },
  { code: 'NI', name: 'Nicaragua',  flag: '🇳🇮', currency: 'Córdoba',          currencyCode: 'NIO', phonePrefix: '+505' },
  { code: 'PA', name: 'Panamá',     flag: '🇵🇦', currency: 'Balboa',           currencyCode: 'PAB', phonePrefix: '+507' },
  { code: 'PY', name: 'Paraguay',   flag: '🇵🇾', currency: 'Guaraní',          currencyCode: 'PYG', phonePrefix: '+595' },
  { code: 'SV', name: 'El Salvador',flag: '🇸🇻', currency: 'Dólar',            currencyCode: 'USD', phonePrefix: '+503' },
  { code: 'UY', name: 'Uruguay',    flag: '🇺🇾', currency: 'Peso Uruguayo',    currencyCode: 'UYU', phonePrefix: '+598' },
  { code: 'VE', name: 'Venezuela',  flag: '🇻🇪', currency: 'Bolívar',          currencyCode: 'VES', phonePrefix: '+58' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', currency: 'Dólar',        currencyCode: 'USD', phonePrefix: '+1' },
  { code: 'ES', name: 'España',     flag: '🇪🇸', currency: 'Euro',             currencyCode: 'EUR', phonePrefix: '+34' },
];

const STORAGE_KEY = 'prontopaga_active_countries';

/** Lee los países activos desde localStorage (o devuelve los por defecto) */
export function getActiveCountries(): Country[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const codes: string[] = JSON.parse(stored);
      // Reconstruir desde el catálogo completo para tener datos actualizados
      const all = [...DEFAULT_COUNTRIES, ...AVAILABLE_COUNTRIES];
      return codes
        .map(code => all.find(c => c.code === code))
        .filter(Boolean) as Country[];
    }
  } catch {
    // ignore
  }
  return DEFAULT_COUNTRIES;
}

/** Guarda la lista de códigos activos en localStorage */
export function saveActiveCountries(countries: Country[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(countries.map(c => c.code)));
}

/** Devuelve los países del catálogo que aún no están activos */
export function getAvailableToAdd(active: Country[]): Country[] {
  const activeCodes = new Set(active.map(c => c.code));
  return AVAILABLE_COUNTRIES.filter(c => !activeCodes.has(c.code));
}
