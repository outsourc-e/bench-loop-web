import { apiFetch } from './backend'

export async function approveRunner(userCode: string): Promise<{ deviceName: string }> {
  const data = await apiFetch<{ approved: boolean; device_name: string }>('/runner/pair/approve', {
    method: 'POST',
    body: JSON.stringify({ user_code: userCode }),
  })
  if (!data.approved) throw new Error('Runner pairing could not be approved.')
  return { deviceName: data.device_name || 'BenchLoop Runner' }
}
