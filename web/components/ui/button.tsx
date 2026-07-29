import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,transform] duration-[var(--duration-press)] ease-[var(--ease-out)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 type-ui",
  {
    variants: {
      variant: {
        default:
          "rounded-[var(--radius-buttons)] border-0 bg-[#000000] text-white shadow-[var(--shadow-subtle)] hover:bg-[#171618]",
        outline:
          "rounded-[var(--radius-buttons)] border border-[#171618] bg-transparent text-[#171618] hover:bg-[#f7f7f7]",
        secondary:
          "rounded-[var(--radius-buttons)] border border-[var(--field-border)] bg-white text-[#5c5e60] hover:border-[#75747d] hover:bg-[#f7f7f7] hover:text-[#171618]",
        ghost:
          "rounded-[var(--radius-buttons)] border-0 bg-transparent text-[#5c5e60] hover:bg-[#f7f7f7] hover:text-[#171618]",
        destructive:
          "rounded-[var(--radius-buttons)] border-0 bg-[#fff1ec] text-[#772914] hover:bg-[#feedcc]",
        link: "rounded-none border-0 bg-transparent px-3 text-[#171618] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-3.5",
        xs: "h-6 gap-1 px-2 text-[12px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5",
        lg: "h-10 px-4",
        icon: "size-9 rounded-[var(--radius-buttons)]",
        "icon-xs": "size-6 rounded-[var(--radius-buttons)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-[var(--radius-buttons)]",
        "icon-lg": "size-10 rounded-[var(--radius-buttons)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
