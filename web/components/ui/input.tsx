"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"
import { NoiseTexture } from "@/components/ui/noise-texture"

type InputProps = React.ComponentProps<"input"> & {
  /** Skip the textured shell (for InputGroup / nested controls). */
  plain?: boolean
}

const fieldShell =
  "relative w-full rounded-[var(--radius-inputs)] border border-[var(--field-border)] bg-white shadow-[var(--highlight-inset)] transition-[border-color,box-shadow] duration-[var(--duration-press)] ease-[var(--ease-out)] hover:border-[#75747d] has-[:focus]:border-[#38296c] has-[:focus]:ring-[3px] has-[:focus]:ring-[#38296c]/15 has-[:focus]:hover:border-[#38296c] has-[:disabled]:border-[#d5d5da] has-[:disabled]:bg-[#f7f7f8] has-[:disabled]:shadow-none"

const fieldText =
  "text-[14px] leading-[20px] tracking-[-0.08px] text-[#171618] placeholder:text-[var(--field-placeholder)] placeholder:tracking-[-0.04px]"

function Input({ className, type, plain = false, ...props }: InputProps) {
  const field = (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 px-3 outline-none",
        fieldText,
        "[&::-webkit-search-cancel-button]:hidden disabled:cursor-not-allowed disabled:text-[#75747d]",
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
    <div data-slot="input-shell" className={cn(fieldShell, "overflow-hidden")}>
      <NoiseTexture noiseOpacity={0.22} slope={0.1} className="opacity-30" />
      {field}
    </div>
  )
}

export { Input, fieldShell, fieldText }
