/**
 * Cliente tipado para los endpoints de integración ZeroTier (/zerotier/*).
 */
import api from '@/services/api'

export interface ZeroTierSettingsRead {
  zt_network_id: string | null
  zt_api_token_set: boolean
  zt_enabled: boolean
}

export interface ZeroTierSettingsWrite {
  zt_network_id?: string | null
  zt_api_token?: string | null
  zt_enabled?: boolean
}

export interface ZeroTierStatus {
  configured: boolean
  reachable: boolean
  network_id: string | null
  network_name: string | null
  member_count: number | null
  error: string | null
}

export interface ZeroTierMember {
  node_id: string
  name: string | null
  description: string | null
  authorized: boolean
  online: boolean
  ip_assignments: string[]
  last_seen: string | null
  physical_address: string | null
  version: string | null
}

export async function getZeroTierSettings(): Promise<ZeroTierSettingsRead> {
  const { data } = await api.get('/zerotier/settings')
  return data
}

export async function updateZeroTierSettings(payload: ZeroTierSettingsWrite): Promise<ZeroTierSettingsRead> {
  const { data } = await api.put('/zerotier/settings', payload)
  return data
}

export async function getZeroTierStatus(): Promise<ZeroTierStatus> {
  const { data } = await api.get('/zerotier/status')
  return data
}

// Deliberadamente de solo lectura: autorizar/revocar/renombrar miembros se hace
// desde my.zerotier.com, no existe endpoint en el backend para eso (ver zerotier_api.py).
export async function getZeroTierMembers(): Promise<ZeroTierMember[]> {
  const { data } = await api.get('/zerotier/members')
  return data
}
