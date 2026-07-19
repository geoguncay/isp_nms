import { useCallback, useRef, useState } from 'react'

function serializeForm(form: HTMLFormElement): string {
  const data = new FormData(form)
  const pairs: string[] = []
  for (const [key, value] of data.entries()) {
    pairs.push(`${key}=${typeof value === 'string' ? value : value.name}`)
  }
  return pairs.join('&')
}

/**
 * Detecta cambios sin guardar en un <form> no controlado, comparando sus valores
 * actuales contra una foto (`snapshot`) tomada al cargar los datos o justo tras guardar.
 * Si el usuario revierte manualmente un campo a su valor original, vuelve a isDirty: false.
 */
export function useFormDirty<T extends HTMLFormElement = HTMLFormElement>() {
  const formRef = useRef<T>(null)
  const baselineRef = useRef<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  const snapshot = useCallback(() => {
    if (!formRef.current) return
    baselineRef.current = serializeForm(formRef.current)
    setIsDirty(false)
  }, [])

  const checkDirty = useCallback(() => {
    if (!formRef.current || baselineRef.current === null) return
    setIsDirty(serializeForm(formRef.current) !== baselineRef.current)
  }, [])

  return { formRef, isDirty, snapshot, checkDirty }
}
