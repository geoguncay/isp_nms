/**
 * Barra de sub-pestañas internas compartida por los contenedores de categorías de Ajustes.
 */
export function SettingsSubTabs<T extends string>({
  tabs, active, onChange,
}: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl border border-secondary/50 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${active === tab.id
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
