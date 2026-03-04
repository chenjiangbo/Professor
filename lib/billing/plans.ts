export type BillingPlan = {
  id: string
  name: string
  amount: string
  subject: string
  durationDays: number
}

const BILLING_PLANS: Record<string, BillingPlan> = {
  pro_monthly: {
    id: 'pro_monthly',
    name: 'Professor Pro Monthly',
    amount: '19.00',
    subject: 'Professor Pro Monthly',
    durationDays: 30,
  },
  pro_yearly: {
    id: 'pro_yearly',
    name: 'Professor Pro Yearly',
    amount: '199.00',
    subject: 'Professor Pro Yearly',
    durationDays: 365,
  },
}

export function getBillingPlan(planId: string): BillingPlan {
  const plan = BILLING_PLANS[planId]
  if (!plan) {
    throw new Error(`Unsupported billing plan: ${planId}`)
  }
  return plan
}

export function listBillingPlans(): BillingPlan[] {
  return Object.values(BILLING_PLANS)
}
