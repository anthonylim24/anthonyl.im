import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { sx } from "@/lib/utils"
import { progress } from "@/styles/ui.stylex"

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    {...sx(progress.root, className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      {...sx(progress.indicator)}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
