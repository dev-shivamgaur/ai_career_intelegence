import { CareerScoreCard } from "@/components/dashboard/CareerScoreCard";
import { JobCard } from "@/components/opportunities/JobCard";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { SkillGapCard } from "@/components/career/SkillGapCard";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CardBlockSkeleton, CardGridSkeleton, DashboardSkeleton, GapListSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { StatTile } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/Progress";
import { useProfile } from "@/context/ProfileContext";
import { Briefcase, GraduationCap, Landmark, Target, UserRound } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { firstName, greetingForHour } from "@/lib/format";
import * as careerApi from "@/services/api/careerApi";
import * as profileApi from "@/services/api/profileApi";
import type { GovernmentOpportunity } from "@/types";
import { SarkariFlags } from "@/components/sarkari/SarkariFlags";
import { openCopilot } from "@/components/copilot/copilotOpen";
import { copilotSuggestionChips } from "@/lib/copilotSuggestions";
import { Link, useNavigate } from "react-router-dom";

export function DashboardPage() {
  const navigate = useNavigate();
  const profile = useProfile();
  const home = useAsyncData(() => careerApi.getDashboard());

  if (profile.loading) return <DashboardSkeleton />;
  if (profile.error || !profile.data) {
    return (
      <ErrorState
        title="Dashboard could not be loaded"
        message={profile.error ?? undefined}
        code={profile.errorCode}
        onRetry={() => void profile.reload()}
        onDashboard={() => navigate("/dashboard")}
      />
    );
  }

  const p = profile.data;
  const homePending = home.loading && !home.data;
  const isGov = p.careerTrack === "government_exam";
  const needsSetup = p.completionPercent < 50 || !p.careerGoal.slug;
  const analysis = home.data?.analysis;
  const gaps = home.data?.skillGaps ?? [];
  const roadmap = home.data?.roadmap;
  const jobs = home.data?.jobs ?? [];
  const examPlan = home.data?.examPlan;
  const govItems = (home.data?.government ?? []).map((g) => ({
    id: String(g.id ?? ""),
    organization: String(g.organization ?? ""),
    opportunity: String(g.opportunity ?? ""),
    eligibility: String(g.eligibility ?? ""),
    ageRequirement: String(g.ageRequirement ?? ""),
    educationRequirement: String(g.educationRequirement ?? ""),
    location: String(g.location ?? ""),
    deadline: String(g.deadline ?? ""),
    eligibilityStatus: "needs_verification" as const,
    sourceVerification: "needs_verification" as const,
    officialNote: String(g.officialNote ?? ""),
    isMock: true as const,
  })) as GovernmentOpportunity[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greetingForHour()}, {firstName(p.name || "there")}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-[#5C4E4E] dark:text-[#988686]">
            Your documents and confirmed skills are compared with {p.careerGoal.title || "the role you pick"}. The cards below are the next gaps, the roadmap, and matching work.
          </p>
        </div>
        <div className="w-full sm:w-52">
          <ProgressBar value={p.completionPercent} label="Profile fields filled" />
        </div>
      </div>

      {needsSetup && (
        <Card className="border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/30">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Finish setting up your profile</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Pick a role, upload a degree or marksheet, and add what you are learning. We judge from your documents
                and the role syllabus stored for you.
              </p>
            </div>
            <Button className="shrink-0" onClick={() => navigate("/onboarding")}>
              Continue setup
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Where you are"
          description="The header search finds a skill, roadmap task, or job you already have. It does not search the web. AI research is a separate page of public links for your role."
        />
        <CardBody>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {learnerSteps(p, gaps.length, (roadmap?.total ?? 0) > 0).map((step) => (
              <li key={step.label}>
                <Link
                  to={step.href}
                  className="block rounded-lg border border-[#E4E4E4] px-3 py-3 text-sm hover:border-[#988686] dark:border-[#3A3333]"
                >
                  <p className="text-xs uppercase tracking-wide text-[#5C4E4E] dark:text-[#988686]">
                    {step.done ? "Done" : step.current ? "You are here" : "Later"}
                  </p>
                  <p className="mt-1 font-medium">{step.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#5C4E4E] dark:text-[#988686]">{step.detail}</p>
                </Link>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Status" value={p.status.replaceAll("_", " ")} icon={<UserRound className="h-4 w-4" />} />
        <StatTile
          label="Education"
          value={p.educationLevel.replaceAll("_", " ")}
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <StatTile
          label="Track"
          value={isGov ? "Sarkari naukri" : "Private jobs"}
          icon={isGov ? <Landmark className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
        />
        <StatTile label="Goal" value={p.careerGoal.title} icon={<Target className="h-4 w-4" />} />
      </div>

      {(p.profileStage?.detail || p.prepGoalText || (!isGov && home.data?.evidence)) && (
        <Card>
          <CardHeader
            title="You are here"
            description={
              isGov
                ? [p.profileStage?.detail].filter(Boolean).join(" · ")
                : [
                    home.data?.evidence?.stackLabel,
                    homePending
                      ? null
                      : home.data?.evidence?.seniority === "job"
                        ? "job"
                        : home.data?.evidence?.seniority === "intern"
                          ? "internship"
                          : "no intern/job yet",
                    p.profileStage?.detail,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
          />
          {p.prepGoalText && (
            <CardBody className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-800 dark:text-slate-100">In your words: </span>
              {p.prepGoalText}
            </CardBody>
          )}
        </Card>
      )}

      {!isGov && home.data?.evidence?.needsStackConfirm && (home.data.evidence.stackOptions?.length ?? 0) > 0 && (
        <Card>
          <CardHeader title="Main language / framework / tool?" description="Low confidence from skills and resume. Pick one so gaps stay on your stack." />
          <CardBody className="flex flex-wrap gap-2">
            {home.data.evidence.stackOptions.map((lane) => (
              <Button
                key={lane.id}
                size="sm"
                variant={p.primaryStack === lane.id ? "primary" : "outline"}
                onClick={() =>
                  void profileApi.updateProfile({ primaryStack: lane.id }).then(() => {
                    void profile.reload();
                    void home.reload();
                  })
                }
              >
                {lane.label}
              </Button>
            ))}
          </CardBody>
        </Card>
      )}

      {homePending ? (
        isGov ? (
          <>
            <CardBlockSkeleton />
            <section>
              <SectionHeading title="Vacancies to verify" to="/government-opportunities" linkLabel="View all" />
              <CardGridSkeleton count={2} />
            </section>
          </>
        ) : (
          <>
            <CardBlockSkeleton className="h-40" />
            <CardGridSkeleton count={3} className="md:grid-cols-3" />
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <SectionHeading title="Top skill gaps" to="/skill-gap" linkLabel="View all" />
                <GapListSkeleton count={3} />
              </section>
              <CardBlockSkeleton className="h-48 self-start" />
            </div>
            <section>
              <SectionHeading title="Matching jobs" to="/jobs" linkLabel="View jobs" />
              <CardGridSkeleton count={2} />
            </section>
          </>
        )
      ) : isGov ? (
        <>
          <Card>
            <CardHeader
              title={examPlan ? `Preparing: ${examPlan.shortName}` : "Select an exam"}
              description={
                examPlan
                  ? "Open your exam plan and mark topics as you revise."
                  : "Open Sarkari prep and pick SSC, UPSC, banking, railways, or state PCS."
              }
              action={
                <Link to={examPlan ? `/sarkari-naukri/${examPlan.slug}` : "/sarkari-naukri"}>
                  <Button size="sm">{examPlan ? "Open plan" : "Choose exam"}</Button>
                </Link>
              }
            />
            <CardBody>
              <ProgressBar value={examPlan?.completionPercent ?? 0} label="Syllabus coverage" />
              {home.data?.sarkariJudge && (
                <div className="mt-4">
                  <SarkariFlags judge={home.data.sarkariJudge} />
                </div>
              )}
            </CardBody>
          </Card>

          <section>
            <SectionHeading title="Vacancies to verify" to="/government-opportunities" linkLabel="View all" />
            {govItems.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {govItems.slice(0, 2).map((g) => (
                  <OpportunityCard key={g.id} item={g} />
                ))}
              </div>
            ) : (
              <DashboardPlaceholder text="No vacancies matched yet. Check the official notice board for your exam." />
            )}
          </section>
        </>
      ) : (
        <>
          {analysis && <CareerScoreCard analysis={analysis} />}

          {(home.data?.evidence?.studyNext?.length ||
            home.data?.evidence?.optional?.length ||
            home.data?.evidence?.alternatives?.length) && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader title="Study next" description="Core plus your stack, minus what you already have." />
                <CardBody>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
                    {(home.data?.evidence?.studyNext ?? []).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Optional" description="Helpful extras on this stack. Weaker score impact." />
                <CardBody>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
                    {(home.data?.evidence?.optional ?? []).length
                      ? (home.data?.evidence?.optional ?? []).map((t) => <li key={t}>{t}</li>)
                      : <li>No extras tagged yet.</li>}
                  </ul>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Other stacks" description="Never treated as required gaps." />
                <CardBody>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
                    {(home.data?.evidence?.alternatives ?? []).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionHeading title="Top skill gaps" to="/skill-gap" linkLabel="View all" />
              <p className="-mt-2 mb-3 text-sm text-slate-500">
                Compared from skills you typed, then resume, then marksheets — only the core and your stack.
              </p>
              {gaps.length ? (
                <div className="space-y-3">
                  {gaps.slice(0, 5).map((g) => (
                    <SkillGapCard key={g.id || g.skill} item={g} />
                  ))}
                </div>
              ) : (
                <DashboardPlaceholder text="Skill gaps appear once a target role is saved on your profile." />
              )}
            </section>
            <Card className="self-start">
              <CardHeader title="Roadmap" description={roadmap?.careerTitle} />
              <CardBody className="space-y-3">
                <ProgressBar value={roadmap?.syllabusPercent ?? 0} label="Syllabus topics evidenced" />
                <ProgressBar
                  value={
                    roadmap?.total ? Math.round(((roadmap.completed ?? 0) / roadmap.total) * 100) : 0
                  }
                  label="Tasks complete"
                />
                <p className="text-sm text-slate-500">
                  {roadmap?.completed ?? 0} of {roadmap?.total ?? 0} tasks complete
                  {roadmap?.syllabusPercent != null
                    ? ` · ${roadmap.syllabusPercent}% of the role syllabus matches your documents and skills`
                    : ""}
                </p>
                <Link to="/roadmap" className="inline-block text-sm font-medium text-brand-700">
                  Open roadmap
                </Link>
              </CardBody>
            </Card>
          </div>

          <section>
            <SectionHeading title="Matching jobs" to="/jobs" linkLabel="View jobs" />
            {jobs.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {jobs.slice(0, 2).map((j) => (
                  <JobCard key={j.id} job={j} />
                ))}
              </div>
            ) : (
              <DashboardPlaceholder text="Job matches appear after your skills and target role are saved." />
            )}
          </section>
        </>
      )}

      <Card>
        <CardHeader
          title="AI Career Copilot"
          description="Answers from your documents, skills, and the role syllabus we store for you."
        />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {(copilotSuggestionChips(p).length
              ? copilotSuggestionChips(p)
              : isGov
                ? ["What should I revise this week?", "Am I eligible as a fresher graduate?", "How do I use 2 hours a day?"]
                : ["What should I learn next?", "I only have 2 hours per day.", "Which skill should I prioritize?"]
            ).map((q) => (
              <Button key={q} size="sm" variant="outline" onClick={() => openCopilot({ q })}>
                {q}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function learnerSteps(
  profile: { careerGoal: { slug: string }; completionPercent: number },
  gapCount: number,
  hasRoadmap: boolean,
) {
  const steps = [
    {
      label: "Pick a role",
      done: Boolean(profile.careerGoal.slug),
      href: "/onboarding",
      detail: "Skill gap, roadmap, and AI research all start from this role.",
    },
    {
      label: "Fill your profile",
      done: profile.completionPercent >= 50,
      href: "/profile",
      detail: "Resume, skills, and projects are the evidence the plan is judged from.",
    },
    {
      label: "Open skill gap",
      done: gapCount > 0,
      href: "/skill-gap",
      detail: "Topics still missing for your stack. Header search can open one of these.",
    },
    {
      label: "Follow the roadmap",
      done: hasRoadmap,
      href: "/roadmap",
      detail: "Practice tasks in the 7-day, 30-day, and later windows.",
    },
  ];
  const currentIndex = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({ ...step, current: index === currentIndex }));
}

function SectionHeading({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
      <Link to={to} className="shrink-0 text-sm font-medium text-brand-700">
        {linkLabel}
      </Link>
    </div>
  );
}

function DashboardPlaceholder({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
      {text}
    </div>
  );
}
