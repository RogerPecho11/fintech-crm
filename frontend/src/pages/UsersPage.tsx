import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Users, Shield, Pencil, KeyRound } from 'lucide-react';
import api from '../lib/api';
import { User } from '../types';
import { getInitials, timeAgo } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserForm {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: string;
  phone: string;
}

const emptyForm: UserForm = {
  first_name: '', last_name: '', email: '',
  password: '', role: 'commercial', phone: '',
};

const roleColors: Record<string, string> = {
  admin:      'bg-purple-50 text-purple-600',
  commercial: 'bg-blue-50 text-blue-600',
  onboarding: 'bg-green-50 text-green-600',
};

const roleLabels: Record<string, string> = {
  admin: 'Administrador', commercial: 'Comercial', onboarding: 'Onboarding',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // Modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'password' | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createUser = useMutation({
    mutationFn: (data: any) => api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
      toast.success('Usuario creado exitosamente');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al crear usuario'),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
      toast.success('Usuario actualizado');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al actualizar usuario'),
  });

  const changePassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.put(`/users/${id}`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
      toast.success('Contraseña actualizada');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Error al cambiar contraseña'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/users/${id}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: () => toast.error('Error al cambiar estado'),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(emptyForm);
    setSelectedUser(null);
    setModalMode('create');
  };

  const openEdit = (u: User) => {
    setForm({
      first_name: u.first_name,
      last_name:  u.last_name,
      email:      u.email,
      password:   '',
      role:       u.role,
      phone:      u.phone || '',
    });
    setSelectedUser(u);
    setModalMode('edit');
  };

  const openPassword = (u: User) => {
    setSelectedUser(u);
    setNewPassword('');
    setConfirmPassword('');
    setModalMode('password');
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedUser(null);
    setForm(emptyForm);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = () => {
    if (modalMode === 'create') {
      createUser.mutate(form);
    } else if (modalMode === 'edit' && selectedUser) {
      const payload: any = {
        first_name: form.first_name,
        last_name:  form.last_name,
        role:       form.role,
        phone:      form.phone || null,
      };
      // Only update email if changed
      if (form.email !== selectedUser.email) payload.email = form.email;
      updateUser.mutate({ id: selectedUser.id, data: payload });
    }
  };

  const handlePasswordChange = () => {
    if (newPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    changePassword.mutate({ id: selectedUser!.id, password: newPassword });
  };

  const isSubmitting = createUser.isPending || updateUser.isPending;
  const isCreateValid = form.email && form.password.length >= 8 && form.first_name && form.last_name;
  const isEditValid   = form.first_name && form.last_name && form.email;

  // ── Guard ─────────────────────────────────────────────────────────────────────

  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <Shield className="w-12 h-12 mb-3 opacity-30" />
        <p>Acceso restringido a administradores</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-500 text-sm mt-1">{users?.length || 0} usuarios registrados</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: '#FC2B5F', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="table-header">Usuario</th>
                <th className="table-header">Rol</th>
                <th className="table-header">Teléfono</th>
                <th className="table-header">Último acceso</th>
                <th className="table-header">Estado</th>
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(users || []).map(u => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  {/* Avatar + nombre */}
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: '#FC2B5F' }}
                      >
                        {getInitials(`${u.first_name} ${u.last_name}`)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{u.first_name} {u.last_name}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Rol */}
                  <td className="table-cell">
                    <span className={`badge ${roleColors[u.role] || 'bg-gray-100 text-gray-500'}`}>
                      {roleLabels[u.role] || u.role}
                    </span>
                  </td>

                  {/* Teléfono */}
                  <td className="table-cell text-gray-500">{u.phone || '—'}</td>

                  {/* Último acceso */}
                  <td className="table-cell text-xs text-gray-500">
                    {u.last_login ? timeAgo(u.last_login) : 'Nunca'}
                  </td>

                  {/* Estado */}
                  <td className="table-cell">
                    <span className={`badge ${u.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>

                  {/* Acciones */}
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      {/* Editar */}
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar usuario"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {/* Cambiar contraseña */}
                      <button
                        onClick={() => openPassword(u)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                        title="Cambiar contraseña"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>

                      {/* Activar / Desactivar */}
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => toggleActive.mutate({ id: u.id, is_active: !u.is_active })}
                          className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                            u.is_active
                              ? 'text-red-500 hover:bg-red-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {u.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal Crear / Editar ─────────────────────────────────────────────── */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}
                </h3>
                {modalMode === 'edit' && selectedUser && (
                  <p className="text-xs text-gray-500 mt-0.5">{selectedUser.email}</p>
                )}
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Nombre y apellido */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nombre *</label>
                  <input
                    className="input"
                    value={form.first_name}
                    onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                    placeholder="Juan"
                  />
                </div>
                <div>
                  <label className="label">Apellido *</label>
                  <input
                    className="input"
                    value={form.last_name}
                    onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                    placeholder="Pérez"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="label">Email *</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                />
              </div>

              {/* Contraseña — solo en creación */}
              {modalMode === 'create' && (
                <div>
                  <label className="label">Contraseña *</label>
                  <input
                    type="password"
                    className="input"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
              )}

              {/* Rol y teléfono */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Rol *</label>
                  <select
                    className="input"
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  >
                    <option value="commercial">Comercial</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+51 999 999 999"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={closeModal} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || (modalMode === 'create' ? !isCreateValid : !isEditValid)}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                {isSubmitting
                  ? 'Guardando...'
                  : modalMode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Cambiar Contraseña ─────────────────────────────────────────── */}
      {modalMode === 'password' && selectedUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Cambiar Contraseña</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedUser.first_name} {selectedUser.last_name}
                </p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Nueva contraseña *</label>
                <input
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label className="label">Confirmar contraseña *</label>
                <input
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={closeModal} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={handlePasswordChange}
                disabled={
                  changePassword.isPending ||
                  newPassword.length < 8 ||
                  newPassword !== confirmPassword
                }
                className="btn-primary flex-1 disabled:opacity-40"
              >
                {changePassword.isPending ? 'Guardando...' : 'Cambiar Contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
