import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full resize-none rounded-[8px] border border-[#e8e8e8] bg-[#f5f5f5] px-3.5 py-3 text-[16px] leading-[1.5] tracking-[-0.32px] text-[#181925] outline-none transition-colors placeholder:text-[#999999] focus-visible:border-[#918df6] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#918df6]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
