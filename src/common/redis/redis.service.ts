import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";


@Injectable()
export class RedisService implements OnModuleDestroy {
    private client: Redis;

    constructor(config: ConfigService) {
        const url = config.getOrThrow<string>('REDIS_URL');
        this.client = new Redis(url, {
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
        });
    }

    getClient() {
        return this.client;
    }

    async onModuleDestroy() {
        try {
            await this.client.quit();
        } catch (error)  {
            console.log("Redis config error", error)
            // ignore
        }
    }
}