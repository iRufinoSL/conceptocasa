import * as React from "react";
import { cn } from "@/lib/utils";

interface InputAddonProps {
  children: React.ReactNode;
  addon: React.ReactNode;
  addonPosition?: 'left' | 'right';
  className?: string;
}

/**
 * InputAddon wraps an input component and adds an addon (like a currency symbol)
 * to the left or right side.
 */
const InputAddon = React.forwardRef<HTMLDivElement, InputAddonProps>(
  ({ children, addon, addonPosition = 'right', className }, ref) => {
    return (
      <div ref={ref} className={cn("relative flex items-center", className)}>
        {addonPosition === 'left' && (
          <span className="absolute left-3 text-muted-foreground text-sm pointer-events-none select-none">
            {addon}
          </span>
        )}
        <div className={cn(
          "w-full",
          addonPosition === 'left' && "[&>input]:pl-8",
          addonPosition === 'right' && "[&>input]:pr-8"
        )}>
          {children}
        </div>
        {addonPosition === 'right' && (
          <span className="absolute right-3 text-muted-foreground text-sm pointer-events-none select-none">
            {addon}
          </span>
        )}
      </div>
    );
  }
);

InputAddon.displayName = "InputAddon";

export { InputAddon };
