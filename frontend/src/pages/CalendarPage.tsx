import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, X, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../lib/api';
import { CalendarEvent } from '../types';
import toast from 'react-hot-toast';

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', start_time: '', end_time: '', all_day: false,
    location: '', color: '#3B82F6', reminder_minutes: 30,
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const { data: events } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar', format(currentDate, 'yyyy-MM')],
    queryFn: () => api.get('/calendar/events', {
      params: {
        start: monthStart.toISOString(),
        end: monthEnd.toISOString(),
      }
    }).then(r => r.data),
  });

  const createEvent = useMutation({
    mutationFn: (data: any) => api.post('/calendar/events', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setShowModal(false);
      toast.success('Evento creado');
    },
  });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => api.delete(`/calendar/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Evento eliminado');
    },
  });

  const getEventsForDay = (day: Date) =>
    (events || []).filter(e => isSameDay(new Date(e.start_time), day));

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  const openCreateModal = (day?: Date) => {
    if (day) {
      const dateStr = format(day, "yyyy-MM-dd'T'HH:mm");
      setForm(f => ({ ...f, start_time: dateStr }));
    }
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendario</h1>
          <p className="text-gray-500 text-sm mt-1">Eventos y recordatorios</p>
        </div>
        <button onClick={() => openCreateModal()} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Evento
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 card bg-white">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCurrentDate(d => subMonths(d, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h2 className="font-semibold text-gray-900 capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: es })}
            </h2>
            <button onClick={() => setCurrentDate(d => addMonths(d, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for first week */}
            {Array.from({ length: monthStart.getDay() }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {days.map(day => {
              const dayEvents = getEventsForDay(day);
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDay && isSameDay(day, selectedDay);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  onDoubleClick={() => openCreateModal(day)}
                  className={`
                    relative p-1.5 rounded-lg text-sm transition-colors min-h-[60px] text-left
                    ${isSelected ? 'bg-rose-50' : 'hover:bg-gray-50'}
                  `}
                  style={isSelected ? { borderWidth: 1, borderStyle: 'solid', borderColor: '#F0184A' } : isToday ? { outline: '1px solid #F0184A', outlineOffset: '-1px' } : undefined}
                >
                  <span className="text-xs font-medium" style={isToday ? { color: '#F0184A' } : { color: '#6b7280' }}>
                    {format(day, 'd')}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map(e => (
                      <div
                        key={e.id}
                        className="text-xs px-1 py-0.5 rounded truncate"
                        style={{ backgroundColor: e.color + '33', color: e.color }}
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-gray-400">+{dayEvents.length - 2} más</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day events */}
        <div className="card bg-white border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">
              {selectedDay ? format(selectedDay, "d 'de' MMMM", { locale: es }) : 'Selecciona un día'}
            </h3>
            {selectedDay && (
              <button onClick={() => openCreateModal(selectedDay)} className="hover:opacity-70 transition-opacity" style={{ color: '#F0184A' }}>
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {selectedDayEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin eventos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayEvents.map(event => (
                <div key={event.id} className="p-3 rounded-lg border-l-4" style={{ borderColor: event.color, backgroundColor: event.color + '11' }}>
                  <div className="flex items-start justify-between">
                    <p className="font-medium text-gray-900 text-sm">{event.title}</p>
                    <button
                      onClick={() => deleteEvent.mutate(event.id)}
                      className="text-gray-400 hover:text-red-400 ml-2"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {event.description && <p className="text-xs text-gray-500 mt-1">{event.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {format(new Date(event.start_time), 'HH:mm')}
                    {event.end_time && ` - ${format(new Date(event.end_time), 'HH:mm')}`}
                  </p>
                  {event.merchant_name && (
                    <p className="text-xs mt-1" style={{ color: '#F0184A' }}>{event.merchant_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Event Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Nuevo Evento</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Título *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input h-16 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Inicio *</label>
                  <input type="datetime-local" className="input" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Fin</label>
                  <input type="datetime-local" className="input" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Color</label>
                  <input type="color" className="input h-10 p-1 cursor-pointer" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Recordatorio (min)</label>
                  <input type="number" className="input" value={form.reminder_minutes} onChange={e => setForm(f => ({ ...f, reminder_minutes: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="label">Ubicación</label>
                <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={() => createEvent.mutate(form)}
                disabled={!form.title || !form.start_time || createEvent.isPending}
                className="btn-primary flex-1"
              >
                Crear Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
