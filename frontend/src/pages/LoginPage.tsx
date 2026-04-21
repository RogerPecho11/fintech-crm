import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import ProntoPagaLogo, { ProntoPagaLogoFallback } from '../components/ProntoPagaLogo';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Bienvenido al sistema');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {/* Background accent */}
      <div
        className="fixed top-0 left-0 right-0 h-1.5"
        style={{ background: 'linear-gradient(90deg, #FC2B5F 0%, #ff6b95 100%)' }}
      />

      <div className="w-full max-w-md">

        {/* Logo card */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3">
            {/* Logo oficial */}
            <div className="flex items-center justify-center">
              <ProntoPagaLogo className="h-12 w-auto" variant="full" />
              <ProntoPagaLogoFallback className="h-12" />
            </div>
            <div>
              <p className="text-gray-500 text-sm mt-1">Sistema de Gestión de Comercios</p>
            </div>
          </div>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">Iniciar sesión</h2>
            <p className="text-sm text-gray-500 mt-1">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <input
                type="email"
                className="input"
                placeholder="usuario@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-2.5 mt-2 text-sm"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Ingresando...
                </span>
              ) : 'Ingresar'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Acceso rápido — Demo
            </p>
            <div className="space-y-2">
              {[
                { role: 'Admin', email: 'admin@fintechcrm.com', pass: 'Admin123!' },
                { role: 'Comercial', email: 'commercial@fintechcrm.com', pass: 'Commercial123!' },
                { role: 'Onboarding', email: 'onboarding@fintechcrm.com', pass: 'Onboarding123!' },
              ].map(cred => (
                <button
                  key={cred.role}
                  type="button"
                  onClick={() => { setEmail(cred.email); setPassword(cred.pass); }}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100
                             border border-gray-200 transition-colors group"
                >
                  <span
                    className="text-xs font-semibold"
                    style={{ color: '#FC2B5F' }}
                  >
                    {cred.role}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">{cred.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} ProntoPaga · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
