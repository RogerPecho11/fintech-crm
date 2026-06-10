import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder: string;
  searchable?: boolean;
}

export default function MultiSelect({ options, selected, onChange, placeholder, searchable = true }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const removeItem = (val: string) => {
    onChange(selected.filter(v => v !== val));
  };

  const filteredOptions = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedLabels = selected.map(s => {
    const opt = options.find(o => o.value === s);
    return opt ? opt.label : s;
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input text-sm flex items-center gap-2 min-w-[180px] w-full justify-between text-left"
      >
        <span className="truncate">
          {selected.length === 0 ? placeholder : `${selected.length} seleccionado${selected.length > 1 ? 's' : ''}`}
        </span>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Chips de seleccionados */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selectedLabels.map((label, i) => (
            <span key={selected[i]} className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-700 text-xs rounded-full border border-pink-200">
              <span className="truncate max-w-[150px]">{label}</span>
              <button type="button" onClick={() => removeItem(selected[i])} className="hover:text-pink-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-72 max-h-60 overflow-hidden bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-pink-400"
                autoFocus
              />
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-xs text-gray-400 text-center">Sin resultados</div>
            ) : (
              <>
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border-b border-gray-100"
                  >
                    Limpiar selección
                  </button>
                )}
                {filteredOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt.value)}
                      onChange={() => toggle(opt.value)}
                      className="rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
