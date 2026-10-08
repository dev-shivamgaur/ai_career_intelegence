import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { Reflector } from "@nestjs/core";
import { Role } from "../../generated/prisma/client";
import type { Request } from "express";
import { JwtPayload } from "../types/jwt-payload.type";

type AuthenticatedRequest = Request & { user: JwtPayload };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles =
      this.reflector.getAllAndOverride<Role[]>(
        ROLES_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (!requiredRoles) {
      return true;
    }


    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    
    const user: JwtPayload = request.user;
    console.log(user, requiredRoles);

    return user.roles.some(role => requiredRoles.includes(role))
  }
}