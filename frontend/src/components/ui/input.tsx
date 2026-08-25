import * as React from "react"
import { sx } from "@/lib/utils"
import { input } from "@/styles/ui.stylex"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        {...sx(input.root, className)}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
