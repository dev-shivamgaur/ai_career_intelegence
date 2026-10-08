import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CopilotService } from './copilot.service';
import { CopilotChatDto } from './dto/copilot.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('copilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() dto: CopilotChatDto) {
    return this.copilot.chat(user.userId, dto);
  }

  @Post('chat/stream')
  async stream(
    @CurrentUser() user: AuthUser,
    @Body() dto: CopilotChatDto,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    try {
      for await (const event of this.copilot.streamChat(user.userId, dto)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', text: (err as Error).message || 'Stream failed' })}\n\n`,
      );
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.copilot.listSessions(user.userId);
  }

  @Get('sessions/:id')
  session(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.copilot.getSession(user.userId, id);
  }
}
