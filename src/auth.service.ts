import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { OtpService } from './services/otp.service';
import { DeviceService } from './services/device.service';
import { TokenService } from './services/token.service';

@Injectable()
export class AuthService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly  otpService: OtpService,
    private readonly deviceService: DeviceService,
    private readonly tokenService: TokenService
  ){}
  getHello(): string {
    return 'Hello I am auth';
  }

  async requestOtp(phoneNumber: string){
    const whitelisted = await this.prisma.whitelistedPhoneNumber.findUnique({
      where: {phoneNumber: phoneNumber},
      select: {
        phoneNumber: true, otp: true,
      }
    });

    const {otp, expiresInSeconds} = await this.otpService.generateAndStoreOtp(
      phoneNumber,
      whitelisted?.otp
    )

    if (!whitelisted) {
      //call sms service api
    }

    return {success: true, expiresInSeconds, otp}

  }

  async verifyOtp(params: {
    phoneNumber: string;
    otp: string;
    device: {
      clientDeviceId: string;
      deviceName?: string;
      userAgent?: string;
      os?: string;
      browser?: string;
      timezone?: string;
      screenResolution?: string;
    };
    ipAddress?: string;
  }){
    await this.otpService.verifyOtp(params.phoneNumber, params.otp);

    const user = await this.prisma.user.upsert({
      where: {phoneNumber: params.phoneNumber},
      update: {isPhoneNumberVerified: true, isActive: true},
      create: {
        phoneNumber: params.phoneNumber,
        isPhoneNumberVerified: true,
      }
    });

    const device = await this.deviceService.upsertDevice({
      userId: user.id,
      device: params.device,
      ipAddress: params.ipAddress,
    });

    const tokens = await this.tokenService.issueTokens({
      user: user,
      deviceId: device.id,
    });

    return {
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        roles: user.roles,
      },
      device,
      ...tokens,
    };

  }

  async refresh(params: {
    refreshToken: string;
    deviceId: string;
    fingerprint: string;
}){
    const device = await this.prisma.device.findUnique({
        where: {id: params.deviceId},
        select: {id: true, userId: true, fingerprint: true},
    });

    if (!device) {
        throw new HttpException({
            message: 'Device bot found',
        },
        HttpStatus.UNAUTHORIZED
    )
    };

    return this.tokenService.rotateRefreshToken({
        refreshToken: params.refreshToken,
        deviceId: device.id,
        expectedFingerprint: device.fingerprint,
        presentedFingerprint: params.fingerprint,
    });
}


async getAllusers(params: {
  user: {
      userId: string;
  },
  page: string;
  limit: string;
}){
  const limit = Number(params.limit);
  const page = Number(params.page);
  const skip = (page - 1) * limit;

  const [users, total] =
  await this.prisma.$transaction([
    this.prisma.user.findMany({
      where: {
        id: {
          not: params.user.userId,
        },
      },
      skip,
      take: Number(limit),
      orderBy: {
        createdAt: 'desc',
      },
    }),
    this.prisma.user.count({
      where: {
        id: {
          not: params.user.userId,
        },
      },
    }),
  ]);

  return {
      data: users,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
  }

}
}
