import { Module } from '@nestjs/common';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';

@Module({
  providers: [AllExceptionsFilter, TransformInterceptor],
  exports: [AllExceptionsFilter, TransformInterceptor],
})
export class CommonModule {}
