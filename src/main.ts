import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { setupMicroserviceSwagger } from '@rash-pulse/swagger';

import { AuthServiceModule } from './auth.module';

import cookieParser from "cookie-parser"

async function bootstrap() {
  const app =
    await NestFactory.create(AuthServiceModule);

  const configService =
    app.get(ConfigService);

  app.enableCors({
    origin:
      configService.get<string>('CORS_ORIGIN') ??
      'http://localhost:8000',

    credentials: true,
  });
  app.use(cookieParser());

  setupMicroserviceSwagger(
    app,
    configService,
    {
      title:
        'RashPulse Auth Microservice',

      description:
        'User signup, login aur security endpoints',

      serverUrl:
        'http://localhost:8000/api/v1/auth',
    },
  );

  const port =
    configService.get<number>('PORT') ??
    5001;

  await app.listen(port);

  console.log(
    `🔐 Auth Service : http://localhost:${port}`,
  );

  console.log(
    `📄 Swagger UI : http://localhost:${port}/docs`,
  );

  console.log(
    `📄 Swagger JSON : http://localhost:${port}/docs-json`,
  );
}

bootstrap();