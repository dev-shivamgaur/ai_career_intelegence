import { TaskStatus } from '../prisma/client';

/** Skip writes status only. Add note writes note only. Neither field is inferred. */
export function roadmapTaskPatch(dto: { status?: TaskStatus | null; note?: string | null }) {
  return {
    ...(dto.status ? { status: dto.status } : {}),
    ...(dto.note !== undefined ? { note: dto.note } : {}),
  };
}
