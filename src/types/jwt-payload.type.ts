import { Role } from "../../generated/prisma/client";



export type JwtPayload = {
    sub: string;
    phoneNumber: string;
    roles: Role[];
    deviceId: string;
  };