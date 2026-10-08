import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntelConfigController } from './intel-config.controller';
import { IntelConfigService } from './intel-config.service';

@Module({
  imports: [AuthModule],
  controllers: [IntelConfigController],
  providers: [IntelConfigService],
  exports: [IntelConfigService],
})
export class IntelConfigModule {}
