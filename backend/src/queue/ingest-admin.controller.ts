import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { IngestRunService } from './ingest-run.service';

@ApiTags('admin-ingest')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/ingest')
export class IngestAdminController {
  constructor(private readonly runs: IngestRunService) {}

  @Get('runs')
  listRuns() {
    return this.runs.listRuns();
  }

  @Get('runs/:runId')
  async getRun(@Param('runId') runId: string) {
    const run = await this.runs.getRun(runId);
    if (!run) {
      throw new NotFoundException({ error: 'INGEST_RUN_NOT_FOUND', message: 'Ingest run not found' });
    }
    return run;
  }
}
