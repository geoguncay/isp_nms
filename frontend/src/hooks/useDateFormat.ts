import { useQuery } from '@tanstack/react-query'
import { getLocalizationSettings } from '@/services/systemSettings'
import type { DateFormat } from '@/lib/utils'

/** Formato de fecha configurado en Ajustes Generales › Localización (con fallback DD/MM/YYYY). */
export function useDateFormat(): DateFormat {
  const { data } = useQuery({
    queryKey: ['localization-settings'],
    queryFn: getLocalizationSettings,
    staleTime: 10 * 60 * 1000,
  })

  return (data?.loc_date_format as DateFormat) || 'DD/MM/YYYY'
}
