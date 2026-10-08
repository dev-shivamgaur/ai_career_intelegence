import { Injectable } from '@nestjs/common';
import { DeviceDto } from '../dto/device.dto';
import { PrismaService } from '../prisma/prisma.service';
import { computeFingerprint } from '../utils/fingerprint.util';


@Injectable()
export class DeviceService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertDevice(params: {
    userId: string;
    device: DeviceDto;
    ipAddress?: string;
  }) {
    const fingerprint = computeFingerprint({
      clientDeviceId: params.device.clientDeviceId,
      userAgent: params.device.userAgent,
      os: params.device.os,
      browser: params.device.browser,
      timezone: params.device.timezone,
      screenResolution: params.device.screenResolution,
    });

    const existing = await this.prisma.device.findFirst({
      where: { userId: params.userId, fingerprint },
    });

    if (existing) {
      return this.prisma.device.update({
        where: { id: existing.id },
        data: {
          deviceName: params.device.deviceName ?? existing.deviceName,
          userAgent: params.device.userAgent ?? existing.userAgent,
          ipAddress: params.ipAddress ?? existing.ipAddress,
          lastUsedAt: new Date(),
        },
      });
    }

    return this.prisma.device.create({
      data: {
        userId: params.userId,
        fingerprint,
        deviceName: params.device.deviceName,
        userAgent: params.device.userAgent,
        ipAddress: params.ipAddress,
        lastUsedAt: new Date(),
      },
    });
  }

  async listDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async deleteDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) return null;
    await this.prisma.device.delete({ where: { id: deviceId } });
    return device;
  }
}
