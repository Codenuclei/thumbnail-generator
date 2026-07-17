import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[20px] border border-[#efefef] bg-white px-[14px] text-[15px] tracking-[-0.1px] text-[#171618] outline-none transition-colors placeholder:text-[#727578] focus-visible:border-[#171618] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
