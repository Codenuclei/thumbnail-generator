import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[9999px] border px-2.5 text-[12px] font-medium tracking-[-0.32px] whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#918df6] text-white",
        secondary: "border-transparent bg-[#f5f5f5] text-[#666666]",
        destructive: "border-transparent bg-[#ff3e00]/10 text-[#ff3e00]",
        outline: "border-[#e8e8e8] bg-white text-[#181925]",
        ghost: "border-transparent text-[#666666]",
        link: "border-transparent text-[#918df6]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
