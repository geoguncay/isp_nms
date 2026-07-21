import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList, RefreshCw,
} from 'lucide-react'
import api from '@/services/api'
import { useTimeFormat } from '@/hooks/useDateFormat'
import { AuditLogGroupButton, AuditLogGroupModal } from '@/components/AuditLogGroupModal'
import {
  AuditActionBadge, AuditDetail,
} from '@/components/AuditLogPresentation'
import {
  ACTION_OPTIONS, ENTITY_OPTIONS,
  type AuditLogGroup, type AuditLogGroupedResponse,
} from '@/components/auditLogMeta'

function formatLogDate(iso: string, hour12: boolean): string {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12,
  })
}

function LogCard({ group, onOpen }: { group: AuditLogGroup; onOpen: () => void }) {
  const hour12 = useTimeFormat() === '12H'
  const log = group.items[0]

  return (
    <div className="glass-card p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <AuditActionBadge action={log.action} />
          <AuditLogGroupButton group={group} onOpen={onOpen} />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap pt-0.5">
          {formatLogDate(log.created_at, hour12)}
        </span>
      </div>

      {log.entity_name && (
        <div>
          <span className="text-sm font-medium text-foreground">{log.entity_name}</span>
          {log.entity_type && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">({log.entity_type})</span>
          )}
        </div>
      )}

      <AuditDetail detail={log.detail} />

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
        <span className="text-xs text-foreground font-medium">
          {log.user_name ?? <span className="text-muted-foreground italic">Sistema</span>}
        </span>
        {log.ip_address && (
          <code className="text-[10px] text-muted-foreground font-mono">{log.ip_address}</code>
        )}
      </div>
    </div>
  )
}

const LOG_LIMIT = 50

export function LogsSettingsTab() {
  const hour12 = useTimeFormat() === '12H'
  const [logPage, setLogPage] = useState(1)
  const [logFilterAction, setLogFilterAction] = useState('')
  const [logFilterEntityType, setLogFilterEntityType] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<AuditLogGroup | null>(null)

  const { data: logsData, isLoading: logsLoading, isFetching: logsFetching, refetch: refetchLogs } = useQuery<AuditLogGroupedResponse>({
    queryKey: ['audit-logs', logPage, logFilterAction, logFilterEntityType],
    queryFn: async () => {
      const params: Record<string, string | number> = { skip: (logPage - 1) * LOG_LIMIT, limit: LOG_LIMIT }
      if (logFilterAction) params.action = logFilterAction
      if (logFilterEntityType) params.entity_type = logFilterEntityType
      const { data } = await api.get('/audit-logs/grouped', { params })
      return data
    },
    refetchInterval: 30_000,
  })
  const logTotalPages = Math.ceil((logsData?.total ?? 0) / LOG_LIMIT)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filtros */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-400 uppercase tracking-wider w-full sm:w-auto">
          <ClipboardList className="w-3.5 h-3.5" />
          Filtros
        </div>
        <select
          value={logFilterAction}
          onChange={(e) => { setLogFilterAction(e.target.value); setLogPage(1) }}
          className="input-field flex-1 min-w-[160px] sm:flex-none sm:w-52"
        >
          <option value="">Todas las acciones</option>
          {ACTION_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={logFilterEntityType}
          onChange={(e) => { setLogFilterEntityType(e.target.value); setLogPage(1) }}
          className="input-field flex-1 min-w-[140px] sm:flex-none sm:w-40"
        >
          <option value="">Todas las entidades</option>
          {ENTITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {(logFilterAction || logFilterEntityType) && (
          <button
            onClick={() => { setLogFilterAction(''); setLogFilterEntityType(''); setLogPage(1) }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpiar filtros
          </button>
        )}
        <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-between sm:justify-start gap-3">
          {logsData && (
            <span className="text-xs text-muted-foreground">
              {logsData.event_total} eventos · {logsData.total} grupos
            </span>
          )}
          <button
            onClick={() => refetchLogs()}
            disabled={logsFetching}
            className="btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${logsFetching ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Registros */}
      {logsLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Cargando registros...</span>
        </div>
      ) : !logsData?.items.length ? (
        <div className="glass-card p-12 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Sin eventos registrados</h3>
          <p className="text-sm text-muted-foreground">
            Los eventos del sistema aparecerán aquí conforme se realicen acciones.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: tarjetas */}
          <div className="md:hidden space-y-3">
            {logsData.items.map((group) => (
              <LogCard key={group.id} group={group} onOpen={() => setSelectedGroup(group)} />
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block glass-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha / Hora</th>
                  <th>Evento</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                  <th>Usuario</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logsData.items.map((group) => {
                  const log = group.items[0]
                  return (
                  <tr key={group.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="whitespace-nowrap">
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatLogDate(log.created_at, hour12)}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <AuditActionBadge action={log.action} />
                        <AuditLogGroupButton group={group} onOpen={() => setSelectedGroup(group)} />
                      </div>
                    </td>
                    <td>
                      {log.entity_name ? (
                        <div>
                          <span className="text-xs font-medium text-foreground">{log.entity_name}</span>
                          {log.entity_type && (
                            <span className="block text-[10px] text-muted-foreground">{log.entity_type}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td><AuditDetail detail={log.detail} /></td>
                    <td>
                      <span className="text-xs text-foreground font-medium">
                        {log.user_name ?? <span className="text-muted-foreground italic">Sistema</span>}
                      </span>
                    </td>
                    <td>
                      <code className="text-[10px] text-muted-foreground font-mono">
                        {log.ip_address ?? '—'}
                      </code>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Paginación */}
      {logTotalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Página {logPage} de {logTotalPages} · {logsData?.total} grupos
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLogPage((p) => Math.max(p - 1, 1))}
              disabled={logPage === 1}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              Anterior
            </button>
            <button
              onClick={() => setLogPage((p) => Math.min(p + 1, logTotalPages))}
              disabled={logPage === logTotalPages}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <AuditLogGroupModal
        group={selectedGroup}
        hour12={hour12}
        onClose={() => setSelectedGroup(null)}
      />
    </div>
  )
}
