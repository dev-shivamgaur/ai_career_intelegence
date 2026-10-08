import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

function asInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    let retryAfterSeconds: number | undefined;
    let remainingAttempts: number | undefined;
    let sendsRemaining: number | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'ERROR';
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        const msg = obj.message;
        message = Array.isArray(msg) ? msg.join(', ') : String(msg ?? exception.message);
        code = String(obj.error ?? HttpStatus[status] ?? 'ERROR');
        retryAfterSeconds = asInt(obj.retryAfterSeconds);
        remainingAttempts = asInt(obj.remainingAttempts);
        sendsRemaining = asInt(obj.sendsRemaining);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(retryAfterSeconds != null ? { retryAfterSeconds } : {}),
        ...(remainingAttempts != null ? { remainingAttempts } : {}),
        ...(sendsRemaining != null ? { sendsRemaining } : {}),
      },
    });
  }
}
