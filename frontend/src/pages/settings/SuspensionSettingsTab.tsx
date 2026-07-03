/**
 * Ajustes de Sistema — contenedor de la pestaña "Suspensión" en SettingsPage.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Clock, Bell, ClipboardList, Hash, X, Plus, Check, Edit2, Trash2, Save, Loader2 } from 'lucide-react'
import {
  getSystemSettings, updateSuspension, updateCatalogs,
  type SuspensionSettings, type CatalogSettings,
} from '@/services/systemSettings'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

const DEFAULT_MOTIVOS = ['Falta de pago', 'Solicitud del cliente', 'Mantenimiento', 'Incumplimiento de contrato']
const DEFAULT_FECHAS_CORTE = [1, 5, 10, 15, 28]

function SuspensionSettingsForm({
  data, catalogs, onSaved, setStatusMessage,
}: { data: SuspensionSettings; catalogs: CatalogSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const [dirty, setDirty] = useState(false)
  const [motivos, setMotivos] = useState<string[]>([])
  const [newMotivo, setNewMotivo] = useState('')

  const [fechasCorte, setFechasCorte] = useState<number[]>([])
  const [newFechaCorteInput, setNewFechaCorteInput] = useState('')
  const [editingFechaCorteDay, setEditingFechaCorteDay] = useState<number | null>(null)
  const [editingFechaCorteVal, setEditingFechaCorteVal] = useState('')

  const mutation = useMutation({
    mutationFn: updateSuspension,
    onSuccess: () => onSaved(),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la suspensión.' })
    },
  })

  const catalogsMutation = useMutation({
    mutationFn: updateCatalogs,
    onSuccess: () => onSaved(),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar el catálogo.' })
    },
  })

  useEffect(() => {
    if (data.suspension_motivos && data.suspension_motivos.length > 0) {
      setMotivos(data.suspension_motivos)
    } else {
      setMotivos(DEFAULT_MOTIVOS)
      mutation.mutate({ suspension_motivos: DEFAULT_MOTIVOS })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.suspension_motivos])

  const handleAddMotivo = (e: React.FormEvent) => {
    e.preventDefault()
    const val = newMotivo.trim()
    if (!val) return
    if (motivos.includes(val)) {
      setStatusMessage({ type: 'error', text: 'Este motivo ya existe.' })
      return
    }
    const updated = [...motivos, val]
    setMotivos(updated)
    mutation.mutate({ suspension_motivos: updated })
    setNewMotivo('')
    setStatusMessage({ type: 'success', text: `Motivo "${val}" agregado.` })
  }

  const handleDeleteMotivo = (val: string) => {
    const updated = motivos.filter((m) => m !== val)
    setMotivos(updated)
    mutation.mutate({ suspension_motivos: updated })
    setStatusMessage({ type: 'success', text: 'Motivo eliminado.' })
  }

  useEffect(() => {
    const loaded = catalogs.fechas_corte
    if (loaded && loaded.length > 0) {
      setFechasCorte(loaded)
    } else {
      setFechasCorte(DEFAULT_FECHAS_CORTE)
      catalogsMutation.mutate({ fechas_corte: DEFAULT_FECHAS_CORTE })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogs.fechas_corte])

  const handleAddFechaCorte = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseInt(newFechaCorteInput.trim(), 10)
    if (isNaN(val) || val < 1 || val > 31) {
      setStatusMessage({ type: 'error', text: 'Ingrese un día válido entre 1 y 31.' })
      return
    }
    if (fechasCorte.includes(val)) {
      setStatusMessage({ type: 'error', text: `El día ${val} ya está en la lista.` })
      return
    }
    const updated = [...fechasCorte, val].sort((a, b) => a - b)
    setFechasCorte(updated)
    catalogsMutation.mutate({ fechas_corte: updated })
    setNewFechaCorteInput('')
    setStatusMessage({ type: 'success', text: `Día ${val} agregado como fecha de corte.` })
  }

  const handleDeleteFechaCorte = (day: number) => {
    const updated = fechasCorte.filter((d) => d !== day)
    setFechasCorte(updated)
    catalogsMutation.mutate({ fechas_corte: updated })
    setStatusMessage({ type: 'success', text: `Día ${day} eliminado.` })
  }

  const handleSaveFechaCorte = (oldDay: number) => {
    const val = parseInt(editingFechaCorteVal.trim(), 10)
    if (isNaN(val) || val < 1 || val > 31) {
      setStatusMessage({ type: 'error', text: 'Ingrese un día válido entre 1 y 31.' })
      return
    }
    if (val !== oldDay && fechasCorte.includes(val)) {
      setStatusMessage({ type: 'error', text: `El día ${val} ya existe en la lista.` })
      return
    }
    const updated = fechasCorte.map((d) => (d === oldDay ? val : d)).sort((a, b) => a - b)
    setFechasCorte(updated)
    catalogsMutation.mutate({ fechas_corte: updated })
    setEditingFechaCorteDay(null)
    setStatusMessage({ type: 'success', text: `Fecha de corte actualizada a día ${val}.` })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Ban className="w-5 h-5 text-brand-400" />
          Políticas de Suspensión de Servicio
        </h3>
      </div>

      {/* Tarjeta: Motivos */}
      <div className="glass-card p-5 border border-border/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider">
            <ClipboardList className="w-4 h-4" /> Motivos de Suspensión Manual
          </div>
        </div>

        {motivos.length === 0 ? (
          <p className="text-xs text-muted-foreground italic p-3 text-center border border-dashed border-border/50 rounded-lg">
            No hay motivos configurados. Agrega al menos uno.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {motivos.map((motivo) => (
              <div key={motivo} className="group flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg bg-secondary/40 border border-border/60 text-sm text-foreground hover:border-destructive/40 transition-colors">
                <span>{motivo}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteMotivo(motivo)}
                  className="text-muted-foreground hover:text-destructive transition-colors opacity-40 group-hover:opacity-100"
                  title="Eliminar motivo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddMotivo} className="flex gap-2 pt-1">
          <input
            type="text"
            value={newMotivo}
            onChange={(e) => setNewMotivo(e.target.value)}
            placeholder="Agregar nuevo motivo..."
            className="input-field flex-1 text-sm"
          />
          <button
            type="submit"
            disabled={!newMotivo.trim()}
            className="btn-primary px-3 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Grid: Temporización + Notificaciones */}
      <form
        key={data ? 'loaded' : 'loading'}
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          mutation.mutate({
            suspension_automatica: target.suspensionAutomatica.checked,
            suspension_hora: parseInt(target.horaSuspension.value, 10),
            suspension_retraso_dias: parseInt(target.retrasoDias.value, 10),
            suspension_permitir_aplazamiento: target.permitirAplazamiento.checked,
            suspension_notify_suspendido: target.notifySuspendido.checked,
            suspension_notify_pospuesto: target.notifyPospuesto.checked,
          })
          setDirty(false)
          setStatusMessage({ type: 'success', text: 'Políticas de suspensión actualizadas correctamente.' })
        }}
        onChange={() => setDirty(true)}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Tarjeta: Temporización y Automatización */}
          <div className="glass-card p-5 border border-border/60 space-y-5">
            <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider">
              <Clock className="w-4 h-4" /> Temporización y Automatización
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Hora de corte (24h)
                </label>
                <input
                  name="horaSuspension"
                  type="number"
                  min="0"
                  max="23"
                  defaultValue={String(data.suspension_hora ?? 0)}
                  className="input-field font-mono"
                  placeholder="0"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Hora en la que se ejecutará la suspensión.
                </span>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Días de gracia
                </label>
                <input
                  name="retrasoDias"
                  type="number"
                  min="0"
                  defaultValue={String(data.suspension_retraso_dias ?? 0)}
                  className="input-field font-mono"
                  placeholder="0"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Días extra tras el vencimiento antes de suspender.
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/40">
              <div className="flex items-start gap-3">
                <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0 mt-0.5">
                  <input name="suspensionAutomatica" type="checkbox" defaultChecked={data.suspension_automatica ?? true} className="sr-only peer" />
                  <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                </label>
                <div>
                  <span className="text-sm font-medium text-foreground block">Suspensión automática por vencimiento</span>
                  <span className="text-xs text-muted-foreground">Suspende servicios con facturas vencidas de forma automática (se puede anular por cliente).</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0 mt-0.5">
                  <input name="permitirAplazamiento" type="checkbox" defaultChecked={data.suspension_permitir_aplazamiento ?? true} className="sr-only peer" />
                  <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                </label>
                <div>
                  <span className="text-sm font-medium text-foreground block">Permitir aplazamiento</span>
                  <span className="text-xs text-muted-foreground">Muestra la opción de aplazar la suspensión hasta una fecha específica al gestionar un cliente.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta: Notificaciones */}
          <div className="glass-card p-5 border border-border/60 space-y-5">
            <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider">
              <Bell className="w-4 h-4" /> Notificaciones de Suspensión
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20 border border-border/40">
                <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0 mt-0.5">
                  <input name="notifySuspendido" type="checkbox" defaultChecked={data.suspension_notify_suspendido ?? true} className="sr-only peer" />
                  <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                </label>
                <div>
                  <span className="text-sm font-medium text-foreground block">Al suspender el servicio</span>
                  <span className="text-xs text-muted-foreground">Notifica al cliente cuando su servicio ha sido suspendido.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20 border border-border/40">
                <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0 mt-0.5">
                  <input name="notifyPospuesto" type="checkbox" defaultChecked={data.suspension_notify_pospuesto ?? true} className="sr-only peer" />
                  <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                </label>
                <div>
                  <span className="text-sm font-medium text-foreground block">Al posponer la suspensión</span>
                  <span className="text-xs text-muted-foreground">Notifica al cliente cuando la suspensión ha sido aplazada manualmente desde el panel.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className={dirty ? 'btn-primary' : 'btn-secondary'}>
            <Save className="w-4 h-4" />
            Guardar
          </button>
        </div>
      </form>

      {/* Tarjeta: Fechas de Corte */}
      <div className="glass-card p-5 border border-border/60 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-wider">
            <Hash className="w-4 h-4" /> Fechas de Corte Disponibles
          </div>
          <span className="text-[10px] text-muted-foreground bg-secondary/40 px-2 py-0.5 rounded-full border border-border/40">
            {fechasCorte.length} fechas
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Días del mes disponibles para elegir como "Fecha de corte" al crear o editar un cliente
          (pestaña Facturación del formulario de cliente). Determinan el día de corte/vencimiento
          y, según la configuración de suspensión, cuándo se ejecuta la suspensión automática.
        </p>

        <form onSubmit={handleAddFechaCorte} className="flex gap-3 max-w-md items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Nuevo día (1 – 31)
            </label>
            <input
              type="number"
              min="1"
              max="31"
              value={newFechaCorteInput}
              onChange={(e) => setNewFechaCorteInput(e.target.value)}
              className="input-field font-mono"
              placeholder="Ej: 20"
            />
          </div>
          <button type="submit" className="btn-primary select-none h-11 px-4">
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </form>

        <div className="border border-border/60 rounded-xl overflow-hidden bg-background/20">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3">Día del mes</th>
                <th className="px-4 py-3">Etiqueta visible</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-sm">
              {fechasCorte.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground italic">
                    No hay fechas de corte configuradas.
                  </td>
                </tr>
              ) : (
                fechasCorte.map((dia) => (
                  <tr key={dia} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      {editingFechaCorteDay === dia ? (
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={editingFechaCorteVal}
                          onChange={(e) => setEditingFechaCorteVal(e.target.value)}
                          className="input-field py-1 px-2 text-sm font-mono w-24"
                          placeholder="Día"
                          title="Día del mes"
                          autoFocus
                        />
                      ) : (
                        <span className="font-mono font-bold text-foreground">{String(dia).padStart(2, '0')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Día {dia} de cada mes
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {editingFechaCorteDay === dia ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSaveFechaCorte(dia)}
                              className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                              title="Guardar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingFechaCorteDay(null)}
                              className="p-1 text-muted-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => { setEditingFechaCorteDay(dia); setEditingFechaCorteVal(String(dia)) }}
                              className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-all cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFechaCorte(dia)}
                              className="p-1 text-destructive hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function SuspensionSettingsTab({ isAdmin, setStatusMessage }: { isAdmin: boolean; setStatusMessage: StatusSetter }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
    enabled: isAdmin,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system-settings'] })

  if (isLoading || !data) {
    return (
      <div className="glass-card p-12 flex items-center justify-center animate-fade-in">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <SuspensionSettingsForm data={data.suspension} catalogs={data.catalogs} onSaved={invalidate} setStatusMessage={setStatusMessage} />
    </div>
  )
}
