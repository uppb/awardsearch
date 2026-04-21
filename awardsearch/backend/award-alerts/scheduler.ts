import type { AwardAlert } from "./types.js"

const DEFAULT_DUE_ALERT_LIMIT = 100
const DEFAULT_CLAIM_TTL_MINUTES = 5

export type ClaimDueAlertsRepository = {
  claimDueAlerts: (nowIso: string, limit: number, claimTtlMinutes: number) => AwardAlert[] | Promise<AwardAlert[]>
}

export type ClaimDueAlertsOptions = {
  limit?: number
  claimTtlMinutes?: number
}

export const claimDueAlerts = async (
  repository: ClaimDueAlertsRepository,
  now: Date,
  { limit = DEFAULT_DUE_ALERT_LIMIT, claimTtlMinutes = DEFAULT_CLAIM_TTL_MINUTES }: ClaimDueAlertsOptions = {},
): Promise<AwardAlert[]> => repository.claimDueAlerts(now.toISOString(), limit, claimTtlMinutes)
