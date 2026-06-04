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
  // América
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', currency: 'Peso Argentino', currencyCode: 'ARS', phonePrefix: '+54' },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴', currency: 'Boliviano', currencyCode: 'BOB', phonePrefix: '+591' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'Real', currencyCode: 'BRL', phonePrefix: '+55' },
  { code: 'CA', name: 'Canadá', flag: '🇨🇦', currency: 'Dólar Canadiense', currencyCode: 'CAD', phonePrefix: '+1' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', currency: 'Peso Colombiano', currencyCode: 'COP', phonePrefix: '+57' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', currency: 'Colón', currencyCode: 'CRC', phonePrefix: '+506' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺', currency: 'Peso Cubano', currencyCode: 'CUP', phonePrefix: '+53' },
  { code: 'CW', name: 'Curazao', flag: '🇨🇼', currency: 'Florín', currencyCode: 'ANG', phonePrefix: '+599' },
  { code: 'BZ', name: 'Belice', flag: '🇧🇿', currency: 'Dólar Beliceño', currencyCode: 'BZD', phonePrefix: '+501' },
  { code: 'DO', name: 'Rep. Dominicana', flag: '🇩🇴', currency: 'Peso Dominicano', currencyCode: 'DOP', phonePrefix: '+1' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹', currency: 'Quetzal', currencyCode: 'GTQ', phonePrefix: '+502' },
  { code: 'HN', name: 'Honduras', flag: '🇭🇳', currency: 'Lempira', currencyCode: 'HNL', phonePrefix: '+504' },
  { code: 'HT', name: 'Haití', flag: '🇭🇹', currency: 'Gourde', currencyCode: 'HTG', phonePrefix: '+509' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲', currency: 'Dólar Jamaiquino', currencyCode: 'JMD', phonePrefix: '+1' },
  { code: 'MX', name: 'México', flag: '🇲🇽', currency: 'Peso Mexicano', currencyCode: 'MXN', phonePrefix: '+52' },
  { code: 'NI', name: 'Nicaragua', flag: '🇳🇮', currency: 'Córdoba', currencyCode: 'NIO', phonePrefix: '+505' },
  { code: 'PA', name: 'Panamá', flag: '🇵🇦', currency: 'Balboa', currencyCode: 'PAB', phonePrefix: '+507' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾', currency: 'Guaraní', currencyCode: 'PYG', phonePrefix: '+595' },
  { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷', currency: 'Dólar', currencyCode: 'USD', phonePrefix: '+1' },
  { code: 'SV', name: 'El Salvador', flag: '🇸🇻', currency: 'Dólar', currencyCode: 'USD', phonePrefix: '+503' },
  { code: 'TT', name: 'Trinidad y Tobago', flag: '🇹🇹', currency: 'Dólar Trinitense', currencyCode: 'TTD', phonePrefix: '+1' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', currency: 'Dólar', currencyCode: 'USD', phonePrefix: '+1' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾', currency: 'Peso Uruguayo', currencyCode: 'UYU', phonePrefix: '+598' },
  { code: 'VE', name: 'Venezuela', flag: '🇻🇪', currency: 'Bolívar', currencyCode: 'VES', phonePrefix: '+58' },
  // Europa
  { code: 'DE', name: 'Alemania', flag: '🇩🇪', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+49' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+43' },
  { code: 'BE', name: 'Bélgica', flag: '🇧🇪', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+32' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', currency: 'Lev', currencyCode: 'BGN', phonePrefix: '+359' },
  { code: 'HR', name: 'Croacia', flag: '🇭🇷', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+385' },
  { code: 'DK', name: 'Dinamarca', flag: '🇩🇰', currency: 'Corona Danesa', currencyCode: 'DKK', phonePrefix: '+45' },
  { code: 'ES', name: 'España', flag: '🇪🇸', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+34' },
  { code: 'FI', name: 'Finlandia', flag: '🇫🇮', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+358' },
  { code: 'FR', name: 'Francia', flag: '🇫🇷', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+33' },
  { code: 'GR', name: 'Grecia', flag: '🇬🇷', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+30' },
  { code: 'HU', name: 'Hungría', flag: '🇭🇺', currency: 'Forinto', currencyCode: 'HUF', phonePrefix: '+36' },
  { code: 'IE', name: 'Irlanda', flag: '🇮🇪', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+353' },
  { code: 'IT', name: 'Italia', flag: '🇮🇹', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+39' },
  { code: 'NL', name: 'Países Bajos', flag: '🇳🇱', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+31' },
  { code: 'NO', name: 'Noruega', flag: '🇳🇴', currency: 'Corona Noruega', currencyCode: 'NOK', phonePrefix: '+47' },
  { code: 'PL', name: 'Polonia', flag: '🇵🇱', currency: 'Zloty', currencyCode: 'PLN', phonePrefix: '+48' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+351' },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧', currency: 'Libra Esterlina', currencyCode: 'GBP', phonePrefix: '+44' },
  { code: 'CZ', name: 'Rep. Checa', flag: '🇨🇿', currency: 'Corona Checa', currencyCode: 'CZK', phonePrefix: '+420' },
  { code: 'RO', name: 'Rumania', flag: '🇷🇴', currency: 'Leu', currencyCode: 'RON', phonePrefix: '+40' },
  { code: 'RU', name: 'Rusia', flag: '🇷🇺', currency: 'Rublo', currencyCode: 'RUB', phonePrefix: '+7' },
  { code: 'SE', name: 'Suecia', flag: '🇸🇪', currency: 'Corona Sueca', currencyCode: 'SEK', phonePrefix: '+46' },
  { code: 'CH', name: 'Suiza', flag: '🇨🇭', currency: 'Franco Suizo', currencyCode: 'CHF', phonePrefix: '+41' },
  { code: 'TR', name: 'Turquía', flag: '🇹🇷', currency: 'Lira Turca', currencyCode: 'TRY', phonePrefix: '+90' },
  { code: 'UA', name: 'Ucrania', flag: '🇺🇦', currency: 'Grivna', currencyCode: 'UAH', phonePrefix: '+380' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+356' },
  { code: 'CY', name: 'Chipre', flag: '🇨🇾', currency: 'Euro', currencyCode: 'EUR', phonePrefix: '+357' },
  // Asia
  { code: 'CN', name: 'China', flag: '🇨🇳', currency: 'Yuan', currencyCode: 'CNY', phonePrefix: '+86' },
  { code: 'KR', name: 'Corea del Sur', flag: '🇰🇷', currency: 'Won', currencyCode: 'KRW', phonePrefix: '+82' },
  { code: 'AE', name: 'Emiratos Árabes', flag: '🇦🇪', currency: 'Dírham', currencyCode: 'AED', phonePrefix: '+971' },
  { code: 'PH', name: 'Filipinas', flag: '🇵🇭', currency: 'Peso Filipino', currencyCode: 'PHP', phonePrefix: '+63' },
  { code: 'IN', name: 'India', flag: '🇮🇳', currency: 'Rupia', currencyCode: 'INR', phonePrefix: '+91' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', currency: 'Rupia', currencyCode: 'IDR', phonePrefix: '+62' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', currency: 'Shekel', currencyCode: 'ILS', phonePrefix: '+972' },
  { code: 'JP', name: 'Japón', flag: '🇯🇵', currency: 'Yen', currencyCode: 'JPY', phonePrefix: '+81' },
  { code: 'MY', name: 'Malasia', flag: '🇲🇾', currency: 'Ringgit', currencyCode: 'MYR', phonePrefix: '+60' },
  { code: 'PK', name: 'Pakistán', flag: '🇵🇰', currency: 'Rupia', currencyCode: 'PKR', phonePrefix: '+92' },
  { code: 'SA', name: 'Arabia Saudita', flag: '🇸🇦', currency: 'Riyal', currencyCode: 'SAR', phonePrefix: '+966' },
  { code: 'SG', name: 'Singapur', flag: '🇸🇬', currency: 'Dólar Singapur', currencyCode: 'SGD', phonePrefix: '+65' },
  { code: 'TH', name: 'Tailandia', flag: '🇹🇭', currency: 'Baht', currencyCode: 'THB', phonePrefix: '+66' },
  { code: 'TW', name: 'Taiwán', flag: '🇹🇼', currency: 'Dólar Taiwanés', currencyCode: 'TWD', phonePrefix: '+886' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', currency: 'Dong', currencyCode: 'VND', phonePrefix: '+84' },
  // África
  { code: 'ZA', name: 'Sudáfrica', flag: '🇿🇦', currency: 'Rand', currencyCode: 'ZAR', phonePrefix: '+27' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'Naira', currencyCode: 'NGN', phonePrefix: '+234' },
  { code: 'EG', name: 'Egipto', flag: '🇪🇬', currency: 'Libra Egipcia', currencyCode: 'EGP', phonePrefix: '+20' },
  { code: 'KE', name: 'Kenia', flag: '🇰🇪', currency: 'Chelín', currencyCode: 'KES', phonePrefix: '+254' },
  { code: 'MA', name: 'Marruecos', flag: '🇲🇦', currency: 'Dírham', currencyCode: 'MAD', phonePrefix: '+212' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', currency: 'Cedi', currencyCode: 'GHS', phonePrefix: '+233' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', currency: 'Chelín', currencyCode: 'TZS', phonePrefix: '+255' },
  // Oceanía
  { code: 'AU', name: 'Australia', flag: '🇦🇺', currency: 'Dólar Australiano', currencyCode: 'AUD', phonePrefix: '+61' },
  { code: 'NZ', name: 'Nueva Zelanda', flag: '🇳🇿', currency: 'Dólar Neozelandés', currencyCode: 'NZD', phonePrefix: '+64' },
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

/** Guarda la lista de códigos activos en localStorage y sincroniza con el servidor */
export function saveActiveCountries(countries: Country[]): void {
  const codes = countries.map(c => c.code);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  // Sync to server
  import('./api').then(({ default: api }) => {
    api.put('/config/countries', codes).catch(err => {
      console.warn('[Countries] Error syncing to server:', err.message);
    });
  });
}

/** Devuelve los países del catálogo que aún no están activos */
export function getAvailableToAdd(active: Country[]): Country[] {
  const activeCodes = new Set(active.map(c => c.code));
  return AVAILABLE_COUNTRIES.filter(c => !activeCodes.has(c.code));
}
