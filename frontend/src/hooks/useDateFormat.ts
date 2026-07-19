import { useQuery } from '@tanstack/react-query'
import { getLocalizationSettings } from '@/services/systemSettings'
import type { DateFormat, TimeFormat } from '@/lib/utils'

/** Formato de fecha configurado en Ajustes › Sistema › Localización (con fallback DD/MM/YYYY). */
export function useDateFormat(): DateFormat {
  const { data } = useQuery({
    queryKey: ['localization-settings'],
    queryFn: getLocalizationSettings,
    staleTime: 10 * 60 * 1000,
  })

  return (data?.loc_date_format as DateFormat) || 'DD/MM/YYYY'
}

/** Formato de hora configurado en Ajustes › Sistema › Localización (con fallback 24H). */
export function useTimeFormat(): TimeFormat {
  const { data } = useQuery({
    queryKey: ['localization-settings'],
    queryFn: getLocalizationSettings,
    staleTime: 10 * 60 * 1000,
  })

  return (data?.loc_time_format as TimeFormat) || '24H'
}
