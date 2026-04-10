import React from "react";
import { cn } from "@/lib/utils";

export const DottedBackground = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "relative h-full w-full bg-[#030303]",
        className
      )}
    >
      {/* Dot pattern */}
      <div className="absolute pointer-events-none inset-0 flex items-center justify-center bg-background bg-zinc-950 mask-[radial-gradient(ellipse_80%_80%_at_50%_0%,#000_10%,transparent_110%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--color-border)_1px,_transparent_1px)] bg-size-[24px_24px] opacity-20 pointer-events-none"></div>
      
      {/* Content wrapper */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
