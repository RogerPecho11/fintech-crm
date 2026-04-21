import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, CheckSquare, Calendar, BarChart3,
  Users, Bell, Webhook, LogOut, Menu, X, Wifi, WifiOff
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getInitials } from '../lib/utils';
import NotificationBell from './NotificationBell';
import ProntoPagaLogo, { ProntoPagaLogoFallback } from './ProntoPagaLogo';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true, roles: ['admin', 'commercial', 'onboarding'] },
  { to: '/merchants', icon: Building2, label: 'Comercios',     roles: ['admin', 'commercial', 'onboarding'] },
  { to: '/tasks', icon: CheckSquare, label: 'Tareas',          roles: ['admin', 'onboarding'] },
  { to: '/calendar', icon: Calendar, label: 'Calendario',      roles: ['admin', 'onboarding'] },
  { to: '/reports', icon: BarChart3, label: 'Reportes',        roles: ['admin', 'commercial', 'onboarding'] },
  { to: '/notifications', icon: Bell, label: 'Notificaciones', roles: ['admin', 'commercial', 'onboarding'] },
];

const adminItems = [
  { to: '/users', icon: Users, label: 'Usuarios' },
  { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel = {
    admin: 'Administrador',
    commercial: 'Comercial',
    onboarding: 'Onboarding',
  }[user?.role || 'commercial'];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 w-64
        bg-white border-r border-gray-200 flex flex-col
        transition-transform duration-300 shadow-sm
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ProntoPagaLogo className="h-8 w-auto max-w-[140px] object-contain" variant="full" />
            <ProntoPagaLogoFallback />
          </div>
          <button
            className="ml-auto lg:hidden text-gray-400 hover:text-gray-700"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CRM label */}
        <div className="px-5 py-2 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            CRM · Gestión de Comercios
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems
            .filter(item => item.roles.includes(user?.role || ''))
            .map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}

          {user?.role === 'admin' && (
            <>
              <div className="pt-4 pb-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3">
                  Administración
                </p>
              </div>
              {adminItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3 px-2 py-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ backgroundColor: '#FC2B5F' }}
            >
              {getInitials(`${user?.first_name} ${user?.last_name}`)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-gray-500 truncate">{roleLabel}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 px-2 mt-1">
            {isConnected ? (
              <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-xs text-emerald-600">Conectado</span></>
            ) : (
              <><WifiOff className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-400">Desconectado</span></>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 flex-shrink-0 shadow-sm">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-900"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
