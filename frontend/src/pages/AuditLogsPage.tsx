import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, RefreshCw } from 'lucide-react'
import api from '@/services/api'
import { useTimeFormat } from '@/hooks/useDateFormat'
import { AuditLogGroupButton, AuditLogGroupModal } from '@/components/AuditLogGroupModal'
import { AuditActionBadge, AuditDetail } from '@/components/AuditLogPresentation'
import {
  ACTION_OPTIONS, ENTITY_OPTIONS,
  type AuditLogGroup, type AuditLogGroupedResponse,
} from '@/components/auditLogMeta'

export function AuditLogsPage() {
  const hour12 = useTimeFormat() === '12H'
  const [page, setPage] = useState(1)
  const limit = 50
  const [filterAction, setFilterAction] = useState('')
  const [filterEntityType, setFilterEntityType] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<AuditLogGroup | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery<AuditLogGroupedResponse>({
    queryKey: ['audit-logs', page, filterAction, filterEntityType],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        skip: (page - 1) * limit,
        limit,
      }
      if (filterAction) params.action = filterAction
      if (filterEntityType) params.entity_type = filterEntityType
      const { data } = await api.get('/audit-logs/grouped', { params })
      return data
    },
    refetchInterval: 30_000,
  })

  const totalPages = Math.ceil((data?.total ?? 0) / limit)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-brand-400" />
            Log del Sistema ISP
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historial de eventos, cambios y conectividad del sistema
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-400 uppercase tracking-wider">
          <ClipboardList className="w-3.5 h-3.5" />
          Filtros
        </div>
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}
          className="input-field w-52"
        >
          <option value="">Todas las acciones</option>
          {ACTION_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={filterEntityType}
          onChange={(e) => { setFilterEntityType(e.target.value); setPage(1) }}
          className="input-field w-40"
        >
          <option value="">Todas las entidades</option>
          {ENTITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {(filterAction || filterEntityType) && (
          <button
            onClick={() => { setFilterAction(''); setFilterEntityType(''); setPage(1) }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpiar filtros
          </button>
        )}
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.event_total} eventos · {data.total} grupos
          </span>
        )}
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Cargando registros...</span>
        </div>
      ) : !data?.items.length ? (
        <div className="glass-card p-12 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Sin eventos registrados</h3>
          <p className="text-sm text-muted-foreground">
            Los eventos del sistema aparecerán aquí conforme se realicen acciones.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Evento</th>
                <th>Entidad</th>
                <th>Detalle</th>
                <th>Usuario</th>
                <th className="hidden md:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((group) => {
                const log = group.items[0]
                return (
                <tr key={group.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="whitespace-nowrap">
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('es-EC', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                        hour12,
                      })}
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
                  <td>
                    <AuditDetail detail={log.detail} />
                  </td>
                  <td>
                    <span className="text-xs text-foreground font-medium">
                      {log.user_name ?? <span className="text-muted-foreground italic">Sistema</span>}
                    </span>
                  </td>
                  <td className="hidden md:table-cell">
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
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {data?.total} grupos
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
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
