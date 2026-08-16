import { supabase } from './supabase'

export async function approveRunner(userCode: string): Promise<{ deviceName: string }> {
  if (!supabase) throw new Error('Runner pairing requires the live BenchLoop backend.')
  const { data, error } = await supabase.functions.invoke('runner-pair-approve', {
    body: { user_code: userCode },
  })
  if (error) throw new Error('That pairing code is invalid, expired, or already used.')
  if (!data?.approved) throw new Error(String(data?.error || 'Runner pairing could not be approved.'))
  return { deviceName: String(data.device_name || 'BenchLoop Runner') }
}
