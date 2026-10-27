const on = (value?: string) => value === '1' || value === 'true';

/** Off unless set. Existing skill-gap and roadmap responses stay unchanged. */
export const learnerFlags = {
  readiness: () => on(process.env.READINESS_UI),
  personalRoadmap: () => on(process.env.PERSONALIZED_ROADMAP),
};
