import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Resuelve una URL de logo/avatar relativa (`/static/uploads/...`) contra el host de la API. */
export function getLogoUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url
  }
  const apiHost = import.meta.env.VITE_API_URL || ''
  return `${apiHost}${url}`
}

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

/** Formatea una fecha respetando el formato configurado en Ajustes Generales › Localización. */
export function formatDate(date: string | Date | null | undefined, format: DateFormat = 'DD/MM/YYYY'): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()

  switch (format) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`
    case 'DD/MM/YYYY':
    default:
      return `${day}/${month}/${year}`
  }
}

/** Clase Tailwind para botones de guardar/agregar: resaltados con anillo pulsante cuando hay cambios sin guardar. */
export function saveButtonClass(isDirty: boolean, isPending?: boolean): string {
  if (isPending) return 'btn-primary'
  return isDirty ? 'btn-primary btn-dirty-pulse' : 'btn-secondary'
}

export type TimeFormat = '24H' | '12H'

/** Formatea la hora respetando el formato configurado en Ajustes › Sistema › Localización. */
export function formatTime(date: string | Date | null | undefined, timeFormat: TimeFormat = '24H', opts?: { seconds?: boolean }): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'

  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: opts?.seconds ? '2-digit' : undefined,
    hour12: timeFormat === '12H',
  })
}

/** Combina formatDate + formatTime respetando ambos formatos configurados. */
export function formatDateTime(
  date: string | Date | null | undefined,
  dateFormat: DateFormat = 'DD/MM/YYYY',
  timeFormat: TimeFormat = '24H',
  opts?: { seconds?: boolean },
): string {
  if (!date) return '—'
  return `${formatDate(date, dateFormat)} ${formatTime(date, timeFormat, opts)}`
}

/**
 * Serializa una fecha en formato "YYYY-MM-DDTHH:mm" usando la hora LOCAL del navegador.
 * `Date.toISOString()` devuelve la hora en UTC, que un <input type="datetime-local">
 * interpreta como si fuera hora local — desalineando el valor por el offset de zona horaria.
 */
export function toDatetimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function formatUptime(uptime: string | null | undefined): string {
  if (!uptime) return '—'

  // Si tiene el formato hh:mm:ss (ej: 05:12:43)
  if (/^\d{2}:\d{2}:\d{2}$/.test(uptime)) {
    const [h, m, s] = uptime.split(':').map(Number)
    const parts = []
    if (h > 0) parts.push(`${h} ${h === 1 ? 'hora' : 'horas'}`)
    if (m > 0) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`)
    if (h === 0 && m === 0 && s > 0) parts.push(`${s} ${s === 1 ? 'segundo' : 'segundos'}`)
    return parts.join(', ') || '0 minutos'
  }

  // Si tiene formato de letras (ej: 3w2d5h10m15s)
  const regex = /(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/
  const match = uptime.match(regex)

  if (match && (match[1] || match[2] || match[3] || match[4] || match[5])) {
    const weeks = match[1] ? parseInt(match[1]) : 0
    const days = match[2] ? parseInt(match[2]) : 0
    const hours = match[3] ? parseInt(match[3]) : 0
    const minutes = match[4] ? parseInt(match[4]) : 0
    const seconds = match[5] ? parseInt(match[5]) : 0

    const parts = []
    if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`)
    if (days > 0) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`)
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`)
    if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`)
    
    // Solo mostrar segundos si no hay unidades mayores
    if (parts.length === 0 && seconds > 0) {
      parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`)
    }

    return parts.join(', ') || uptime
  }

  return uptime
}
