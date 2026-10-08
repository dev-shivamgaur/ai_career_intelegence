import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SendOtpDto, VerifyOtpDto, RefreshDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { DeviceFingerprint } from '../token/device-fingerprint';

function readCookie(req: Request, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = req.cookies?.[name] as string | undefined;
    if (value) return value;
  }
  return undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('send-otp')
  @ApiOperation({
    summary: 'Send or resend phone OTP',
    description:
      'Stores a hashed OTP in Redis for 5 minutes. One send per 60 seconds, max 3 sends per 10 minutes. The response never includes the code.',
  })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.auth.sendOtp(dto.phone);
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fingerprint = DeviceFingerprint.fromRequest(req);
    const result = await this.auth.verifyOtp(dto.phone, dto.code, fingerprint, dto.name);
    this.auth.attachAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  @Post('refresh')
  @ApiCookieAuth('refreshToken')
  @ApiOperation({ summary: 'Mint a new access token from the refresh cookie without rotating refresh' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto?.refreshToken || readCookie(req, 'refreshToken', 'refresh_token');
    const result = await this.auth.refresh(token, DeviceFingerprint.fromRequest(req));
    this.auth.attachAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    };
  }

  @Post('logout')
  @ApiBearerAuth()
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refresh = dto?.refreshToken || readCookie(req, 'refreshToken', 'refresh_token');
    const result = await this.auth.logout(undefined, refresh);
    this.auth.clearAuthCookies(res);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}
