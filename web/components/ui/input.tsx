import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[8px] border border-[#e8e8e8] bg-[#f5f5f5] px-3.5 text-[16px] tracking-[-0.32px] text-[#181925] outline-none transition-colors placeholder:text-[#999999] focus-visible:border-[#918df6] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#918df6]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
