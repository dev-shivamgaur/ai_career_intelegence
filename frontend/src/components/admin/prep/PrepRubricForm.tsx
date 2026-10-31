import { FieldInput, FieldSelect, FieldTextarea, SectionCard } from "@/components/admin/prep/Field";
import {
  listToLines,
  linesToList,
  type PrepContentForm,
  type PrepRubricForm as Form,
} from "@/components/admin/prep/prepFormTypes";

type Props = {
  value: Form;
  content: PrepContentForm;
  onChange: (next: Form) => void;
  disabled?: boolean;
};

export function PrepRubricForm({ value, content, onChange, disabled }: Props) {
  function ensureQuestion(key: string) {
    if (value.questions[key]) return value.questions[key];
    return { keywords: [] as string[], rubricPoints: [] as string[] };
  }

  function ensureTask(key: string) {
    if (value.tasks[key]) return value.tasks[key];
    return { acceptPatterns: [] as string[] };
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Pass line" description="Minimum score (0–100) to pass the package">
        <FieldInput
          label="Pass score"
          required
          type="number"
          min={0}
          max={100}
          value={value.passLine}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, passLine: Number(e.target.value) || 0 })}
        />
      </SectionCard>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Question answers (admin-only)</h3>
        {content.questions.map((q) => {
          const row = ensureQuestion(q.key);
          return (
            <SectionCard key={q.key} title={q.key} description={q.prompt.slice(0, 80) || q.type}>
              <div className="grid gap-3 sm:grid-cols-2">
                {q.type === "mcq" ? (
                  <FieldSelect
                    label="Correct option"
                    required
                    value={row.correctOptionId ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        questions: {
                          ...value.questions,
                          [q.key]: { ...row, correctOptionId: e.target.value || undefined },
                        },
                      })
                    }
                  >
                    <option value="">Select correct option</option>
                    {q.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id}: {o.label || "(empty)"}
                      </option>
                    ))}
                  </FieldSelect>
                ) : (
                  <div className="sm:col-span-2">
                    <FieldTextarea
                      label="Model answer"
                      hint="Ideal answer for grading"
                      rows={3}
                      value={row.modelAnswer ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          questions: {
                            ...value.questions,
                            [q.key]: { ...row, modelAnswer: e.target.value || undefined },
                          },
                        })
                      }
                    />
                  </div>
                )}
                <FieldTextarea
                  label="Keywords"
                  hint="one per line"
                  rows={2}
                  value={listToLines(row.keywords)}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      questions: {
                        ...value.questions,
                        [q.key]: { ...row, keywords: linesToList(e.target.value) },
                      },
                    })
                  }
                />
                <FieldTextarea
                  label="Rubric points"
                  hint="one per line"
                  rows={2}
                  value={listToLines(row.rubricPoints)}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      questions: {
                        ...value.questions,
                        [q.key]: { ...row, rubricPoints: linesToList(e.target.value) },
                      },
                    })
                  }
                />
              </div>
            </SectionCard>
          );
        })}
      </div>

      {content.tasks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Task grading</h3>
          {content.tasks.map((t) => {
            const row = ensureTask(t.key);
            return (
              <SectionCard key={t.key} title={t.key} description={t.required ? "Required task" : "Optional task"}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldSelect
                    label="Evidence kind"
                    value={row.evidenceKind ?? t.evidenceKind}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        tasks: {
                          ...value.tasks,
                          [t.key]: {
                            ...row,
                            evidenceKind: (e.target.value || undefined) as typeof row.evidenceKind,
                          },
                        },
                      })
                    }
                  >
                    <option value="github">GitHub</option>
                    <option value="url">URL</option>
                    <option value="text">Text</option>
                    <option value="none">None</option>
                  </FieldSelect>
                  <FieldInput
                    label="Min score"
                    type="number"
                    min={0}
                    max={100}
                    value={row.minScore ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        tasks: {
                          ...value.tasks,
                          [t.key]: {
                            ...row,
                            minScore: e.target.value === "" ? undefined : Number(e.target.value),
                          },
                        },
                      })
                    }
                  />
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={Boolean(row.requiresGithub)}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          tasks: {
                            ...value.tasks,
                            [t.key]: { ...row, requiresGithub: e.target.checked },
                          },
                        })
                      }
                    />
                    Requires GitHub URL
                  </label>
                  <div className="sm:col-span-2">
                    <FieldTextarea
                      label="Accept patterns"
                      hint="URL patterns, one per line"
                      rows={2}
                      value={listToLines(row.acceptPatterns)}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          tasks: {
                            ...value.tasks,
                            [t.key]: { ...row, acceptPatterns: linesToList(e.target.value) },
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
