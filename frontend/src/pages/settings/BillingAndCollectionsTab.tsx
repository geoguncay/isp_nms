/**
 * Ajustes de Facturación y Cobros — contenedor de la categoría "Facturación y Cobros" en SettingsPage.
 * Agrupa Fiscal, Facturación, Suspensión y Método de Pago como sub-pestañas internas.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Hash, Save, Loader2 } from 'lucide-react'
import { getSystemSettings, updateFiscal, type FiscalSettings } from '@/services/systemSettings'
import { saveButtonClass } from '@/lib/utils'
import { useFormDirty } from '@/hooks/useFormDirty'
import { BillingSettingsTab } from '@/pages/settings/BillingSettingsTab'
import { SuspensionSettingsTab } from '@/pages/settings/SuspensionSettingsTab'
import { PaymentMethodsSettingsTab } from '@/pages/settings/PaymentMethodsSettingsTab'
import { SettingsSubTabs } from '@/pages/settings/SettingsSubTabs'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

type SubTab = 'fiscal' | 'facturacion' | 'suspension' | 'metodo_pago'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'facturacion', label: 'Facturación' },
  { id: 'suspension', label: 'Suspensión' },
  { id: 'metodo_pago', label: 'Método de Pago' },
]

// ── Fiscal ────────────────────────────────────────────────────────────────
function FiscalSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: FiscalSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const { formRef, isDirty, snapshot, checkDirty } = useFormDirty()
  useEffect(() => { snapshot() }, [snapshot])

  const mutation = useMutation({
    mutationFn: updateFiscal,
    onSuccess: () => {
      onSaved()
      snapshot()
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
        ref={formRef}
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
        onChange={checkDirty}
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
          <button type="submit" disabled={mutation.isPending} className={saveButtonClass(isDirty, mutation.isPending)}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Contenedor ────────────────────────────────────────────────────────────
export function BillingAndCollectionsTab({ isAdmin, setStatusMessage }: { isAdmin: boolean; setStatusMessage: StatusSetter }) {
  const [subTab, setSubTab] = useState<SubTab>('fiscal')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
    enabled: isAdmin && subTab === 'fiscal',
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system-settings'] })

  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSubTabs
        tabs={SUB_TABS}
        active={subTab}
        onChange={(id) => { setSubTab(id); setStatusMessage(null) }}
      />

      {subTab === 'fiscal' && (
        isLoading || !data ? (
          <div className="glass-card p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <FiscalSettingsForm data={data.fiscal} onSaved={invalidate} setStatusMessage={setStatusMessage} />
        )
      )}
      {subTab === 'facturacion' && (
        <BillingSettingsTab isAdmin={isAdmin} setStatusMessage={setStatusMessage} />
      )}
      {subTab === 'suspension' && (
        <SuspensionSettingsTab isAdmin={isAdmin} setStatusMessage={setStatusMessage} />
      )}
      {subTab === 'metodo_pago' && (
        <PaymentMethodsSettingsTab isAdmin={isAdmin} setStatusMessage={setStatusMessage} />
      )}
    </div>
  )
}
