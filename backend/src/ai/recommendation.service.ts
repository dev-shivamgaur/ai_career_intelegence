import { Injectable } from '@nestjs/common';

@Injectable()
export class RecommendationService {
  estimateCareerMatch(input: {
    skillScore: number;
    projectScore: number;
    educationScore: number;
    experienceScore: number;
    marketScore: number;
  }): { estimatedMatch: number; breakdown: typeof input } {
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const estimatedMatch = clamp(
      input.skillScore * 0.35 +
        input.projectScore * 0.25 +
        input.educationScore * 0.15 +
        input.experienceScore * 0.1 +
        input.marketScore * 0.15,
    );
    return { estimatedMatch, breakdown: input };
  }
}
