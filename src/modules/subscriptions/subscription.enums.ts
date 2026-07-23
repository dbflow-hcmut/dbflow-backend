export enum SubscriptionStatus {
  Trialing = 'trialing',
  Active = 'active',
  PastDue = 'past_due',
  Canceled = 'canceled',
  Expired = 'expired',
  Paused = 'paused',
}

export enum BillingCycle {
  Monthly = 'monthly',
  Yearly = 'yearly',
  Custom = 'custom',
}

export enum PlanWorkspaceType {
  Personal = 'personal',
  Team = 'team',
  Any = 'any',
}
