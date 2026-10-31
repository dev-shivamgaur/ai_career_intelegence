import { Button } from "@/components/ui/Button";
import { FieldInput, FieldSelect, FieldTextarea, SectionCard } from "@/components/admin/prep/Field";
import {
  listToLines,
  linesToList,
  type PrepContentForm as Form,
  type PrepLesson,
  type PrepObjective,
  type PrepQuestion,
  type PrepTask,
  type QuestionType,
} from "@/components/admin/prep/prepFormTypes";

const QUESTION_TYPES: QuestionType[] = ["mcq", "short", "sql", "code", "practical", "scenario", "theory"];

type Props = {
  value: Form;
  onChange: (next: Form) => void;
  disabled?: boolean;
  tab: "meta" | "objectives" | "lessons" | "questions" | "tasks" | "resources";
};

export function PrepContentForm({ value, onChange, disabled, tab }: Props) {
  const patch = (partial: Partial<Form>) => onChange({ ...value, ...partial });

  if (tab === "meta") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldInput
          label="Skill name"
          required
          value={value.skillName}
          disabled={disabled}
          onChange={(e) => patch({ skillName: e.target.value })}
        />
        <FieldInput
          label="Career / role title"
          hint="e.g. Backend Developer"
          value={value.careerTitle}
          disabled={disabled}
          onChange={(e) => patch({ careerTitle: e.target.value })}
        />
        <FieldSelect
          label="Difficulty"
          required
          value={value.difficulty}
          disabled={disabled}
          onChange={(e) => patch({ difficulty: e.target.value as Form["difficulty"] })}
        >
          <option value="foundation">Foundation</option>
          <option value="core">Core</option>
          <option value="advanced">Advanced</option>
        </FieldSelect>
        <FieldInput
          label="Estimated minutes"
          required
          type="number"
          min={10}
          max={600}
          value={value.estimatedMinutes}
          disabled={disabled}
          onChange={(e) => patch({ estimatedMinutes: Number(e.target.value) || 60 })}
        />
        <FieldInput
          label="Daily hours (optional)"
          type="number"
          min={0}
          max={24}
          value={value.dailyHours ?? ""}
          disabled={disabled}
          onChange={(e) => patch({ dailyHours: e.target.value === "" ? null : Number(e.target.value) })}
        />
        <FieldInput
          label="Phase (optional)"
          value={value.phase ?? ""}
          disabled={disabled}
          onChange={(e) => patch({ phase: e.target.value || null })}
        />
        <div className="sm:col-span-2">
          <FieldTextarea
            label="Completion summary"
            hint="Shown when learner finishes"
            rows={2}
            value={value.completionSummary}
            disabled={disabled}
            onChange={(e) => patch({ completionSummary: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldTextarea
            label="Next action template"
            rows={2}
            value={value.nextActionTemplate}
            disabled={disabled}
            onChange={(e) => patch({ nextActionTemplate: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (tab === "objectives") {
    return (
      <div className="space-y-3">
        {value.objectives.map((obj, index) => (
          <SectionCard
            key={obj.key + index}
            title={`Objective ${index + 1}`}
            actions={
              !disabled && value.objectives.length > 1 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch({ objectives: value.objectives.filter((_, i) => i !== index) })}
                >
                  Remove
                </Button>
              ) : null
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput
                label="Key"
                required
                hint="stable id, e.g. obj-1"
                value={obj.key}
                disabled={disabled}
                onChange={(e) => {
                  const objectives = value.objectives.map((row, i) => (i === index ? { ...row, key: e.target.value } : row));
                  patch({ objectives });
                }}
              />
              <FieldInput
                label="Title"
                required
                value={obj.title}
                disabled={disabled}
                onChange={(e) => {
                  const objectives = value.objectives.map((row, i) => (i === index ? { ...row, title: e.target.value } : row));
                  patch({ objectives });
                }}
              />
              <div className="sm:col-span-2">
                <FieldTextarea
                  label="Linked question keys"
                  hint="one key per line"
                  rows={2}
                  value={listToLines(obj.questionKeys)}
                  disabled={disabled}
                  onChange={(e) => {
                    const objectives = value.objectives.map((row, i) =>
                      i === index ? { ...row, questionKeys: linesToList(e.target.value) } : row,
                    );
                    patch({ objectives });
                  }}
                />
              </div>
            </div>
          </SectionCard>
        ))}
        {!disabled && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const next: PrepObjective = {
                key: `obj-${value.objectives.length + 1}`,
                title: "",
                questionKeys: [],
              };
              patch({ objectives: [...value.objectives, next] });
            }}
          >
            Add objective
          </Button>
        )}
      </div>
    );
  }

  if (tab === "lessons") {
    return (
      <div className="space-y-3">
        {value.lessons.map((lesson, index) => (
          <SectionCard
            key={lesson.key + index}
            title={`Lesson ${index + 1}`}
            actions={
              !disabled && value.lessons.length > 1 ? (
                <Button size="sm" variant="ghost" onClick={() => patch({ lessons: value.lessons.filter((_, i) => i !== index) })}>
                  Remove
                </Button>
              ) : null
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput
                label="Key"
                required
                value={lesson.key}
                disabled={disabled}
                onChange={(e) => updateLesson(value, patch, index, { key: e.target.value })}
              />
              <FieldInput
                label="Title"
                required
                value={lesson.title}
                disabled={disabled}
                onChange={(e) => updateLesson(value, patch, index, { title: e.target.value })}
              />
              <FieldSelect
                label="Objective"
                required
                value={lesson.objectiveKey}
                disabled={disabled}
                onChange={(e) => updateLesson(value, patch, index, { objectiveKey: e.target.value })}
              >
                {value.objectives.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.title || o.key}
                  </option>
                ))}
              </FieldSelect>
              <div className="sm:col-span-2">
                <FieldTextarea
                  label="Explanation"
                  required
                  rows={5}
                  value={lesson.explanation}
                  disabled={disabled}
                  onChange={(e) => updateLesson(value, patch, index, { explanation: e.target.value })}
                />
              </div>
              <FieldTextarea
                label="Examples"
                hint="one per line"
                rows={3}
                value={listToLines(lesson.examples)}
                disabled={disabled}
                onChange={(e) => updateLesson(value, patch, index, { examples: linesToList(e.target.value) })}
              />
              <FieldTextarea
                label="Common mistakes"
                hint="one per line"
                rows={3}
                value={listToLines(lesson.mistakes)}
                disabled={disabled}
                onChange={(e) => updateLesson(value, patch, index, { mistakes: linesToList(e.target.value) })}
              />
              <div className="sm:col-span-2">
                <FieldTextarea
                  label="Question keys in this lesson"
                  required
                  hint="one key per line"
                  rows={2}
                  value={listToLines(lesson.questionKeys)}
                  disabled={disabled}
                  onChange={(e) => updateLesson(value, patch, index, { questionKeys: linesToList(e.target.value) })}
                />
              </div>
            </div>
          </SectionCard>
        ))}
        {!disabled && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const next: PrepLesson = {
                key: `lesson-${value.lessons.length + 1}`,
                title: "",
                explanation: "",
                objectiveKey: value.objectives[0]?.key ?? "obj-1",
                questionKeys: [],
                examples: [],
                mistakes: [],
              };
              patch({ lessons: [...value.lessons, next] });
            }}
          >
            Add lesson
          </Button>
        )}
      </div>
    );
  }

  if (tab === "questions") {
    return (
      <div className="space-y-3">
        {value.questions.map((q, index) => (
          <SectionCard
            key={q.key + index}
            title={`Question ${index + 1}`}
            actions={
              !disabled && value.questions.length > 1 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch({ questions: value.questions.filter((_, i) => i !== index) })}
                >
                  Remove
                </Button>
              ) : null
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput
                label="Key"
                required
                value={q.key}
                disabled={disabled}
                onChange={(e) => updateQuestion(value, patch, index, { key: e.target.value })}
              />
              <FieldSelect
                label="Type"
                required
                value={q.type}
                disabled={disabled}
                onChange={(e) => updateQuestion(value, patch, index, { type: e.target.value as QuestionType })}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </FieldSelect>
              <FieldSelect
                label="Lesson"
                required
                value={q.lessonKey}
                disabled={disabled}
                onChange={(e) => updateQuestion(value, patch, index, { lessonKey: e.target.value })}
              >
                {value.lessons.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.title || l.key}
                  </option>
                ))}
              </FieldSelect>
              <FieldSelect
                label="Objective"
                required
                value={q.objectiveKey}
                disabled={disabled}
                onChange={(e) => updateQuestion(value, patch, index, { objectiveKey: e.target.value })}
              >
                {value.objectives.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.title || o.key}
                  </option>
                ))}
              </FieldSelect>
              <div className="sm:col-span-2">
                <FieldTextarea
                  label="Prompt"
                  required
                  rows={3}
                  value={q.prompt}
                  disabled={disabled}
                  onChange={(e) => updateQuestion(value, patch, index, { prompt: e.target.value })}
                />
              </div>
              {q.type === "mcq" && (
                <div className="sm:col-span-2 space-y-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Options <span className="text-red-600">*</span>
                  </p>
                  {q.options.map((opt, oi) => (
                    <div key={opt.id + oi} className="flex gap-2">
                      <input
                        className="h-10 w-24 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                        value={opt.id}
                        disabled={disabled}
                        aria-label="Option id"
                        onChange={(e) => {
                          const options = q.options.map((row, i) => (i === oi ? { ...row, id: e.target.value } : row));
                          updateQuestion(value, patch, index, { options });
                        }}
                      />
                      <input
                        className="h-10 flex-1 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                        value={opt.label}
                        disabled={disabled}
                        required
                        aria-label="Option label"
                        onChange={(e) => {
                          const options = q.options.map((row, i) => (i === oi ? { ...row, label: e.target.value } : row));
                          updateQuestion(value, patch, index, { options });
                        }}
                      />
                      {!disabled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateQuestion(value, patch, index, { options: q.options.filter((_, i) => i !== oi) })
                          }
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                  {!disabled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateQuestion(value, patch, index, {
                          options: [...q.options, { id: `opt-${q.options.length + 1}`, label: "" }],
                        })
                      }
                    >
                      Add option
                    </Button>
                  )}
                </div>
              )}
              <div className="sm:col-span-2">
                <FieldTextarea
                  label="Hints"
                  hint="one per line"
                  rows={2}
                  value={listToLines(q.hints)}
                  disabled={disabled}
                  onChange={(e) => updateQuestion(value, patch, index, { hints: linesToList(e.target.value) })}
                />
              </div>
            </div>
          </SectionCard>
        ))}
        {!disabled && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const next: PrepQuestion = {
                key: `q-${value.questions.length + 1}`,
                lessonKey: value.lessons[0]?.key ?? "lesson-1",
                objectiveKey: value.objectives[0]?.key ?? "obj-1",
                type: "short",
                prompt: "",
                options: [],
                hints: [],
              };
              patch({ questions: [...value.questions, next] });
            }}
          >
            Add question
          </Button>
        )}
      </div>
    );
  }

  if (tab === "tasks") {
    return (
      <div className="space-y-3">
        {value.tasks.length === 0 && (
          <p className="text-sm text-slate-500">No practical tasks yet. Add one if learners must submit evidence (e.g. GitHub).</p>
        )}
        {value.tasks.map((task, index) => (
          <SectionCard
            key={task.key + index}
            title={`Task ${index + 1}${task.required ? " · required" : ""}`}
            actions={
              !disabled ? (
                <Button size="sm" variant="ghost" onClick={() => patch({ tasks: value.tasks.filter((_, i) => i !== index) })}>
                  Remove
                </Button>
              ) : null
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput
                label="Key"
                required
                value={task.key}
                disabled={disabled}
                onChange={(e) => updateTask(value, patch, index, { key: e.target.value })}
              />
              <FieldSelect
                label="Evidence type"
                required={task.required}
                value={task.evidenceKind}
                disabled={disabled}
                onChange={(e) =>
                  updateTask(value, patch, index, { evidenceKind: e.target.value as PrepTask["evidenceKind"] })
                }
              >
                <option value="github">GitHub URL</option>
                <option value="url">Any URL</option>
                <option value="text">Text</option>
                <option value="none">None</option>
              </FieldSelect>
              <div className="sm:col-span-2">
                <FieldTextarea
                  label="Prompt"
                  required
                  rows={3}
                  value={task.prompt}
                  disabled={disabled}
                  onChange={(e) => updateTask(value, patch, index, { prompt: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={task.required}
                  disabled={disabled}
                  onChange={(e) => updateTask(value, patch, index, { required: e.target.checked })}
                />
                Required for completion <span className="text-red-600">*</span> if checked
              </label>
              <div className="sm:col-span-2">
                <FieldTextarea
                  label="Acceptance criteria"
                  hint="one per line"
                  rows={3}
                  value={listToLines(task.acceptanceCriteria)}
                  disabled={disabled}
                  onChange={(e) => updateTask(value, patch, index, { acceptanceCriteria: linesToList(e.target.value) })}
                />
              </div>
            </div>
          </SectionCard>
        ))}
        {!disabled && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const next: PrepTask = {
                key: `task-${value.tasks.length + 1}`,
                prompt: "",
                required: true,
                evidenceKind: "github",
                acceptanceCriteria: [],
              };
              patch({ tasks: [...value.tasks, next] });
            }}
          >
            Add task
          </Button>
        )}
      </div>
    );
  }

  // resources
  return (
    <div className="space-y-3">
      {value.resources.map((res, index) => (
        <SectionCard
          key={`${res.url}-${index}`}
          title={`Resource ${index + 1}`}
          actions={
            !disabled ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => patch({ resources: value.resources.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            ) : null
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldInput
              label="Title"
              required
              value={res.title}
              disabled={disabled}
              onChange={(e) => {
                const resources = value.resources.map((row, i) => (i === index ? { ...row, title: e.target.value } : row));
                patch({ resources });
              }}
            />
            <FieldInput
              label="Kind"
              value={res.kind}
              disabled={disabled}
              onChange={(e) => {
                const resources = value.resources.map((row, i) => (i === index ? { ...row, kind: e.target.value } : row));
                patch({ resources });
              }}
            />
            <div className="sm:col-span-2">
              <FieldInput
                label="URL"
                required
                type="url"
                value={res.url}
                disabled={disabled}
                onChange={(e) => {
                  const resources = value.resources.map((row, i) => (i === index ? { ...row, url: e.target.value } : row));
                  patch({ resources });
                }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={res.verified}
                disabled={disabled}
                onChange={(e) => {
                  const resources = value.resources.map((row, i) =>
                    i === index ? { ...row, verified: e.target.checked } : row,
                  );
                  patch({ resources });
                }}
              />
              Verified link
            </label>
          </div>
        </SectionCard>
      ))}
      {!disabled && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            patch({
              resources: [...value.resources, { title: "", url: "", kind: "article", verified: false }],
            })
          }
        >
          Add resource
        </Button>
      )}
    </div>
  );
}

function updateLesson(value: Form, patch: (p: Partial<Form>) => void, index: number, partial: Partial<PrepLesson>) {
  patch({ lessons: value.lessons.map((row, i) => (i === index ? { ...row, ...partial } : row)) });
}

function updateQuestion(value: Form, patch: (p: Partial<Form>) => void, index: number, partial: Partial<PrepQuestion>) {
  patch({ questions: value.questions.map((row, i) => (i === index ? { ...row, ...partial } : row)) });
}

function updateTask(value: Form, patch: (p: Partial<Form>) => void, index: number, partial: Partial<PrepTask>) {
  patch({ tasks: value.tasks.map((row, i) => (i === index ? { ...row, ...partial } : row)) });
}
