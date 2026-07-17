import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[20px] bg-[#efefef]", className)}
      {...props}
    />
  )
}

export { Skeleton }
