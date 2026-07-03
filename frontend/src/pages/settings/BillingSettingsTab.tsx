/**
 * Ajustes de Sistema — contenedor de la pestaña "Facturación" en SettingsPage.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Receipt, Save, Loader2 } from 'lucide-react'
import { getSystemSettings, updateBilling, type BillingSettings } from '@/services/systemSettings'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

function BillingGeneralForm({
  data, onSaved, setStatusMessage,
}: { data: BillingSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const [dirty, setDirty] = useState(false)
  const [generacionModo, setGeneracionModo] = useState<'dia_fijo' | 'fecha_corte' | 'inicio_facturacion'>(data.billing_generacion_modo || 'dia_fijo')
  const [vencimientoModo, setVencimientoModo] = useState<'plazo_fijo' | 'fecha_corte'>(data.billing_vencimiento_modo || 'plazo_fijo')

  const mutation = useMutation({
    mutationFn: updateBilling,
    onSuccess: () => {
      onSaved()
      setDirty(false)
      setStatusMessage({ type: 'success', text: 'Las políticas de facturación global se actualizaron correctamente.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la facturación.' })
    },
  })

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Receipt className="w-5 h-5 text-brand-400" />
          Configuración de Facturación
        </h3>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          mutation.mutate({
            billing_hora_generacion: target.horaGeneracion.value,
            billing_ciclo: target.cicloFacturacion.value,
            billing_modo_precio: target.modoPrecio.value,
            billing_generacion_modo: target.generacionModo.value,
            ...(target.diaFijoGeneracion ? { billing_default_dia_pago: parseInt(target.diaFijoGeneracion.value, 10) } : {}),
            billing_auto_aprobar_enviar: target.autoAprobarEnviar.checked,
            billing_detener_suspendidos: target.detenerSuspendidos.checked,
            billing_notify_new_invoice: target.notifyNewInvoice.checked,
            billing_attach_pdf_receipt: target.attachPdfReceipt.checked,
            billing_vencimiento_modo: target.vencimientoModo.value,
            billing_vencimiento_hora: target.vencimientoHora.value,
            ...(target.defaultDiasGracia ? { billing_default_dias_gracia: parseInt(target.defaultDiasGracia.value, 10) } : {}),
            billing_aviso_nueva_factura: target.avisoNuevaFactura.checked,
            billing_aviso_previo_dias: parseInt(target.avisoPrevioDias.value, 10),
            billing_recordatorios_pago: target.recordatoriosPago.checked,
            billing_recordatorio_frecuencia_dias: parseInt(target.recordatorioFrecuenciaDias.value, 10),
          })
        }}
        onChange={() => setDirty(true)}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Ciclo de facturación por defecto
            </label>
            <select
              name="cicloFacturacion"
              defaultValue={data.billing_ciclo || 'mensual'}
              className="input-field"
            >
              <option value="mensual">Mensual</option>
              <option value="bimestral">Bimestral</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Modo de precio
            </label>
            <select
              name="modoPrecio"
              defaultValue={data.billing_modo_precio || 'incluido'}
              className="input-field"
            >
              <option value="incluido">Precios incluyendo impuestos</option>
              <option value="excluido">Precios excluyendo impuestos</option>
            </select>
          </div>
        </div>

        <hr className="border-border/50" />

        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Generación de Facturas
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="generacionModo" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Determina el día
              </label>
              <select
                id="generacionModo"
                name="generacionModo"
                defaultValue={data.billing_generacion_modo || 'dia_fijo'}
                onChange={(e) => setGeneracionModo(e.target.value as 'dia_fijo' | 'fecha_corte' | 'inicio_facturacion')}
                className="input-field"
              >
                <option value="dia_fijo">Día fijo del mes</option>
                <option value="fecha_corte">Día de corte del cliente</option>
                <option value="inicio_facturacion">Inicio de facturación del cliente</option>
              </select>
              <span className="text-[11px] text-muted-foreground block">
                {generacionModo === 'fecha_corte'
                  ? 'La factura se genera el mismo día de corte configurado en el perfil de cada cliente.'
                  : generacionModo === 'inicio_facturacion'
                  ? 'La factura se genera el mismo día del mes en que inició la facturación de cada cliente.'
                  : 'La factura se genera el mismo día del mes para todos los clientes (configurable a la derecha).'}
              </span>
            </div>

            {generacionModo === 'dia_fijo' && (
              <div className="space-y-1.5">
                <label htmlFor="diaFijoGeneracion" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Día del mes
                </label>
                <input
                  id="diaFijoGeneracion"
                  name="diaFijoGeneracion"
                  type="number"
                  min="1"
                  max="28"
                  defaultValue={String(data.billing_default_dia_pago ?? 5)}
                  className="input-field font-mono"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="horaGeneracion" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Hora de generación
              </label>
              <input
                id="horaGeneracion"
                name="horaGeneracion"
                type="time"
                defaultValue={data.billing_hora_generacion || '08:00'}
                className="input-field font-mono"
              />
            </div>
          </div>
        </div>

        <hr className="border-border/50" />

        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Vencimiento de Facturas
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="vencimientoModo" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Cómo se calcula el vencimiento
              </label>
              <select
                id="vencimientoModo"
                name="vencimientoModo"
                defaultValue={data.billing_vencimiento_modo || 'plazo_fijo'}
                onChange={(e) => setVencimientoModo(e.target.value as 'plazo_fijo' | 'fecha_corte')}
                className="input-field"
              >
                <option value="plazo_fijo">Plazo fijo desde la emisión</option>
                <option value="fecha_corte">Fecha de corte del cliente</option>
              </select>
              <span className="text-[11px] text-muted-foreground block">
                {vencimientoModo === 'fecha_corte'
                  ? 'La factura vence el mismo día de corte configurado en el perfil del cliente.'
                  : 'La factura vence N días después de emitida (configurable a la derecha).'}
              </span>
            </div>

            {vencimientoModo === 'plazo_fijo' && (
              <div className="space-y-1.5">
                <label htmlFor="defaultDiasGracia" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Días de plazo
                </label>
                <input
                  id="defaultDiasGracia"
                  name="defaultDiasGracia"
                  type="number"
                  min="0"
                  defaultValue={String(data.billing_default_dias_gracia ?? 10)}
                  className="input-field font-mono"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="vencimientoHora" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Hora del vencimiento
              </label>
              <select
                id="vencimientoHora"
                name="vencimientoHora"
                defaultValue={data.billing_vencimiento_hora || 'fin_dia'}
                className="input-field"
              >
                <option value="fin_dia">Fin del día (23:59:59)</option>
                <option value="inicio_dia">Inicio del día (00:00:00)</option>
              </select>
            </div>
          </div>

          <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg p-3 text-[11px] text-brand-300 leading-relaxed">
            ℹ️ Los "Días de gracia antes de suspender" (extra, después del vencimiento) se configuran en la pestaña Suspensión.
          </div>
        </div>

        <hr className="border-border/50" />

        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Políticas de Automatización
          </h4>

          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                <input name="autoAprobarEnviar" type="checkbox" defaultChecked={data.billing_auto_aprobar_enviar ?? true} className="sr-only peer" />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
              </label>
              <div>
                <span className="text-sm font-medium text-foreground block">
                  Aprobar y enviar facturas automáticamente
                </span>
                <span className="text-xs text-muted-foreground">
                  Los borradores de facturas se aprueban y se envían automáticamente al cliente inmediatamente después de ser generados.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                <input name="detenerSuspendidos" type="checkbox" defaultChecked={data.billing_detener_suspendidos ?? true} className="sr-only peer" />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
              </label>
              <div>
                <span className="text-sm font-medium text-foreground block">
                  Detener la facturación de servicios suspendidos
                </span>
                <span className="text-xs text-muted-foreground">
                  No se facturarán los períodos de facturación que estén cubiertos en su totalidad por una suspensión del servicio.
                </span>
              </div>
            </div>
          </div>
        </div>

        <hr className="border-border/50" />

        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Notificaciones y Avisos a Clientes
          </h4>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                <input name="notifyNewInvoice" type="checkbox" defaultChecked={data.billing_notify_new_invoice ?? true} className="sr-only peer" />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
              </label>
              <div>
                <span className="text-sm font-medium text-foreground block">
                  Notificar Factura nueva
                </span>
                <span className="text-xs text-muted-foreground">
                  Enviar automáticamente un correo electrónico de notificación al cliente cuando se genera una nueva factura.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                <input name="attachPdfReceipt" type="checkbox" defaultChecked={data.billing_attach_pdf_receipt ?? true} className="sr-only peer" />
                <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
              </label>
              <div>
                <span className="text-sm font-medium text-foreground block">
                  Adjuntar el recibo como archivo PDF
                </span>
                <span className="text-xs text-muted-foreground">
                  Adjuntar el archivo PDF de la factura/recibo de pago en el correo de notificación saliente.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-7">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                    <input name="avisoNuevaFactura" type="checkbox" defaultChecked={data.billing_aviso_nueva_factura ?? true} className="sr-only peer" />
                    <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                  </label>
                  <div>
                    <span className="text-xs font-semibold text-foreground block">Aviso de nueva factura</span>
                    <span className="text-[10px] text-muted-foreground">Enviar un aviso previo al cliente.</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground block uppercase">Días de aviso previo</label>
                  <input
                    name="avisoPrevioDias"
                    type="number"
                    min="1"
                    defaultValue={String(data.billing_aviso_previo_dias ?? 5)}
                    className="input-field py-1 px-2 text-xs font-mono w-24"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                    <input name="recordatoriosPago" type="checkbox" defaultChecked={data.billing_recordatorios_pago ?? true} className="sr-only peer" />
                    <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500"></div>
                  </label>
                  <div>
                    <span className="text-xs font-semibold text-foreground block">Recordatorios de pago</span>
                    <span className="text-[10px] text-muted-foreground">Enviar recordatorios automáticos de facturas pendientes.</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground block uppercase">Enviar recordatorio cada (días)</label>
                  <input
                    name="recordatorioFrecuenciaDias"
                    type="number"
                    min="1"
                    defaultValue={String(data.billing_recordatorio_frecuencia_dias ?? 3)}
                    className="input-field py-1 px-2 text-xs font-mono w-24"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border/50">
          <button type="submit" className={dirty ? 'btn-primary' : 'btn-secondary'}>
            <Save className="w-4 h-4" />
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}

export function BillingSettingsTab({ isAdmin, setStatusMessage }: { isAdmin: boolean; setStatusMessage: StatusSetter }) {
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
      <BillingGeneralForm data={data.billing} onSaved={invalidate} setStatusMessage={setStatusMessage} />
    </div>
  )
}
