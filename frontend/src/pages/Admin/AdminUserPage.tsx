import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as adminApi from "@/services/api/adminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

export function AdminUserPage() {
  const { id = "" } = useParams();
  const { push } = useToast();
  const knowledge = useAsyncData(() => adminApi.getUserKnowledge(id), [id]);
  const progress = useAsyncData(() => adminApi.getUserProgress(id), [id]);
  const [skillName, setSkillName] = useState("");
  const [stack, setStack] = useState("");
  const [name, setName] = useState("");

  async function saveProfile() {
    try {
      await adminApi.updateUserProfile(id, {
        ...(name.trim() ? { name: name.trim() } : {}),
        primaryStack: stack.trim(),
      });
      setName("");
      push("Profile updated");
      void knowledge.reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not update profile");
    }
  }

  async function addSkill() {
    try {
      await adminApi.addUserSkill(id, { name: skillName.trim(), proficiency: 50 });
      setSkillName("");
      push("Skill added");
      void knowledge.reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not add skill");
    }
  }

  async function changeScore(skillId: string, proficiency: number) {
    try {
      await adminApi.updateUserSkill(id, skillId, proficiency);
      void knowledge.reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not update skill");
    }
  }

  async function removeSkill(skillId: string) {
    try {
      await adminApi.deleteUserSkill(id, skillId);
      push("Skill removed");
      void knowledge.reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete skill");
    }
  }

  if (knowledge.error) return <ErrorState message={knowledge.error} code={knowledge.errorCode} onRetry={() => void knowledge.reload()} />;

  const row = knowledge.data;
  const plan = progress.data;

  return (
    <div className="space-y-4">
      <Link to="/admin/users" className="text-sm text-slate-500">
        ← Users
      </Link>
      <Card>
        <CardHeader title={row ? `${row.name || "Unnamed"} · ${row.phone}` : "Learner"} />
        <CardBody className="space-y-3 text-sm">
          <p>Career: {row?.career?.title ?? plan?.career?.title ?? "none"}</p>
          <p>Stack: {row?.primaryStack || "not chosen"}</p>
          <p>
            Roadmap: {plan?.roadmap ? `${plan.roadmap.completed}/${plan.roadmap.total} tasks done` : "no roadmap"} · Gaps:{" "}
            {plan?.skillGapCount ?? row?.skillGaps.length ?? 0}
          </p>
          {plan?.career?.estimatedMatch != null && <p>Match score: {plan.career.estimatedMatch}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name" name="learnerName" value={name} onChange={(e) => setName(e.target.value)} placeholder={row?.name ?? ""} />
            <Input
              label="Stack"
              name="stack"
              value={stack}
              onChange={(e) => setStack(e.target.value)}
              placeholder={row?.primaryStack ?? "nodejs"}
            />
          </div>
          <Button onClick={() => void saveProfile()}>Save profile fields</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Skills on this learner" />
        <CardBody className="space-y-3">
          <ul className="space-y-2 text-sm">
            {row?.knownSkills.map((skill) => (
              <li key={skill.skillId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-40">{skill.name}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  defaultValue={skill.proficiency}
                  onBlur={(e) => void changeScore(skill.skillId, Number(e.target.value))}
                />
                <Button size="sm" variant="ghost" onClick={() => void removeSkill(skill.skillId)}>
                  Delete
                </Button>
              </li>
            ))}
            {row && row.knownSkills.length === 0 && <li className="text-slate-500">No skills saved.</li>}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <Input label="Add skill" name="skill" value={skillName} onChange={(e) => setSkillName(e.target.value)} />
            <Button disabled={!skillName.trim()} onClick={() => void addSkill()}>
              Add
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Skill gaps" />
        <CardBody>
          <ul className="space-y-1 text-sm">
            {row?.skillGaps.map((gap) => (
              <li key={gap.id}>
                {gap.skill} · {gap.currentStatus} · {gap.priority}
              </li>
            ))}
            {row && row.skillGaps.length === 0 && <li className="text-slate-500">No gaps stored.</li>}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
