import type { SubscriptionTier } from '~/lib/billing/repo'

const BADGE_STYLE: Record<SubscriptionTier, string> = {
  free: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-white/20 dark:bg-white/10 dark:text-slate-200',
  pro: 'border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-200',
  premium:
    'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
}

const BADGE_TEXT: Record<SubscriptionTier, string> = {
  free: 'FREE',
  pro: 'PRO',
  premium: 'PREMIUM',
}

const BADGE_ICON: Record<SubscriptionTier, string> = {
  free: 'radio_button_checked',
  pro: 'verified',
  premium: 'workspace_premium',
}

export default function MembershipBadge({ tier }: { tier: SubscriptionTier }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${BADGE_STYLE[tier]}`}
    >
      <span className="material-symbols-outlined text-[13px]">{BADGE_ICON[tier]}</span>
      {BADGE_TEXT[tier]}
    </span>
  )
}
