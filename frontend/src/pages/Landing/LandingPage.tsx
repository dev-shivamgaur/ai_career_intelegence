import { Avatar } from "@/components/ui/Avatar";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { firstName } from "@/lib/format";
import { useAuth, useTheme } from "@/store/hooks";
import {
  ArrowRight,
  BookOpenCheck,
  Briefcase,
  CheckCircle2,
  CircleUserRound,
  FileStack,
  GitCompare,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Map,
  MessageSquare,
  Moon,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

const steps = [
  {
    icon: FileStack,
    title: "Upload evidence",
    body: "Degrees, marksheets, or a resume. We extract education and skills you can correct.",
  },
  {
    icon: Target,
    title: "Choose a track",
    body: "Private-sector role or sarkari exam. Sarkari prep never asks you for projects.",
  },
  {
    icon: GitCompare,
    title: "See the gaps",
    body: "Your confirmed profile is compared against role requirements or exam syllabus.",
  },
  {
    icon: Map,
    title: "Follow the plan",
    body: "Phased tasks stay tied to your saved profile and update on the server.",
  },
];

const features = [
  {
    icon: FileStack,
    title: "Document intelligence",
    body: "Education and skills extracted from uploads, then stored on your account.",
  },
  {
    icon: Target,
    title: "Career match",
    body: "An estimated match with a visible breakdown of what pulled the score up or down.",
  },
  {
    icon: GitCompare,
    title: "Skill gap analysis",
    body: "Current vs required skills, ranked by priority for your chosen stack or exam.",
  },
  {
    icon: Map,
    title: "Personalised roadmap",
    body: "Phased tasks you can complete or skip, always tied to the same profile.",
  },
  {
    icon: Briefcase,
    title: "Job matching",
    body: "Private roles with matched and missing skills, not a generic job board.",
  },
  {
    icon: Landmark,
    title: "Sarkari prep",
    body: "Exam syllabus tracking, topic progress, and vacancies to verify officially.",
  },
  {
    icon: MessageSquare,
    title: "Career copilot",
    body: "Chat grounded in your saved documents, skills, and target role or exam.",
  },
  {
    icon: ShieldCheck,
    title: "Evidence first",
    body: "Every recommendation shows what it used. Scores are platform estimates.",
  },
];

export function LandingPage() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const signedIn = Boolean(user);
  const primaryHref = signedIn ? (user?.onboardingComplete ? "/dashboard" : "/onboarding") : "/signup";
  const primaryLabel = signedIn
    ? user?.onboardingComplete
      ? "Open dashboard"
      : "Continue setup"
    : "Build your profile";

  return (
    <div className="min-h-screen bg-surface text-ink dark:bg-surface-dark dark:text-stone-100">
      <header className="sticky top-0 z-30 border-b border-[#C4C4C4]/80 bg-surface/90 backdrop-blur-md dark:border-[#3A3333] dark:bg-surface-dark/90">
        <div className="page-wrap flex h-[4.25rem] items-center justify-between gap-3">
          <BrandLogo />
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <a
              href="#how"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 md:inline-block dark:text-slate-300 dark:hover:bg-slate-800"
            >
              How it works
            </a>
            <a
              href="#tracks"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 md:inline-block dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Tracks
            </a>
            <ThemeToggle />
            {!ready ? (
              <span className="h-8 w-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
            ) : signedIn && user ? (
              <SignedInMenu
                name={user.name}
                initials={user.avatarInitials}
                onboardingComplete={user.onboardingComplete}
                onLogout={() => void logout().then(() => navigate("/"))}
              />
            ) : (
              <>
                <Badge tone="neutral" className="hidden gap-1 sm:inline-flex">
                  <CircleUserRound className="h-3.5 w-3.5" aria-hidden />
                  Guest
                </Badge>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    <LogIn className="h-4 w-4" />
                    Log in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">
                    <UserPlus className="h-4 w-4" />
                    <span className="hidden sm:inline">Sign up</span>
                    <span className="sm:hidden">Join</span>
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="page-wrap grid items-center gap-12 py-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14 lg:py-16">
        <div className="max-w-xl">
          {signedIn && user ? (
            <Badge tone="success" className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Signed in as {user.name}
            </Badge>
          ) : (
            <Badge tone="brand" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Evidence-based career intelligence
            </Badge>
          )}
          <h1 className="mt-5 text-pretty text-[2rem] font-semibold leading-[1.12] tracking-tight sm:text-4xl lg:text-[2.7rem]">
            {signedIn
              ? `Welcome back, ${firstName(user?.name || "there")}. Your plan is waiting.`
              : "Know Where You Stand. Learn What It Takes."}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
          AI Career Intelligence checks your skills against private jobs or government exams, finds your skill gaps, shows what to learn, and helps you prepare with clear roadmaps and job matches — all in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={primaryHref} className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                {signedIn ? <LayoutDashboard className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {primaryLabel}
              </Button>
            </Link>
            {signedIn ? (
              <Link to="/dashboard?copilot=1" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  <MessageSquare className="h-4 w-4" />
                  Ask copilot
                </Button>
              </Link>
            ) : (
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  <LogIn className="h-4 w-4" />
                  Log in
                </Button>
              </Link>
            )}
          </div>
          <ul className="mt-8 grid gap-3 text-sm text-slate-600 sm:grid-cols-3 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
              Profile from documents
            </li>
            <li className="flex items-start gap-2">
              <GitCompare className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
              Gaps you can inspect
            </li>
            <li className="flex items-start gap-2">
              <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
              Jobs or sarkari prep
            </li>
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            Scores are platform estimates. Government eligibility must be verified on official notifications.
          </p>
        </div>

        <ProductPreview signedIn={signedIn} name={user?.name} />
      </section>

      <section id="how" className="scroll-mt-20 border-y border-slate-200 bg-surface py-14 sm:py-16 dark:border-slate-800 dark:bg-slate-900">
        <div className="page-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">How it works</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">Four steps from papers to a plan</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            We do not guess from a chat. We read what you upload, you confirm it, then analysis stays on that profile.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                    <s.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold text-slate-400">0{i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="tracks" className="page-wrap scroll-mt-20 py-14 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Two tracks, one account</p>
        <h2 className="mt-2 text-xl font-semibold sm:text-2xl">Private jobs and sarkari prep are not mixed</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Pick a path. The copilot, gaps, and roadmap follow that choice so a UPSC plan never asks for GitHub projects.
        </p>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40">
              <Briefcase className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Private / tech jobs</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Match against a target role, see missing skills on your stack, follow a roadmap, and browse jobs that
              show matched vs missing skills.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-700" aria-hidden /> Career match score
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-700" aria-hidden /> Skill gaps by stack
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-700" aria-hidden /> Job matches with evidence
              </li>
            </ul>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <Landmark className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Sarkari naukri</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              SSC, UPSC, banking, railways, defence, and state PCS. Syllabus coverage, mocks, and vacancies to verify
              on official notices.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden /> Exam syllabus tracker
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden /> No project homework
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden /> Vacancies to verify
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-surface py-14 sm:py-16 dark:border-slate-800 dark:bg-slate-900">
        <div className="page-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Platform</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">What you can do here</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card dark:border-slate-800 dark:bg-slate-950 dark:hover:border-brand-800"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-wrap py-14 sm:py-16">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 p-6 text-white sm:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <h2 className="text-xl font-semibold sm:text-2xl">
                {signedIn ? "Jump back into your workspace" : "Start with what you already have"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-brand-100">
                {signedIn
                  ? "Dashboard, copilot, and documents stay on this account. You can log out from the header anytime."
                  : "Upload a marksheet or resume, pick a track, and we will show the next concrete steps — with sources."}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to={primaryHref}>
                <Button size="lg" className="w-full bg-white text-brand-800 hover:bg-brand-50 sm:w-auto">
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              {!signedIn && (
                <Link to="/login">
                  <Button size="lg" variant="outline" className="w-full border-white/30 bg-transparent text-white hover:bg-white/10 sm:w-auto">
                    <LogIn className="h-4 w-4" />
                    I already have an account
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" aria-hidden />
          <div>
            <h2 className="text-base font-semibold">Trust and evidence</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Recommendations use the profile you confirm and evidence stored for your account. Scores are platform
              estimates. Government eligibility must be verified against official notifications.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-10 dark:border-slate-800">
        <div className="page-wrap grid gap-8 sm:grid-cols-3">
          <div>
            <BrandLogo />
            <p className="mt-3 max-w-xs text-sm text-slate-500">
              Private jobs and sarkari prep from one account, grounded in documents you upload.
            </p>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <p className="font-medium text-slate-900 dark:text-white">Product</p>
            <ul className="mt-2 space-y-1.5">
              <li>
                <a className="hover:text-brand-700" href="#how">
                  How it works
                </a>
              </li>
              <li>
                <a className="hover:text-brand-700" href="#tracks">
                  Tracks
                </a>
              </li>
              <li>
                <Link className="hover:text-brand-700" to={signedIn ? "/jobs" : "/signup"}>
                  Careers
                </Link>
              </li>
            </ul>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            <p className="font-medium text-slate-900 dark:text-white">Account</p>
            <ul className="mt-2 space-y-1.5">
              {signedIn ? (
                <>
                  <li>
                    <Link className="hover:text-brand-700" to="/dashboard">
                      Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-brand-700" to="/settings">
                      Settings
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link className="hover:text-brand-700" to="/login">
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-brand-700" to="/signup">
                      Sign up
                    </Link>
                  </li>
                </>
              )}
              <li>
                <a className="hover:text-brand-700" href="mailto:hello@demo.local">
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      onClick={toggle}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function SignedInMenu({
  name,
  initials,
  onboardingComplete,
  onLogout,
}: {
  name: string;
  initials: string;
  onboardingComplete: boolean;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2">
      <Badge tone="success" className="hidden gap-1.5 md:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Signed in
      </Badge>
      <Link to={onboardingComplete ? "/dashboard" : "/onboarding"} className="hidden sm:block">
        <Button size="sm">
          <LayoutDashboard className="h-4 w-4" />
          {onboardingComplete ? "Dashboard" : "Setup"}
        </Button>
      </Link>
      <Dropdown
        trigger={
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 py-1 pl-1 pr-2.5 dark:border-emerald-900 dark:bg-emerald-950/40"
            aria-label={`Account menu for ${name}`}
          >
            <Avatar initials={initials} className="h-8 w-8" />
            <span className="hidden max-w-[8rem] truncate text-sm font-medium sm:block">{name}</span>
          </button>
        }
      >
        <div className="px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Logged in
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold">{name}</p>
        </div>
        <DropdownItem onClick={() => navigate(onboardingComplete ? "/dashboard" : "/onboarding")}>
          <span className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            {onboardingComplete ? "Dashboard" : "Continue setup"}
          </span>
        </DropdownItem>
        <DropdownItem onClick={() => navigate("/profile")}>
          <span className="flex items-center gap-2">
            <UserRound className="h-4 w-4" />
            Profile
          </span>
        </DropdownItem>
        <DropdownItem onClick={onLogout}>
          <span className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Log out
          </span>
        </DropdownItem>
      </Dropdown>
    </div>
  );
}

function ProductPreview({ signedIn, name }: { signedIn: boolean; name?: string }) {
  return (
    <div className="relative">
      <div className="absolute -inset-3 rounded-[1.75rem] bg-brand-600/10 blur-2xl dark:bg-brand-500/10" aria-hidden />
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Workspace preview</p>
            <p className="text-sm font-semibold">{signedIn && name ? `${firstName(name)}'s profile` : "Sample profile"}</p>
          </div>
          <Badge tone="brand">Live flow</Badge>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <PreviewTile icon={FileStack} label="Documents" value="Degree + resume" hint="Extracted, then confirmed" />
          <PreviewTile icon={Target} label="Match" value="72%" hint="Vs backend intern role" />
          <PreviewTile icon={GitCompare} label="Top gap" value="SQL joins" hint="High priority on your stack" />
          <PreviewTile icon={Landmark} label="Or sarkari" value="SSC CGL" hint="Syllabus tracker, no projects" />
        </div>
        <div className="border-t border-slate-100 bg-surface px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <MessageSquare className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Copilot stays on your evidence</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                “What should I learn next?” answers from stored skills and the role or exam you picked — not generic
                advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FileStack;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4 text-brand-700" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
