import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { RedisService } from "../common/redis/redis.service";
import { ConfigService } from "@nestjs/config";
import { generateOtp } from "../utils/otp.util";
import { hmacOtp, safeEqual } from "../utils/hasn.util";

type StoredOtp = {
    h: string;
}

@Injectable()
export class OtpService {
    private otpTtlSeconds: number;
    private resendCooldownSeconds: number;
    private sendLimitCount: number;
    private sendLimitWindowSeconds: number;
    private verifyAttemptLimit: number;
    private otpPepper: string;

    constructor(
        private readonly redisService: RedisService,
        config: ConfigService   
    ){
        this.otpPepper = config.getOrThrow<string>('OTP_PEPPER');
        this.otpTtlSeconds = Number(config.get('OTP_EXPIRES') ?? 300);
        this.resendCooldownSeconds = Number(
          config.get('OTP_RESEND_COOLDOWN') ?? 60,
        );
        this.sendLimitCount = 3;
        this.sendLimitWindowSeconds = 10 * 60;
        this.verifyAttemptLimit = 5;
    }

    private otpkey(phoneNumber: string) {
        return `auth:otp:${phoneNumber}`;
    }

    private sendLimitKey(phoneNumber: string) {
        return `auth:otp_send:${phoneNumber}`
    }

    private sendCooldownKey(phoneNumber: string) {
        return `auth:otp_send_cd:${phoneNumber}`
    }

    private attemptKey(phoneNumber: string) {
        return `auth:otp_attempt:${phoneNumber}`
    }

    async generateAndStoreOtp(
        phoneNumber: string, forcedOtp?: string,

    ){
        const redis = this.redisService.getClient();
        const cooldownTtl = await redis.ttl(this.sendCooldownKey(phoneNumber));

        if (cooldownTtl > 0) {
            throw new HttpException(
                {
                    message: 'OTP resend cooldown active',
                    retryAfterSeconds: cooldownTtl,
                },
                HttpStatus.TOO_MANY_REQUESTS
            )
        }

        const tx = redis.multi();
        tx.incr(this.sendLimitKey(phoneNumber))
        tx.ttl(this.sendLimitKey(phoneNumber));
        const [[,count], [, ttl]] = (await tx.exec()) ?? [];

        const sendCount = Number(count ?? 0);
        const existingTtl = Number(ttl ?? -1);
        if (existingTtl < 0) {
            await redis.expire(
                this.sendLimitKey(phoneNumber),
                this.sendLimitWindowSeconds
            )
        }

        if (sendCount > this.sendLimitCount) {
            const windowTtl = await redis.ttl(this.sendLimitKey(phoneNumber));
            throw new HttpException(
                {
                    message: 'OTP send rate limit exceeded',
                    retryAfterSeconds: Math.max(windowTtl, 0),
                },
                HttpStatus.TOO_MANY_REQUESTS
            )
        }

        const otp = forcedOtp ?? generateOtp(6);
        const payload: StoredOtp = {h: hmacOtp(otp, this.otpPepper)}
        await redis.set(
            this.otpkey(phoneNumber),
            JSON.stringify(payload),
            'EX',
            this.otpTtlSeconds
        );
        await redis.set(
            this.sendCooldownKey(phoneNumber),
            '1',
            'EX',
            this.resendCooldownSeconds,
        );
        await redis.del(this.attemptKey(phoneNumber))

        return {
            otp, 
            expiresInSeconds: this.otpTtlSeconds
        }
    }

    async verifyOtp(phoneNumber: string , otp: string) {
        const redis = this.redisService.getClient();

        const attempts = await redis.incr(this.attemptKey(phoneNumber));
        if (attempts === 1) {
            await redis.expire(this.attemptKey(phoneNumber), this.otpTtlSeconds)
        }
        if (attempts > this.verifyAttemptLimit) {
            throw new HttpException(
                {message: 'OTP verification attempts exceeded'},
                HttpStatus.TOO_MANY_REQUESTS
            )
        }

        const raw = await redis.get(this.otpkey(phoneNumber));
        if (!raw) {
            throw new HttpException(
                {message: 'OTP expired or not found'},
                HttpStatus.UNAUTHORIZED
            )
        }

        let stored: StoredOtp;
        try {
            stored = JSON.parse(raw) as StoredOtp
        } catch  {
            await redis.del(this.otpkey(phoneNumber));
            throw new HttpException(
                {message: 'OTP invalid'},
                HttpStatus.UNAUTHORIZED
            )
        }

        if (typeof stored.h !== 'string') {
            await redis.del(this.otpkey(phoneNumber));
            throw new HttpException(
                {message: 'OTP invalid'},
                HttpStatus.UNAUTHORIZED
            )
        }

        const presented = hmacOtp(otp, this.otpPepper);
        if (!safeEqual(stored.h, presented)) {
            throw new HttpException(
                {message: 'OTP invalid'},
                HttpStatus.UNAUTHORIZED
            );
        }

        await redis.del(this.otpkey(phoneNumber))
        await redis.del(this.attemptKey(phoneNumber))
        return true;
    }
}