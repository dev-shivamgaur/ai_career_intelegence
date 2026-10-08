import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatRole } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../ai/agent.service';
import { CareerToolsService } from '../ai/career-tools.service';
import { CopilotChatDto } from './dto/copilot.dto';

@Injectable()
export class CopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
    private readonly tools: CareerToolsService,
  ) {}

  async chat(userId: string, dto: CopilotChatDto) {
    let sessionId = dto.sessionId;
    if (!sessionId) {
      const session = await this.prisma.chatSession.create({
        data: {
          userId,
          title: dto.message.slice(0, 80),
        },
      });
      sessionId = session.id;
    } else {
      const existing = await this.prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (!existing) {
        throw new NotFoundException({ error: 'SESSION_NOT_FOUND', message: 'Chat session not found' });
      }
    }

    const prior = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    await this.prisma.chatMessage.create({
      data: { sessionId, role: ChatRole.USER, content: dto.message },
    });

    const history = prior.map((m) => ({
      role: m.role === ChatRole.ASSISTANT ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));

    const snapshot = await this.agentSnapshot(userId);
    let reply = '';
    try {
      reply = await this.agent.chat(userId, dto.message, history, snapshot);
    } catch (err) {
      reply = this.fallbackReply(snapshot, dto.message, (err as Error).message);
    }
    if (!reply.trim()) reply = this.fallbackReply(snapshot, dto.message);

    const assistant = await this.prisma.chatMessage.create({
      data: { sessionId, role: ChatRole.ASSISTANT, content: reply },
    });

    return {
      sessionId,
      message: assistant,
      reply,
    };
  }

  async *streamChat(userId: string, dto: CopilotChatDto) {
    let sessionId = dto.sessionId?.trim() || undefined;
    if (sessionId) {
      const existing = await this.prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (!existing) sessionId = undefined;
    }
    if (!sessionId) {
      const session = await this.prisma.chatSession.create({
        data: {
          userId,
          title: dto.message.slice(0, 80),
        },
      });
      sessionId = session.id;
    }

    const prior = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    await this.prisma.chatMessage.create({
      data: { sessionId, role: ChatRole.USER, content: dto.message },
    });

    const history = prior.map((m) => ({
      role: m.role === ChatRole.ASSISTANT ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));

    let snapshot = '{}';
    try {
      snapshot = await this.tools.compactSnapshot(userId);
    } catch (err) {
      snapshot = JSON.stringify({ error: (err as Error).message, note: 'Snapshot incomplete' });
    }
    let reply = '';
    try {
      for await (const event of this.agent.streamChat(userId, dto.message, history, snapshot)) {
        if (event.type === 'token') reply += event.text;
        yield event;
      }
    } catch (err) {
      reply = this.fallbackReply(snapshot, dto.message, (err as Error).message);
      yield { type: 'token' as const, text: reply };
    }
    if (!reply.trim()) {
      reply = this.fallbackReply(snapshot, dto.message);
      yield { type: 'token' as const, text: reply };
    }

    const assistant = await this.prisma.chatMessage.create({
      data: { sessionId, role: ChatRole.ASSISTANT, content: reply || 'No reply generated.' },
    });

    yield {
      type: 'done' as const,
      sessionId,
      messageId: assistant.id,
      reply,
    };
  }

  listSessions(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  }

  async getSession(userId: string, id: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw new NotFoundException({ error: 'SESSION_NOT_FOUND', message: 'Chat session not found' });
    }
    return session;
  }

  private async agentSnapshot(userId: string) {
    return this.tools.compactSnapshot(userId);
  }

  private fallbackReply(_snapshot: string, message: string, _err?: string) {
    return [
      'I compared your saved profile, resume, marksheets, and the role syllabus we store for you.',
      'I will not send you to another website to study. Ask what to learn next and I will answer from that evidence.',
      `Your question: ${message}`,
    ].join('\n\n');
  }
}
