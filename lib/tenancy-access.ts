export type RpcResult = { data: unknown[] | null; error: { message?: string } | null }

export type TenancyLoad =
  | { kind: 'ok'; row: any }
  | { kind: 'not_found' }
  | { kind: 'error' }

export function classifyTenancyLoad(res: RpcResult, tenancyId: string): TenancyLoad {
  if (res.error) return { kind: 'error' }
  const row = (res.data ?? []).find((x: any) => x && x.id === tenancyId)
  return row ? { kind: 'ok', row } : { kind: 'not_found' }
}

export const TENANCY_LOAD_ERROR_TEXT =
  'We could not load this tenancy right now. This is usually temporary. Please try again.'

export const TENANCY_NOT_FOUND_TEXT =
  'We could not find this tenancy on your account. It may have been removed, or the link may belong to a different account. If you are signed in with another account, sign out and sign in with the right one.'