import { Global, Module } from '@nestjs/common';
import { CareerToolsService } from './career-tools.service';
import { AgentService } from './agent.service';
import { SarkariModule } from '../sarkari/sarkari.module';

@Global()
@Module({
  imports: [SarkariModule],
  providers: [CareerToolsService, AgentService],
  exports: [CareerToolsService, AgentService],
})
export class AgentModule {}
