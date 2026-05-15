interface Props {
  className?: string;
  /** 'full' = logotipo completo | 'icon' = solo isotipo */
  variant?: 'full' | 'icon';
}

/**
 * Logo oficial de ProntoPaga
 * Fuente: https://www2.prontopaga.com/wp-content/uploads/2024/11/logotipo2.svg
 * Colores de marca: Negro #1A1A1A, Rosa/Rojo #F0184A, Gris, Blanco
 */
export default function ProntoPagaLogo({ className = '', variant = 'full' }: Props) {
  if (variant === 'icon') {
    // Isotipo: "PP" estilizado con el rojo de marca
    return (
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="ProntoPaga"
      >
        <rect width="40" height="40" rx="10" fill="#F0184A" />
        <text
          x="50%"
          y="55%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="white"
          fontSize="16"
          fontWeight="800"
          fontFamily="Inter, system-ui, sans-serif"
          letterSpacing="-1"
        >
          PP
        </text>
      </svg>
    );
  }

  // Logo completo: imagen del SVG oficial con fallback inline
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src="https://www2.prontopaga.com/wp-content/uploads/2024/11/logotipo2.svg"
        alt="ProntoPaga"
        className={className}
        onError={(e) => {
          // Ocultar imagen y mostrar fallback
          const target = e.currentTarget;
          target.style.display = 'none';
          const fallback = target.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = 'flex';
        }}
      />
      <ProntoPagaLogoFallback className={className} />
    </div>
  );
}

/** Fallback inline cuando el SVG externo no carga */
export function ProntoPagaLogoFallback({ className = '' }: { className?: string }) {
  return (
    <div className={`items-center gap-2 ${className}`} style={{ display: 'none' }}>
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
        <rect width="40" height="40" rx="10" fill="#F0184A" />
        <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle"
          fill="white" fontSize="16" fontWeight="800"
          fontFamily="Inter, system-ui, sans-serif" letterSpacing="-1">PP</text>
      </svg>
      <span style={{ color: '#F0184A', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.5px' }}>
        ProntoPaga
      </span>
    </div>
  );
}
