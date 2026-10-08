import { Body, Controller, Get, HttpException, HttpStatus, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import type { Request, Response } from 'express';
import { computeFingerprint } from './utils/fingerprint.util';
import { RefreshTokenDto } from './dto/refresh-token.sto';
import { RefreshRequestDto } from './dto/refresh-request-token.dto';
import { Roles } from './decorators/roles.decorator';
import { Role } from '../generated/prisma';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import type{ JwtPayload } from './types/jwt-payload.type';

@ApiTags('Auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'Auth service health check' })
  @ApiOkResponse({ description: 'Service is running', type: String })
  getHello(): string {
    return this.authService.getHello();
  }

  @Post('request-otp')
  async requestOtp(@Body() dto: RequestOtpDto){
    return this.authService.requestOtp(dto.phoneNumber);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Res() res: Response){
    const ipAddress = req.ip;
    const result =  await this.authService.verifyOtp({
      phoneNumber: dto.phoneNumber,
      otp: dto.otp,
      device: dto.device,
      ipAddress
    })

    return res
            .status(200)
            .cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: false,
                // sameSite: 'none',
                maxAge: 30 * 24 * 60 * 60 * 1000,
            })
            .cookie('accessToken', result.accessToken, {
                httpOnly: true,
                secure: false,
                // sameSite: 'none',
                maxAge: 15 * 60 * 1000,
            })
            .json(result)

  }

  @Post('refresh')
  @ApiOperation({ summary: 'Cookie se refreshToken nikal kar new accessToken generate karna' })

  //  Yeh line Swagger UI mein ek input field bana degi Cookie ke liye
  @ApiHeader({
      name: 'Cookie',
      description: 'Format: refreshToken=Aapka_Token_Yahan',
      required: true,
      schema: {
          type: 'string',
          example: 'refreshToken=eyJhbGciOiJIUzI1NiIsInR5c...',
      },
  })
  async refresh(@Body() refdto: RefreshRequestDto, @Req() req: Request, @Res() res: Response) {
    

      const ipAddress = req.ip;
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
          throw new HttpException({
              message: 'Token can not find'
          },
              HttpStatus.NOT_FOUND)
      }
      const dto: RefreshTokenDto = {
          ...refdto,
          refreshToken: refreshToken
      }
      const fingerprint = computeFingerprint({
          clientDeviceId: dto.device.clientDeviceId,
          userAgent: dto.device.userAgent,
          os: dto.device.os,
          browser: dto.device.browser,
          timezone: dto.device.timezone,
          screenResolution: dto.device.screenResolution,
      });

      const result = await this.authService.refresh({
          refreshToken: dto.refreshToken,
          deviceId: dto.deviceId,
          fingerprint
      });

      return res
          .status(201)
          .cookie('refreshToken', result.refreshToken, {
              httpOnly: true,
              secure: false,
              // sameSite: 'none',
              maxAge: 30 * 24 * 60 * 60 * 1000,
          })
          .cookie('accessToken', result.accessToken, {
              httpOnly: true,
              secure: false,
              // sameSite: 'none',
              maxAge: 15 * 60 * 1000,
          })
          .json(result)

  }

  @Roles(Role.admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Get('allusers')
  async allUsers(@CurrentUser() user: JwtPayload,
      @Query('page') page = "1",
      @Query('limit') limit = "10",
      @Req() req: Request
  ) {
    console.log(req)
      return this.authService.getAllusers({
          user: {
              userId: user.sub
          },
          page: page,
          limit: limit,
      })
  }
}
