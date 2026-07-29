"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { NoiseTexture } from "@/components/ui/noise-texture"
import { fieldShell, fieldText } from "@/components/ui/input"

type TextareaProps = React.ComponentProps<"textarea"> & {
  /** Skip the textured shell (for InputGroup / nested controls). */
  plain?: boolean
}

function Textarea({ className, plain = false, ...props }: TextareaProps) {
  const field = (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full resize-none px-3 py-2.5 outline-none",
        fieldText,
        "leading-[1.55] disabled:cursor-not-allowed disabled:text-[#75747d]",
        plain
          ? cn(
              "rounded-[var(--radius-inputs)] border border-[var(--field-border)] bg-white shadow-[var(--highlight-inset)] transition-[border-color,box-shadow] duration-[var(--duration-press)] ease-[var(--ease-out)]",
              "hover:border-[#75747d] focus:border-[#38296c] focus:ring-[3px] focus:ring-[#38296c]/15 disabled:bg-[#f7f7f8]"
            )
          : "relative z-10 rounded-[inherit] border-0 bg-transparent shadow-none focus-visible:ring-0",
        className
      )}
      {...props}
    />
  )

  if (plain) return field

  return (
    <div data-slot="textarea-shell" className={cn(fieldShell, "overflow-hidden")}>
      <NoiseTexture noiseOpacity={0.22} slope={0.1} className="opacity-30" />
      {field}
    </div>
  )
}

export { Textarea }
