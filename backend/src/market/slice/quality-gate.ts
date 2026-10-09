/** M6 go / no-go gate. Targets are the plan's proposals; the admin confirms or overrides them. */
export const GATE_TARGETS = {
  minSample: 50,
  extractionPrecision: 0.85,
  extractionRecall: 0.7,
  classificationPrecision: 0.9,
  falseMerges: 0,
  unresolvedRate: 0.2,
  consecutiveCleanRuns: 3,
};
export type GateTargets = typeof GATE_TARGETS;

/** One hand-labelled job. Keys are canonical skill keys and career slugs, compared as sets. */
export type GateItem = {
  label: { careers: string[]; skills: string[]; falseMerge?: boolean };
  predicted: { careers: string[]; skills: string[] };
};

type Counts = { tp: number; fp: number; fn: number; precision: number | null; recall: number | null };

function score(pairs: Array<[string[], string[]]>): Counts {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const [predicted, truth] of pairs) {
    const p = new Set(predicted);
    const t = new Set(truth);
    for (const x of p) (t.has(x) ? (tp += 1) : (fp += 1));
    for (const x of t) if (!p.has(x)) fn += 1;
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    tp,
    fp,
    fn,
    precision: tp + fp ? round(tp / (tp + fp)) : null,
    recall: tp + fn ? round(tp / (tp + fn)) : null,
  };
}

/** Micro-averaged precision and recall over all labelled jobs. */
export function evaluateSample(items: GateItem[]) {
  return {
    jobs: items.length,
    extraction: score(items.map((i) => [i.predicted.skills, i.label.skills])),
    classification: score(items.map((i) => [i.predicted.careers, i.label.careers])),
    falseMerges: items.filter((i) => i.label.falseMerge).length,
  };
}

export type GateInput = ReturnType<typeof evaluateSample> & { unresolvedRate: number | null; consecutiveCleanRuns: number };

export function gateVerdict(m: GateInput, t: GateTargets = GATE_TARGETS) {
  const checks = [
    { name: 'labelled sample size', value: m.jobs, target: `>= ${t.minSample}`, pass: m.jobs >= t.minSample },
    { name: 'extraction precision', value: m.extraction.precision, target: `>= ${t.extractionPrecision}`, pass: (m.extraction.precision ?? 0) >= t.extractionPrecision },
    { name: 'extraction recall', value: m.extraction.recall, target: `>= ${t.extractionRecall}`, pass: (m.extraction.recall ?? 0) >= t.extractionRecall },
    { name: 'classification precision', value: m.classification.precision, target: `>= ${t.classificationPrecision}`, pass: (m.classification.precision ?? 0) >= t.classificationPrecision },
    { name: 'false dedupe merges', value: m.falseMerges, target: `<= ${t.falseMerges}`, pass: m.falseMerges <= t.falseMerges },
    { name: 'unresolved skill rate', value: m.unresolvedRate, target: `< ${t.unresolvedRate}`, pass: m.unresolvedRate !== null && m.unresolvedRate < t.unresolvedRate },
    { name: 'consecutive clean fetch runs', value: m.consecutiveCleanRuns, target: `>= ${t.consecutiveCleanRuns}`, pass: m.consecutiveCleanRuns >= t.consecutiveCleanRuns },
  ];
  return { checks, verdict: checks.every((c) => c.pass) ? ('GO' as const) : ('FIX' as const) };
}
