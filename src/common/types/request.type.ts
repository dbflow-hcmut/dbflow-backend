import { Request } from 'express';
import { Role } from '@/common/enums/role.enum';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: Role[];
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}







