import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

interface SiliecoIconProps extends React.ComponentProps<"span"> {
  animate?: boolean;
  noSpin?: boolean;
  bordered?: boolean;
  size?: "sm" | "md" | "lg";
}

const borderedSizes = {
  sm: { wrapper: "p-1.5", icon: "size-3.5" },
  md: { wrapper: "p-2", icon: "size-4" },
  lg: { wrapper: "p-2.5", icon: "size-5" },
};

function SiliecoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="14" fill="#0b0d12" />
      <path
        d="M18 18h12v12H18zM34 18h12v12H34zM18 34h12v12H18zM34 34h12v12H34z"
        fill="#f3f6fb"
      />
      <path
        d="M34 18h12v12H34zM18 34h12v12H18z"
        fill="#3978f6"
      />
    </svg>
  );
}

export function SiliecoIcon({
  className,
  animate = false,
  noSpin = false,
  bordered = false,
  size = "sm",
  ...props
}: SiliecoIconProps) {
  const [entranceDone, setEntranceDone] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => setEntranceDone(true), 600);
    return () => clearTimeout(timer);
  }, [animate]);

  const animationClass = cn(
    !entranceDone && "animate-entrance-spin",
    entranceDone && !noSpin && "hover:animate-spin",
  );

  if (bordered) {
    const sizeConfig = borderedSizes[size];
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-border",
          sizeConfig.wrapper,
          className,
        )}
        {...props}
      >
        <SiliecoMark className={cn(sizeConfig.icon, animationClass)} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-[1em]", className)}
      {...props}
    >
      <SiliecoMark className={cn("size-full", animationClass)} />
    </span>
  );
}
