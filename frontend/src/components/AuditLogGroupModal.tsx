import { useEffect } from 'react'
import { Clock3, Layers3, X } from 'lucide-react'

import { AuditActionBadge, AuditDetail } from '@/components/AuditLogPresentation'
import type { AuditLogGroup } from '@/components/auditLogMeta'

interface AuditLogGroupModalProps {
  group: AuditLogGroup | null
  hour12: boolean
  onClose: () => void
}

export function AuditLogGroupButton({ group, onOpen }: { group: AuditLogGroup; onOpen: () => void }) {
  if (group.count <= 1) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-300 transition-colors hover:bg-brand-500/25"
      aria-label={`Ver los ${group.count} eventos agrupados`}
    >
      ×{group.count}
    </button>
  )
}

function formatDate(iso: string, hour12: boolean): string {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12,
  })
}

export function AuditLogGroupModal({ group, hour12, onClose }: AuditLogGroupModalProps) {
  useEffect(() => {
    if (!group) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [group, onClose])

  if (!group) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-group-title"
        className="glass-card flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden border border-border shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <AuditActionBadge action={group.action} />
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-bold text-brand-300">
                <Layers3 className="h-3.5 w-3.5" />
                {group.count} eventos
              </span>
            </div>
            <h2 id="audit-group-title" className="text-lg font-semibold text-foreground">
              Eventos consecutivos agrupados
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              {formatDate(group.earliest_at, hour12)} — {formatDate(group.latest_at, hour12)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary p-2" aria-label="Cerrar detalle">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-4 sm:p-5">
          <div className="space-y-3">
            {group.items.map((log, index) => (
              <article key={log.id} className="rounded-lg border border-border bg-secondary/20 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <span className="text-xs font-bold text-brand-400">Evento #{index + 1}</span>
                  <time className="font-mono text-[11px] text-muted-foreground">
                    {formatDate(log.created_at, hour12)}
                  </time>
                </div>
                <div className="grid gap-4 md:grid-cols-[minmax(150px,0.7fr)_minmax(240px,1.5fr)_minmax(120px,0.6fr)]">
                  <div>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entidad</span>
                    <span className="text-sm font-medium text-foreground">{log.entity_name}</span>
                    <span className="block text-[10px] text-muted-foreground">{log.entity_type}</span>
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Detalle</span>
                    <AuditDetail detail={log.detail} />
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Usuario / IP</span>
                    <span className="text-xs font-medium text-foreground">{log.user_name ?? 'Sistema'}</span>
                    <code className="block text-[10px] text-muted-foreground">{log.ip_address ?? 'Sin IP'}</code>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
