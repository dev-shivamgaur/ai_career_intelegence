import { Injectable } from '@nestjs/common';
import { withTimeout } from '../rag/qdrant-client';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import { LlmService, messageText } from './llm.service';
import { CareerToolsService } from './career-tools.service';
import { RagService } from '../rag/rag.service';
import { RecommendationService } from './recommendation.service';
import { WebResearchService } from '../web/web-research.service';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { GithubAnalyzeService } from '../web/github-analyze.service';
import { SkillMatchAgentService } from './skill-match-agent.service';
import {
  careerAnalysisSchema,
  researchReportSchema,
  roadmapPlanSchema,
  type CareerAnalysisResult,
  type ResearchReportResult,
  type RoadmapPlanResult,
} from './agent.schemas';

const querySchema = z.object({
  query: z.string().describe('Search query in natural language'),
});

@Injectable()
export class AgentService {
  constructor(
    private readonly llm: LlmService,
    private readonly toolsApi: CareerToolsService,
    private readonly rag: RagService,
    private readonly recommendations: RecommendationService,
    private readonly web: WebResearchService,
    private readonly corpus: RoadmapCorpusService,
    private readonly github: GithubAnalyzeService,
    private readonly matchAgent: SkillMatchAgentService,
  ) {}

  async chat(
    userId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    snapshot = '',
  ) {
    return this.runToolLoop(userId, this.copilotSeed(message, history, snapshot), 2, true);
  }

  async *streamChat(
    userId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    snapshot = '',
  ): AsyncGenerator<{ type: 'status' | 'token'; text: string }> {
    yield* this.runToolLoopStream(userId, this.copilotSeed(message, history, snapshot), 2, true);
  }

  private copilotSeed(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    snapshot = '',
  ): BaseMessage[] {
    const system = `You are AI Career Copilot for this signed-in user.
Ground answers only in the snapshot below plus tools. Never mention third-party syllabus websites.
Do not tell the user to go read an external site. Teach the next step here.
Answer from the snapshot first when it is enough. Call at most one tool before your final reply unless the user asked for live data.
Use retrieve_knowledge only if the snapshot is not enough.
Do not invent exam dates or job openings. Never promise a job.
Never paste source URLs unless the user asked for a citation.

User snapshot:
${snapshot}

LANGUAGE (mandatory — match the user's last message exactly):
- If they wrote in English: reply in simple English only.
- If they wrote in Hindi with Devanagari: reply in Hindi Devanagari.
- If they wrote Hinglish in English letters: reply in Hinglish, English alphabet only.${
      snapshot.includes('GOVERNMENT_EXAM') || snapshot.includes('Sarkari track')
        ? `

This user is on the sarkari exam track. Use get_sarkari_judgment and list_government_exams. Do not talk about Node.js, FitScore, or private tech stacks unless they ask.`
        : ''
    }`;

    return [
      new SystemMessage(system),
      ...history.slice(-10).map((m) =>
        m.role === 'assistant' ? new AIMessage(m.content) : new HumanMessage(m.content),
      ),
      new HumanMessage(
        `Reply in the same language and writing system as this message (English / Hindi Devanagari / Hinglish in English letters).\n\n${message}`,
      ),
    ];
  }

  async analyzeCareer(userId: string) {
    const transcript = await this.runToolLoop(userId, [
      new SystemMessage(
        `You are a career analysis agent. Call get_my_profile, get_documents, get_career_goal, get_skill_gaps, get_learning_progress.
Do not mention third-party syllabus websites. Then stop. Do not write a final user essay.
Never invent documents the user does not have.`,
      ),
      new HumanMessage(
        'Gather evidence to estimate how this user fits their active career goal. Use retrieve_knowledge for market patterns.',
      ),
    ]);

    const structured = await this.llm
      .chat({ temperature: 0 })
      .withStructuredOutput(careerAnalysisSchema)
      .invoke([
        new SystemMessage(
          `Score 0-100 using only the transcript. evidence.kind must be profile|document|market|research|exam.
If a dimension has little evidence, score conservatively. Do not invent employers.`,
        ),
        new HumanMessage(transcript),
      ]);

    const parsed = careerAnalysisSchema.parse(structured) as CareerAnalysisResult;
    const { estimatedMatch } = this.recommendations.estimateCareerMatch({
      skillScore: parsed.skillScore,
      projectScore: parsed.projectScore,
      educationScore: parsed.educationScore,
      experienceScore: parsed.experienceScore,
      marketScore: parsed.marketScore,
    });
    return {
      estimatedMatch,
      breakdown: {
        skills: parsed.skillScore,
        projects: parsed.projectScore,
        education: parsed.educationScore,
        experience: parsed.experienceScore,
        marketAlignment: parsed.marketScore,
      },
      whyItMayFit: parsed.whyItMayFit,
      strongAreas: parsed.strongAreas,
      missingAreas: parsed.missingAreas,
      potentialChallenges: parsed.potentialChallenges,
      evidence: parsed.evidence,
    };
  }

