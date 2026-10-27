import { cn } from "@/lib/cn";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-[#F4FBFA] hover:bg-brand-700 disabled:bg-[#B3B3B3] dark:bg-[#D1D0D0] dark:text-ink dark:hover:bg-white",
  secondary: "bg-[#5C4E4E] text-[#F4FBFA] hover:bg-brand-800 dark:bg-[#5C4E4E] dark:text-[#D1D0D0]",
  ghost: "bg-transparent text-ink hover:bg-brand-100 dark:text-[#D1D0D0] dark:hover:bg-[#2A2424]",
  danger: "bg-[#5C4E4E] text-white hover:bg-brand-800",
  outline:
    "border border-[#C4C4C4] bg-surface-card text-ink hover:bg-brand-50 dark:border-[#5C4E4E] dark:bg-transparent dark:text-[#D1D0D0] dark:hover:bg-[#2A2424]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
