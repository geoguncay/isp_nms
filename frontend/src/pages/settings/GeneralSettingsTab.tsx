/**
 * Ajustes de Sistema — contenedor de la pestaña "Generales" en SettingsPage.
 * Agrupa Localización, Fiscal, Notificaciones, Seguridad, Mantenimiento e Integraciones
 * como sub-pestañas internas (un solo NavItem = un solo archivo).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Hash, Bell, Shield, Wrench, DatabaseBackup, Plug, MessageSquare, Save, Loader2 } from 'lucide-react'
import {
  getSystemSettings,
  updateLocalization,
  updateFiscal,
  updateNotifications,
  updateSecurity,
  updateMaintenance,
  runManualBackup,
  updateIntegrations,
  type LocalizationSettings,
  type FiscalSettings,
  type SmtpSettingsRead,
  type SecuritySettings,
  type MaintenanceSettings,
  type IntegrationSettingsRead,
} from '@/services/systemSettings'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

type SubTab = 'localizacion' | 'fiscal' | 'notificaciones' | 'seguridad' | 'mantenimiento' | 'integraciones'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'localizacion', label: 'Localización' },
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'notificaciones', label: 'Notificaciones' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'integraciones', label: 'Integraciones' },
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
  const mutation = useMutation({
    mutationFn: updateLocalization,
    onSuccess: () => {
      onSaved()
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
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          mutation.mutate({
            loc_timezone: target.timezone.value,
            loc_locale: target.locale.value,
            loc_currency_code: target.currencyCode.value,
            loc_currency_symbol: target.currencySymbol.value,
            loc_date_format: target.dateFormat.value,
          })
        }}
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
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Código de moneda</label>
            <input name="currencyCode" type="text" maxLength={10} defaultValue={data.loc_currency_code} className="input-field font-mono uppercase" placeholder="USD" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Símbolo de moneda</label>
            <input name="currencySymbol" type="text" maxLength={5} defaultValue={data.loc_currency_symbol} className="input-field font-mono" placeholder="$" />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border/50">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Fiscal ────────────────────────────────────────────────────────────────
function FiscalSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: FiscalSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateFiscal,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración fiscal guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la configuración fiscal.' })
    },
  })

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Hash className="w-5 h-5 text-brand-400" />
          Fiscal
        </h3>
        <p className="text-muted-foreground text-xs mt-1">
          Impuesto aplicado a las facturas y numeración correlativa.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          mutation.mutate({
            fiscal_tax_rate: parseFloat(target.taxRate.value),
            fiscal_tax_name: target.taxName.value,
            fiscal_invoice_prefix: target.invoicePrefix.value,
            fiscal_invoice_next_number: parseInt(target.invoiceNextNumber.value, 10),
          })
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Nombre del impuesto</label>
            <input name="taxName" type="text" maxLength={20} defaultValue={data.fiscal_tax_name} className="input-field" placeholder="IVA" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Tasa de impuesto (%)</label>
            <input name="taxRate" type="number" min={0} max={100} step="0.01" defaultValue={data.fiscal_tax_rate} className="input-field font-mono" placeholder="18" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Prefijo de factura</label>
            <input name="invoicePrefix" type="text" maxLength={20} defaultValue={data.fiscal_invoice_prefix} className="input-field font-mono" placeholder="FAC-" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Próximo número de factura</label>
            <input name="invoiceNextNumber" type="number" min={1} defaultValue={data.fiscal_invoice_next_number} className="input-field font-mono" />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border/50">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Notificaciones ───────────────────────────────────────────────────────
function NotificationSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: SmtpSettingsRead; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateNotifications,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración de notificaciones guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar las notificaciones.' })
    },
  })

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Bell className="w-5 h-5 text-brand-400" />
          Notificaciones
        </h3>
        <p className="text-muted-foreground text-xs mt-1">
          Configuración del servidor SMTP para correos automáticos. Por ahora solo se guarda la
          configuración; el envío de correos se habilitará en una fase futura.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          mutation.mutate({
            smtp_host: target.smtpHost.value || null,
            smtp_port: target.smtpPort.value ? parseInt(target.smtpPort.value, 10) : null,
            smtp_user: target.smtpUser.value || null,
            smtp_password: target.smtpPassword.value || undefined,
            smtp_from_email: target.smtpFromEmail.value || null,
            smtp_from_name: target.smtpFromName.value || null,
            smtp_use_tls: target.smtpUseTls.checked,
            sms_notifications_enabled: target.smsNotificationsEnabled.checked,
          })
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Servidor SMTP</label>
            <input name="smtpHost" type="text" defaultValue={data.smtp_host ?? ''} className="input-field" placeholder="smtp.gmail.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Puerto</label>
            <input name="smtpPort" type="number" min={1} max={65535} defaultValue={data.smtp_port ?? 587} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Usuario</label>
            <input name="smtpUser" type="text" defaultValue={data.smtp_user ?? ''} className="input-field" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Contraseña {data.smtp_password_set && <span className="text-emerald-400 normal-case">(configurada)</span>}
            </label>
            <input name="smtpPassword" type="password" className="input-field" placeholder={data.smtp_password_set ? '••••••••' : ''} />
            <span className="text-[10px] text-muted-foreground block">Deje en blanco para mantener la contraseña actual.</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Correo remitente</label>
            <input name="smtpFromEmail" type="email" defaultValue={data.smtp_from_email ?? ''} className="input-field" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Nombre remitente</label>
            <input name="smtpFromName" type="text" defaultValue={data.smtp_from_name ?? ''} className="input-field" />
          </div>
        </div>

        <hr className="border-border/50" />

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
              <input name="smtpUseTls" type="checkbox" defaultChecked={data.smtp_use_tls} className="sr-only peer" />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
            </label>
            <div>
              <span className="text-sm font-medium text-foreground block">Usar TLS</span>
              <span className="text-xs text-muted-foreground">Habilita conexión segura al servidor SMTP.</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
              <input name="smsNotificationsEnabled" type="checkbox" defaultChecked={data.sms_notifications_enabled} className="sr-only peer" />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
            </label>
            <div>
              <span className="text-sm font-medium text-foreground block">Notificaciones por SMS</span>
              <span className="text-xs text-muted-foreground">Habilita el envío de SMS vía Twilio (configurado por el servidor).</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border/50">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Seguridad ─────────────────────────────────────────────────────────────
function SecuritySettingsForm({
  data, onSaved, setStatusMessage,
}: { data: SecuritySettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateSecurity,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración de seguridad guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la seguridad.' })
    },
  })

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-400" />
          Seguridad
        </h3>
        <p className="text-muted-foreground text-xs mt-1">
          Políticas de contraseñas, sesión y bloqueo de acceso para los operadores del sistema.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          const ipList = (target.ipWhitelist.value as string)
            .split(',')
            .map((v: string) => v.trim())
            .filter(Boolean)
          mutation.mutate({
            sec_password_min_length: parseInt(target.passwordMinLength.value, 10),
            sec_password_expiration_days: parseInt(target.passwordExpirationDays.value, 10),
            sec_default_session_timeout_minutes: parseInt(target.sessionTimeoutMinutes.value, 10),
            sec_max_login_attempts: parseInt(target.maxLoginAttempts.value, 10),
            sec_lockout_duration_minutes: parseInt(target.lockoutDurationMinutes.value, 10),
            sec_ip_whitelist: ipList,
          })
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Longitud mínima de contraseña</label>
            <input name="passwordMinLength" type="number" min={4} max={64} defaultValue={data.sec_password_min_length} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Expiración de contraseña (días)</label>
            <input name="passwordExpirationDays" type="number" min={0} defaultValue={data.sec_password_expiration_days} className="input-field font-mono" />
            <span className="text-[10px] text-muted-foreground block">0 = sin expiración.</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Tiempo de sesión por defecto (min)</label>
            <input name="sessionTimeoutMinutes" type="number" min={1} max={1440} defaultValue={data.sec_default_session_timeout_minutes} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Intentos fallidos permitidos</label>
            <input name="maxLoginAttempts" type="number" min={1} max={20} defaultValue={data.sec_max_login_attempts} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Duración de bloqueo (min)</label>
            <input name="lockoutDurationMinutes" type="number" min={1} max={1440} defaultValue={data.sec_lockout_duration_minutes} className="input-field font-mono" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Lista blanca de IPs (separadas por coma)</label>
            <input name="ipWhitelist" type="text" defaultValue={data.sec_ip_whitelist.join(', ')} className="input-field font-mono" placeholder="192.168.1.1, 10.0.0.0/24" />
            <span className="text-[10px] text-muted-foreground block">Dejar en blanco para permitir acceso desde cualquier IP.</span>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border/50">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
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
  const mutation = useMutation({
    mutationFn: updateMaintenance,
    onSuccess: () => {
      onSaved()
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
          onSubmit={(e) => {
            e.preventDefault()
            const target = e.currentTarget as any
            mutation.mutate({
              maint_audit_log_retention_days: parseInt(target.auditLogRetentionDays.value, 10),
              maint_maintenance_mode: target.maintenanceMode.checked,
              maint_maintenance_message: target.maintenanceMessage.value || null,
            })
          }}
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
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
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

// ── Integraciones ─────────────────────────────────────────────────────────
function IntegrationSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: IntegrationSettingsRead; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateIntegrations,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración de integraciones guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar las integraciones.' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Plug className="w-5 h-5 text-brand-400" />
            Pasarela de Pago
          </h3>
          <p className="text-muted-foreground text-xs mt-1">
            Credenciales de la pasarela de pago utilizada para cobros en línea.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const target = e.currentTarget as any
            mutation.mutate({
              pg_api_key: target.pgApiKey.value || null,
              pg_api_secret: target.pgApiSecret.value || undefined,
            })
          }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">API Key</label>
              <input name="pgApiKey" type="text" defaultValue={data.pg_api_key ?? ''} className="input-field font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                API Secret {data.pg_api_secret_set && <span className="text-emerald-400 normal-case">(configurado)</span>}
              </label>
              <input name="pgApiSecret" type="password" className="input-field font-mono" placeholder={data.pg_api_secret_set ? '••••••••' : ''} />
              <span className="text-[10px] text-muted-foreground block">Deje en blanco para mantener el secreto actual.</span>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border/50">
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card p-6 space-y-2">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-brand-400" />
          SMS (Twilio)
        </h3>
        <p className="text-muted-foreground text-xs">
          Las credenciales de Twilio se configuran por variables de entorno del servidor. El envío de
          SMS puede habilitarse o deshabilitarse desde la pestaña de Notificaciones.
        </p>
      </div>
    </div>
  )
}

// ── Contenedor ────────────────────────────────────────────────────────────
export function GeneralSettingsTab({ isAdmin, setStatusMessage }: { isAdmin: boolean; setStatusMessage: StatusSetter }) {
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
      <div className="flex flex-wrap gap-1 p-1 bg-secondary/30 rounded-xl border border-secondary/50 max-w-max">
        {SUB_TABS.map((sub) => (
          <button
            key={sub.id}
            onClick={() => { setSubTab(sub.id); setStatusMessage(null) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${subTab === sub.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="glass-card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {subTab === 'localizacion' && (
            <LocalizationSettingsForm data={data.localization} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'fiscal' && (
            <FiscalSettingsForm data={data.fiscal} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'notificaciones' && (
            <NotificationSettingsForm data={data.notifications} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'seguridad' && (
            <SecuritySettingsForm data={data.security} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'mantenimiento' && (
            <MaintenanceSettingsForm data={data.maintenance} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'integraciones' && (
            <IntegrationSettingsForm data={data.integrations} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
        </>
      )}
    </div>
  )
}
