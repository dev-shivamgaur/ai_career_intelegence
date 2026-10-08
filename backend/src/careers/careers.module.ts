import { Module } from '@nestjs/common';
import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';
import { AuthModule } from '../auth/auth.module';
import { SarkariModule } from '../sarkari/sarkari.module';

@Module({
  imports: [AuthModule, SarkariModule],
  controllers: [CareersController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
