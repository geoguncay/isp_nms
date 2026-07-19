/**
 * Ajustes de Sistema — contenedor de la categoría "Sistema" en SettingsPage.
 * Agrupa Localización y Mantenimiento/Backup como sub-pestañas internas.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Wrench, DatabaseBackup, Save, Loader2 } from 'lucide-react'
import { saveButtonClass } from '@/lib/utils'
import { useFormDirty } from '@/hooks/useFormDirty'
import {
  getSystemSettings,
  updateLocalization,
  updateMaintenance,
  runManualBackup,
  type LocalizationSettings,
  type MaintenanceSettings,
} from '@/services/systemSettings'
import { SettingsSubTabs } from '@/pages/settings/SettingsSubTabs'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

type SubTab = 'localizacion' | 'mantenimiento'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'localizacion', label: 'Localización' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
]

// ── Localización ─────────────────────────────────────────────────────────
const FALLBACK_TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Santo_Domingo', 'America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Santiago', 'America/Buenos_Aires', 'Europe/Madrid', 'Europe/London']

function getUtcOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    return offset.replace('GMT', 'UTC')
  } catch {
    return 'UTC'
  }
}

function offsetToMinutes(offsetLabel: string): number {
  const match = offsetLabel.match(/UTC([+-]\d{1,2})(?::(\d{2}))?/)
  if (!match) return 0
  const sign = match[1].startsWith('-') ? -1 : 1
  const hours = Math.abs(parseInt(match[1], 10))
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  return sign * (hours * 60 + minutes)
}

// Un representante conocido por desfase horario, para no listar las ~400 zonas IANA.
const PREFERRED_ZONES = [
  'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
  'America/Denver', 'America/Chicago', 'America/Mexico_City', 'America/Bogota',
  'America/New_York', 'America/Santo_Domingo', 'America/Caracas', 'America/Santiago',
  'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores',
  'UTC', 'Europe/London', 'Europe/Madrid', 'Europe/Berlin', 'Europe/Athens',
  'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney',
  'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Tongatapu',
]

const TIMEZONE_OPTIONS: { value: string; label: string }[] = (() => {
  let names: string[]
  try {
    // @ts-expect-error - supportedValuesOf no está en el lib target del proyecto pero sí en los navegadores soportados
    const list = Intl.supportedValuesOf?.('timeZone') as string[] | undefined
    names = list && list.length ? list : FALLBACK_TIMEZONES
  } catch {
    names = FALLBACK_TIMEZONES
  }

  const zonesByOffset = new Map<string, string[]>()
  for (const tz of names) {
    const offset = getUtcOffsetLabel(tz)
    const bucket = zonesByOffset.get(offset)
    if (bucket) bucket.push(tz)
    else zonesByOffset.set(offset, [tz])
  }

  const options = Array.from(zonesByOffset.entries()).map(([offset, zones]) => {
    const representative = zones.find((tz) => PREFERRED_ZONES.includes(tz)) ?? [...zones].sort()[0]
    return { value: representative, label: `${offset} ${representative}` }
  })

  return options.sort((a, b) => offsetToMinutes(a.label) - offsetToMinutes(b.label))
})()

function LocalizationSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: LocalizationSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const { formRef, isDirty, snapshot, checkDirty } = useFormDirty()
  useEffect(() => { snapshot() }, [snapshot])

  const mutation = useMutation({
    mutationFn: updateLocalization,
    onSuccess: () => {
      onSaved()
      snapshot()
      setStatusMessage({ type: 'success', text: 'Configuración de localización guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la localización.' })
    },
  })

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-400" />
          Localización
        </h3>
        <p className="text-muted-foreground text-xs mt-1">
          Zona horaria, idioma, formato de fecha y moneda utilizados en toda la plataforma.
        </p>
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          mutation.mutate({
            loc_timezone: target.timezone.value,
            loc_locale: target.locale.value,
            loc_currency_code: target.currencyCode.value,
            loc_currency_symbol: target.currencySymbol.value,
            loc_date_format: target.dateFormat.value,
            loc_time_format: target.timeFormat.value,
          })
        }}
        onChange={checkDirty}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Zona horaria</label>
            <select name="timezone" defaultValue={data.loc_timezone} className="input-field font-mono">
              {!TIMEZONE_OPTIONS.some((tz) => tz.value === data.loc_timezone) && (
                <option value={data.loc_timezone}>{data.loc_timezone}</option>
              )}
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Idioma</label>
            <select name="locale" defaultValue={data.loc_locale} className="input-field">
              <option value="es">Español</option>
              <option value="en">Inglés</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Formato de fecha</label>
            <select name="dateFormat" defaultValue={data.loc_date_format} className="input-field">
              <option value="DD/MM/YYYY">DD/MM/AAAA</option>
              <option value="MM/DD/YYYY">MM/DD/AAAA</option>
              <option value="YYYY-MM-DD">AAAA-MM-DD</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Formato de hora</label>
            <select name="timeFormat" defaultValue={data.loc_time_format} className="input-field">
              <option value="24H">24 horas</option>
              <option value="12H">12 horas (AM/PM)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Código de moneda</label>
            <input name="currencyCode" type="text" maxLength={10} defaultValue={data.loc_currency_code} className="input-field font-mono uppercase" placeholder="USD" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Símbolo de moneda</label>
            <input name="currencySymbol" type="text" maxLength={5} defaultValue={data.loc_currency_symbol} className="input-field font-mono" placeholder="$" />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border/50">
          <button type="submit" disabled={mutation.isPending} className={saveButtonClass(isDirty, mutation.isPending)}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Mantenimiento ─────────────────────────────────────────────────────────
function MaintenanceSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: MaintenanceSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const { formRef, isDirty, snapshot, checkDirty } = useFormDirty()
  useEffect(() => { snapshot() }, [snapshot])

  const mutation = useMutation({
    mutationFn: updateMaintenance,
    onSuccess: () => {
      onSaved()
      snapshot()
      setStatusMessage({ type: 'success', text: 'Configuración de mantenimiento guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar el mantenimiento.' })
    },
  })

  const backupMutation = useMutation({
    mutationFn: runManualBackup,
    onSuccess: (result) => {
      setStatusMessage({
        type: 'success',
        text: `Backup generado: ${result.filename} (${(result.size_bytes / 1024).toFixed(1)} KB).`,
      })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al generar el backup.' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Wrench className="w-5 h-5 text-brand-400" />
            Mantenimiento
          </h3>
          <p className="text-muted-foreground text-xs mt-1">
            Retención del log de auditoría y modo mantenimiento del sistema.
          </p>
        </div>

        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault()
            const target = e.currentTarget as any
            mutation.mutate({
              maint_audit_log_retention_days: parseInt(target.auditLogRetentionDays.value, 10),
              maint_maintenance_mode: target.maintenanceMode.checked,
              maint_maintenance_message: target.maintenanceMessage.value || null,
            })
          }}
          onChange={checkDirty}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Retención del log de auditoría (días)</label>
              <input name="auditLogRetentionDays" type="number" min={1} max={3650} defaultValue={data.maint_audit_log_retention_days} className="input-field font-mono" />
            </div>
          </div>

          <hr className="border-border/50" />

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                <input name="maintenanceMode" type="checkbox" defaultChecked={data.maint_maintenance_mode} className="sr-only peer" />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
              </label>
              <div>
                <span className="text-sm font-medium text-foreground block">Modo mantenimiento</span>
                <span className="text-xs text-muted-foreground">Bloquea el acceso a operadores no administradores mientras está activo.</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Mensaje de mantenimiento</label>
              <input name="maintenanceMessage" type="text" maxLength={500} defaultValue={data.maint_maintenance_message ?? ''} className="input-field" placeholder="El sistema está en mantenimiento, intente más tarde." />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border/50">
            <button type="submit" disabled={mutation.isPending} className={saveButtonClass(isDirty, mutation.isPending)}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <DatabaseBackup className="w-5 h-5 text-brand-400" />
            Backup manual
          </h3>
          <p className="text-muted-foreground text-xs mt-1">
            Genera un respaldo de la base de datos en el disco del servidor. Requiere PostgreSQL.
          </p>
        </div>
        <button
          type="button"
          onClick={() => backupMutation.mutate()}
          disabled={backupMutation.isPending}
          className="btn-secondary"
        >
          {backupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
          {backupMutation.isPending ? 'Generando backup...' : 'Ejecutar backup ahora'}
        </button>
      </div>
    </div>
  )
}

// ── Contenedor ────────────────────────────────────────────────────────────
export function SystemSettingsTab({ isAdmin, setStatusMessage }: { isAdmin: boolean; setStatusMessage: StatusSetter }) {
  const [subTab, setSubTab] = useState<SubTab>('localizacion')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
    enabled: isAdmin,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system-settings'] })

  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSubTabs
        tabs={SUB_TABS}
        active={subTab}
        onChange={(id) => { setSubTab(id); setStatusMessage(null) }}
      />

      {isLoading || !data ? (
        <div className="glass-card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {subTab === 'localizacion' && (
            <LocalizationSettingsForm data={data.localization} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'mantenimiento' && (
            <MaintenanceSettingsForm data={data.maintenance} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
        </>
      )}
    </div>
  )
}
