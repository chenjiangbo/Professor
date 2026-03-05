import type { SubscriptionTier } from '~/lib/billing/repo'

export function getDailyImportLimitByTier(tier: SubscriptionTier): number | null {
  if (tier === 'free') return 5
  if (tier === 'pro') return 15
  return null
}

export function canExportNotebookZip(tier: SubscriptionTier): boolean {
  void tier
  return false
}
