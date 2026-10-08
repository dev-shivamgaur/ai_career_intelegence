import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';


export const ROLES_KEY = 'roles';

/** Require JWT user to have at least one of these roles (OR). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
