import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BillingCycle } from '@/modules/subscriptions/subscription.enums';

export class CreateCheckoutDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  workspaceName?: string;

  @IsString()
  planCode: string;

  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}
