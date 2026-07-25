import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { PlanWorkspaceType } from '@/modules/subscriptions/subscription.enums';

export class CreatePlanDto {
  @IsString() @MaxLength(50) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsEnum(PlanWorkspaceType) workspaceType: PlanWorkspaceType;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsNumberString() monthlyBasePrice: string;
  @IsNumberString() yearlyBasePrice: string;
  @IsOptional() @IsNumberString() monthlySeatPrice?: string;
  @IsOptional() @IsNumberString() yearlySeatPrice?: string;
  @IsOptional() @IsInt() @Min(1) includedSeats?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsObject() limits?: Record<string, number | null>;
  @IsOptional() @IsObject() features?: Record<string, boolean>;
  @IsOptional() @IsString() @MaxLength(120) aiModel?: string | null;
}
