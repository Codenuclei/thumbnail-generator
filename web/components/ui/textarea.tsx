import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full resize-none rounded-[20px] border border-[#efefef] bg-white px-[14px] py-3 text-[15px] leading-[1.62] tracking-[-0.1px] text-[#171618] outline-none transition-colors placeholder:text-[#727578] focus-visible:border-[#171618] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
