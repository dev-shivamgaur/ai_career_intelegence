import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink dark:bg-surface-dark dark:text-stone-100">
      <header className="border-b border-stone-200/80 bg-white px-4 py-4 dark:border-stone-800 dark:bg-surface-dark">
        <div className="page-wrap">
          <BrandLogo />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <p className="text-sm font-medium tracking-wide text-stone-500 dark:text-stone-400">404</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">This page is not in the app</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            The address you opened does not match a page we publish. Use the button below to return home.
          </p>
          <Link to="/" className="mt-8 inline-block">
            <Button>Go to homepage</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
