import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap outline-none select-none transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 type-ui",
  {
    variants: {
      variant: {
        /* Cycle primary CTA — pure black fill */
        default:
          "rounded-[8px] border-0 bg-[#000000] text-white shadow-[var(--shadow-subtle)] hover:bg-[#171618]",
        /* Ghost / outlined secondary */
        outline:
          "rounded-[8px] border border-[#171618] bg-transparent text-[#171618] hover:bg-[#f7f7f7]",
        secondary:
          "rounded-[8px] border border-[#efefef] bg-white text-[#727578] hover:bg-[#f7f7f7] hover:text-[#171618]",
        ghost:
          "rounded-[8px] border-0 bg-transparent text-[#727578] hover:bg-[#f7f7f7] hover:text-[#171618]",
        destructive:
          "rounded-[8px] border-0 bg-[#fff1ec] text-[#772914] hover:bg-[#feedcc]",
        link: "rounded-none border-0 bg-transparent px-3 text-[#171618] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-[22px] py-[10px]",
        xs: "h-7 px-3 text-[12px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 px-3.5",
        lg: "h-11 px-6",
        icon: "size-10 rounded-[8px]",
        "icon-xs": "size-7 rounded-[8px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[8px]",
        "icon-lg": "size-11 rounded-[8px]",
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
