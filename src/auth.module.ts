import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { OtpService } from './services/otp.service';
import { JwtModule } from '@nestjs/jwt';
import { DeviceService } from './services/device.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PassportModule } from '@nestjs/passport';
import { RedisAuthModule } from './common/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/auth-service/.env',
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      })
    }),
    PrismaModule,
    RedisAuthModule
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    DeviceService,
    TokenService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    

  ],
  exports: [
    JwtAuthGuard,
    RolesGuard,
    JwtStrategy
  ]
})
export class AuthServiceModule {}