  async research(userId: string, query: string): Promise<ResearchReportResult> {
    const transcript = await this.runToolLoop(userId, [
      new SystemMessage(
        `You are a career research agent. Use search_web, search_wikipedia, search_market_rss, retrieve_knowledge, get_my_profile, and get_learning_progress.
Prefer live URLs from tools. Then stop so a structured report can be written.`,
      ),
      new HumanMessage(`Research this query and gather sources: ${query}`),
    ]);

    const structured = await this.llm
      .chat({ temperature: 0 })
      .withStructuredOutput(researchReportSchema)
      .invoke([
        new SystemMessage(
          `Build a research report from the transcript. source.type must be JOB|LEARNING|GOVERNMENT|CAREER_GUIDE|COMMUNITY.
quality must be OFFICIAL|TRUSTED|ESTABLISHED|COMMUNITY|UNVERIFIED.
Use real URLs and domains from the tool output when present.`,
        ),
        new HumanMessage(transcript),
      ]);
    return researchReportSchema.parse(structured);
  }

  async generateRoadmap(userId: string): Promise<RoadmapPlanResult> {
    const transcript = await this.runToolLoop(userId, [
      new SystemMessage(
        `You are a learning-roadmap agent. Load profile, documents, skill gaps, get_learning_progress.
Do not mention third-party syllabus websites. Then stop for structured task JSON. All tasks start as not started.`,
      ),
      new HumanMessage('Create a 7/30/60/90/180 day roadmap grounded in this user skill gaps.'),
    ]);

    const structured = await this.llm
      .chat({ temperature: 0 })
      .withStructuredOutput(roadmapPlanSchema)
      .invoke([
        new SystemMessage(
          'Emit a practical roadmap. phase must be D7, D30, D60, D90, or D180. priority HIGH|MEDIUM|LOW.',
        ),
        new HumanMessage(transcript),
      ]);
    return roadmapPlanSchema.parse(structured);
  }

  private toolsFor(userId: string, copilot = false): StructuredToolInterface[] {
    const all = [
      tool(async ({ query }) => {
        try {
          return await this.rag.buildContext(query, userId);
        } catch (err) {
          return `Knowledge search failed: ${(err as Error).message}`;
        }
      }, {
        name: 'retrieve_knowledge',
        description:
          'Semantic search over stored role syllabus, corpus, and this user documents. Do not expose source site names.',
        schema: querySchema,
      }),
      tool(async ({ query }) => this.web.searchMarketJson(query), {
        name: 'search_web',
        description:
          'Live search: DuckDuckGo + Google News RSS for a role, qualification, or skill. Returns titles, URLs, snippets.',
        schema: querySchema,
      }),
      tool(async ({ query }) => JSON.stringify(await this.web.wikipedia(query)), {
        name: 'search_wikipedia',
        description: 'Search Wikipedia for a technology, exam, or career topic.',
        schema: querySchema,
      }),
      tool(async ({ query }) => JSON.stringify(await this.web.googleNewsRss(query)), {
        name: 'search_market_rss',
        description: 'Google News RSS for current hiring / skill demand headlines.',
        schema: querySchema,
      }),
      tool(async () => {
        try {
          return JSON.stringify(await this.corpus.learningProgress(userId));
        } catch (err) {
          return JSON.stringify({ error: (err as Error).message });
        }
      }, {
        name: 'get_learning_progress',
        description:
          'Compare the user skills, certificates, resume, and document extractions against the stored role syllabus.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.getMyProfile(userId), {
        name: 'get_my_profile',
        description: 'Load the signed-in user profile, skills, education, and projects.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.getCareerGoal(userId), {
        name: 'get_career_goal',
        description: 'Active career goal, requirements, and last analysis scores.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.getSkillGaps(userId), {
        name: 'get_skill_gaps',
        description: 'Current skill gaps vs the target career.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.getRoadmap(userId), {
        name: 'get_roadmap',
        description: 'Existing learning roadmap tasks and status.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.getDocuments(userId), {
        name: 'get_documents',
        description: 'Uploaded documents and AI extractions.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.listJobs(), {
        name: 'list_jobs',
        description: 'Job descriptions stored in the platform database.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.listJobMatches(userId), {
        name: 'list_job_matches',
        description: 'Saved job match percentages for this user.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.listGovernmentOpportunities(userId), {
        name: 'list_government_opportunities',
        description: 'Government trainee/apprentice style opportunities.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.listGovernmentExams(userId), {
        name: 'list_government_exams',
        description: 'Government exam catalog, syllabus topics, and the user plan.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => this.toolsApi.getSarkariJudgment(userId), {
        name: 'get_sarkari_judgment',
        description:
          'Age, education, and knowledge flags from local papers and the selected exam catalog. Not a legal certificate.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async ({ query }) => this.toolsApi.retrieveSarkariKnowledge(userId, query), {
        name: 'retrieve_sarkari_knowledge',
        description:
          'Search the sarkari Qdrant collection (catalog + cached notices). Always tell the user to verify official notices.',
        schema: querySchema,
      }),
      tool(async () => this.toolsApi.getLatestResearch(userId), {
        name: 'get_latest_research',
        description: 'Most recent research session summary, sources, and findings.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async () => JSON.stringify(await this.matchAgent.matchAndSuggest(userId)), {
        name: 'match_skills_to_market',
        description:
          'Match this user Have skills to the active career Want list. Returns confirmed, missing core, and stretch/advanced suggestions.',
        schema: z.object({ reason: z.string().optional() }),
      }),
      tool(async ({ url }: { url: string }) => {
        if (!this.github.isGithubRepo(url)) return 'Not a public GitHub repository URL.';
        const row = await this.github.analyzeUrl(url);
        return row ? JSON.stringify(row) : 'Could not analyze that repository (private or missing).';
      }, {
        name: 'analyze_github_repo',
        description: 'Analyze a public GitHub repo via tree/languages/sample files. Do not request the whole zip.',
        schema: z.object({ url: z.string().describe('https://github.com/owner/repo') }),
      }),
      tool(async () => this.toolsApi.getLatestResearch(userId), {
        name: 'get_latest_research',
        description: 'Most recent research session summary, sources, and findings.',
        schema: z.object({ reason: z.string().optional() }),
      }),
    ];
    if (!copilot) return all;
    const allow = new Set([
      'retrieve_knowledge',
      'get_learning_progress',
      'get_documents',
      'get_my_profile',
      'get_career_goal',
      'get_sarkari_judgment',
      'retrieve_sarkari_knowledge',
      'list_government_exams',
      'analyze_github_repo',
    ]);
    return all.filter((t) => allow.has(t.name));
  }

