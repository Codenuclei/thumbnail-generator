import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit items-center justify-center gap-1 overflow-hidden rounded-[100px] border px-[9px] py-[6px] text-[12px] font-medium [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#e7e0fe] text-[#38296c]",
        secondary: "border-transparent bg-[#f7f7f7] text-[#5c5e60]",
        destructive: "border-transparent bg-[#fff1ec] text-[#772914]",
        outline: "border-[#efefef] bg-white text-[#171618]",
        ghost: "border-transparent text-[#5c5e60]",
        link: "border-transparent text-[#38296c]",
        teal: "border-transparent bg-[#cfeff8] text-[#004d60]",
        amber: "border-transparent bg-[#feedcc] text-[#412e0a]",
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
