export const COPILOT_OPEN_EVENT = "careerforge:copilot-open";

export type CopilotOpenDetail = {
  q?: string;
};

export function openCopilot(detail?: CopilotOpenDetail) {
  window.dispatchEvent(new CustomEvent(COPILOT_OPEN_EVENT, { detail: detail ?? {} }));
}