  private async *runToolLoopStream(
    userId: string,
    seed: BaseMessage[],
    maxSteps = 8,
    copilot = false,
  ): AsyncGenerator<{ type: 'status' | 'token'; text: string }> {
    const tools = this.toolsFor(userId, copilot);
    let bound;
    try {
      bound = this.llm.chat().bindTools(tools);
    } catch (err) {
      yield {
        type: 'token',
        text: `Copilot could not start: ${(err as Error).message}. Your profile and documents are still saved.`,
      };
      return;
    }
    const messages = [...seed];

    for (let step = 0; step < maxSteps; step++) {
      yield { type: 'status', text: step === 0 ? 'Reading your profile…' : 'Working on the next step…' };
      let acc: AIMessageChunk | undefined;
      try {
        const stream = await bound.stream(messages);
        for await (const chunk of stream) {
          acc = acc ? acc.concat(chunk) : chunk;
          const toolish = Boolean(chunk.tool_call_chunks?.length || chunk.tool_calls?.length);
          if (!toolish) {
            const text = messageText(chunk.content);
            if (text) yield { type: 'token', text };
          }
        }
      } catch (err) {
        yield {
          type: 'token',
          text: `Copilot hit an error: ${(err as Error).message}. Ask again in a moment.`,
        };
        return;
      }

      const ai = acc ?? new AIMessageChunk({ content: '' });
      messages.push(ai);
      const calls = ai.tool_calls ?? [];
      if (!calls.length) {
        if (!messageText(ai.content)) {
          yield { type: 'token', text: this.transcript(messages).slice(-800) };
        }
        return;
      }

      for (const call of calls) {
        yield { type: 'status', text: `Checking ${call.name.replace(/_/g, ' ')}…` };
        const chosen = tools.find((t) => t.name === call.name);
        let output = `Unknown tool: ${call.name}`;
        if (chosen) {
          try {
            output = String(
              await withTimeout(chosen.invoke(call.args ?? {}), 18_000, `Tool ${call.name}`),
            );
          } catch (err) {
            output = `Tool ${call.name} failed: ${(err as Error).message}`;
          }
        }
        messages.push(
          new ToolMessage({
            content: output.slice(0, 12000),
            tool_call_id: call.id ?? call.name,
          }),
        );
      }
    }
    yield { type: 'token', text: this.transcript(messages).slice(-800) };
  }

  private async runToolLoop(userId: string, seed: BaseMessage[], maxSteps = 8, copilot = false): Promise<string> {
    const tools = this.toolsFor(userId, copilot);
    const bound = this.llm.chat().bindTools(tools);
    const messages = [...seed];

    for (let step = 0; step < maxSteps; step++) {
      const ai = await bound.invoke(messages);
      messages.push(ai);
      const calls = ai.tool_calls ?? [];
      if (!calls.length) {
        return messageText(ai.content) || this.transcript(messages);
      }
      for (const call of calls) {
        const chosen = tools.find((t) => t.name === call.name);
        let output = `Unknown tool: ${call.name}`;
        if (chosen) {
          try {
            output = String(await chosen.invoke(call.args ?? {}));
          } catch (err) {
            output = `Tool ${call.name} failed: ${(err as Error).message}`;
          }
        }
        messages.push(
          new ToolMessage({
            content: output.slice(0, 12000),
            tool_call_id: call.id ?? call.name,
          }),
        );
      }
    }
    return this.transcript(messages);
  }

  private transcript(messages: BaseMessage[]): string {
    return messages
      .map((m) => {
        const role = m instanceof HumanMessage ? 'user' : m instanceof AIMessage ? 'assistant' : m._getType();
        return `${role}: ${messageText(m.content)}`;
      })
      .join('\n\n')
      .slice(0, 24000);
  }
}
