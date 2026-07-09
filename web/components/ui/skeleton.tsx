import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[16px] bg-[#f5f5f5]", className)}
      {...props}
    />
  )
}

export { Skeleton }
