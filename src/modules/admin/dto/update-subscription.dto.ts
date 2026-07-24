import { IsIn, IsString, MaxLength } from 'class-validator';

export const ADMIN_SUBSCRIPTION_ACTIONS = [
  'pause',
  'resume',
  'cancel_at_period_end',
  'resume_renewal',
  'revoke',
] as const;

export type AdminSubscriptionAction =
  (typeof ADMIN_SUBSCRIPTION_ACTIONS)[number];

export class UpdateSubscriptionDto {
  @IsIn(ADMIN_SUBSCRIPTION_ACTIONS)
  action: AdminSubscriptionAction;

  @IsString()
  @MaxLength(1000)
  reason: string;
}
