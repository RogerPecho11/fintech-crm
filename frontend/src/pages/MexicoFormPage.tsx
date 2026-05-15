import { useState } from 'react';
import { CheckCircle, Upload, Loader2 } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

export default function MexicoFormPage() {
  const [form, setForm] = useState({
    giro: '',
    mcc: '',
    trade_name: '',
    legal_name: '',
    rfc: '',
    address: '',
    postal_code: '',
    website: '',
    phone: '',
  });
  const [files, setFiles] = useState<Record<string, File | null>>({
    fiscal_doc: null,
    ine_doc: null,
    domicilio_doc: null,
    acta_doc: null,
    licencia_doc: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));
  const setFile = (field: string, file: File | null) => setFiles(prev => ({ ...prev, [field]: file }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.trade_name || !form.giro) {
      setError('Nombre del comercio y Giro son obligatorios.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, val]) => formData.append(key, val));
      Object.entries(files).forEach(([key, file]) => { if (file) formData.append(key, file); });

      await axios.post(`${API_URL}/mexico/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar el formulario. Intente nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Formulario Enviado!</h2>
          <p className="text-gray-600">Su información ha sido recibida exitosamente. Nos pondremos en contacto pronto.</p>
        </div>
      </div>
    );
  }

  const ic = 'w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-400 bg-white';
  const lc = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <img src="https://certificaciones.emprendepago.com/logo-prontopaga.png" alt="ProntoPaga" className="h-10" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Formulario de Registro — México</h1>
            <p className="text-xs text-gray-500">Complete la información de su comercio</p>
          </div>
        </div>
      </div>

      {/* Notice */}
      <div className="max-w-3xl mx-auto px-6 mt-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            <strong>Nota importante:</strong> Este cuestionario deberá ser completado por un director, administrador, socio, empleado o apoderado de la empresa debidamente autorizado. Confidencialidad y Tratamiento de Datos Personales.*
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-6 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Giro */}
          <div>
            <label className={lc}>Giro *</label>
            <select className={ic} value={form.giro} onChange={e => set('giro', e.target.value)} required>
              <option value="">Seleccionar</option>
              <option value="Ecommerce">Ecommerce</option>
              <option value="Gambling">Gambling</option>
            </select>
          </div>

          {/* MCC */}
          <div>
            <label className={lc}>MCC *</label>
            <input type="text" className={ic} value={form.mcc} onChange={e => set('mcc', e.target.value)} placeholder="Código MCC (numérico)" required />
          </div>

          {/* Nombre comercio */}
          <div>
            <label className={lc}>Nombre del comercio *</label>
            <input className={ic} value={form.trade_name} onChange={e => set('trade_name', e.target.value)} placeholder="Nombre de marca" required />
          </div>

          {/* Nombre legal */}
          <div>
            <label className={lc}>Nombre legal del comercio *</label>
            <input className={ic} value={form.legal_name} onChange={e => set('legal_name', e.target.value)} placeholder="Razón social completa" required />
          </div>

          {/* RFC */}
          <div>
            <label className={lc}>Razón Social (RFC) *</label>
            <input className={ic} value={form.rfc} onChange={e => set('rfc', e.target.value)} placeholder="RFC del comercio" required />
          </div>

          {/* Constancia fiscal */}
          <div>
            <label className={lc}>Constancia de situación fiscal *</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" id="fiscal_doc"
                onChange={e => setFile('fiscal_doc', e.target.files?.[0] || null)} />
              <label htmlFor="fiscal_doc" className="cursor-pointer flex items-center justify-center gap-2">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">{files.fiscal_doc?.name || 'Click para subir archivo'}</span>
              </label>
            </div>
          </div>

          {/* INE */}
          <div>
            <label className={lc}>INE de Representante legal *</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" id="ine_doc"
                onChange={e => setFile('ine_doc', e.target.files?.[0] || null)} />
              <label htmlFor="ine_doc" className="cursor-pointer flex items-center justify-center gap-2">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">{files.ine_doc?.name || 'Click para subir archivo'}</span>
              </label>
            </div>
          </div>

          {/* Comprobante domicilio */}
          <div>
            <label className={lc}>Comprobante de domicilio *</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" id="domicilio_doc"
                onChange={e => setFile('domicilio_doc', e.target.files?.[0] || null)} />
              <label htmlFor="domicilio_doc" className="cursor-pointer flex items-center justify-center gap-2">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">{files.domicilio_doc?.name || 'Click para subir archivo'}</span>
              </label>
            </div>
          </div>

          {/* Acta constitutiva */}
          <div>
            <label className={lc}>Acta constitutiva *</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" id="acta_doc"
                onChange={e => setFile('acta_doc', e.target.files?.[0] || null)} />
              <label htmlFor="acta_doc" className="cursor-pointer flex items-center justify-center gap-2">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">{files.acta_doc?.name || 'Click para subir archivo'}</span>
              </label>
            </div>
          </div>

          {/* Licencia casino (solo Gambling) */}
          {form.giro === 'Gambling' && (
            <div>
              <label className={lc}>Licencia del casino para poder operar (certificado) *</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" id="licencia_doc"
                  onChange={e => setFile('licencia_doc', e.target.files?.[0] || null)} />
                <label htmlFor="licencia_doc" className="cursor-pointer flex items-center justify-center gap-2">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-600">{files.licencia_doc?.name || 'Click para subir archivo'}</span>
                </label>
              </div>
            </div>
          )}

          {/* Dirección */}
          <div>
            <label className={lc}>Dirección con país, ciudad y estado del comercio *</label>
            <input className={ic} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Calle, Ciudad, Estado, México" required />
          </div>

          {/* Código postal */}
          <div>
            <label className={lc}>Código postal *</label>
            <input type="text" className={ic} value={form.postal_code} onChange={e => set('postal_code', e.target.value)} placeholder="00000" required />
          </div>

          {/* Sitio web */}
          <div>
            <label className={lc}>Sitio web *</label>
            <input className={ic} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://www.ejemplo.com" required />
          </div>

          {/* Teléfono */}
          <div>
            <label className={lc}>Número de teléfono *</label>
            <input type="tel" className={ic} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+52 55 1234 5678" required />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 transition-colors"
            style={{ background: '#F0184A' }}
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Enviar Formulario'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          © {new Date().getFullYear()} ProntoPaga. Todos los derechos reservados.
        </p>
      </form>
    </div>
  );
}
