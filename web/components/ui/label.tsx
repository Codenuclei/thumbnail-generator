"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        // 13px sits deliberately below the 15px field value: the label is
        // scaffolding, the value is the content. Tracking opens up rather than
        // tightening, since optical spacing needs more air as size drops.
        "flex items-center gap-2 text-[13px] font-medium tracking-[0.005em] text-[#171618] leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
