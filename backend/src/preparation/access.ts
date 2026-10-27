import { NotFoundException } from '@nestjs/common';

/** Another user's session id is the same as a missing session: 404, with no body that confirms it exists. */
export function requireOwnedSession<T extends { userId: string }>(session: T | null, userId: string): T {
  if (!session || session.userId !== userId) {
    throw new NotFoundException({ error: 'PREP_SESSION_NOT_FOUND', message: 'Preparation session not found' });
  }
  return session;
}
