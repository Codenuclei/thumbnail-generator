import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap outline-none select-none transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 type-ui",
  {
    variants: {
      variant: {
        /* Primary CTA — lavender only here */
        default:
          "rounded-[9999px] border-0 bg-[#918df6] text-white shadow-[var(--shadow-subtle)] hover:bg-[#9580ff]",
        /* Outline secondary */
        outline:
          "rounded-[9999px] border border-[#e8e8e8] bg-white text-[#666666] shadow-[var(--shadow-subtle-2)] hover:bg-[#f5f5f5] hover:text-[#181925]",
        secondary:
          "rounded-[9999px] border-0 bg-[#f5f5f5] text-[#666666] hover:bg-[#e8e8e8]",
        /* Ghost — no border, graphite */
        ghost:
          "rounded-[9999px] border-0 bg-transparent text-[#666666] hover:bg-[#f5f5f5] hover:text-[#181925]",
        destructive:
          "rounded-[9999px] border-0 bg-[#ff3e00]/10 text-[#ff3e00] hover:bg-[#ff3e00]/15",
        link: "rounded-none border-0 bg-transparent px-3 text-[#181925] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        xs: "h-7 px-3 text-[12px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 px-3.5",
        lg: "h-11 px-6",
        icon: "size-10 rounded-[9999px]",
        "icon-xs": "size-7 rounded-[9999px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[9999px]",
        "icon-lg": "size-11 rounded-[9999px]",
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
