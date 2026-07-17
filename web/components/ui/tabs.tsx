"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center group-data-horizontal/tabs:h-10 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "rounded-[100px] bg-[#f7f7f7] p-1",
        /* Dashboard tab bar — white, underline indicator */
        line: "gap-0 rounded-none bg-transparent border-b border-[#efefef] p-0",
      },
    },
    defaultVariants: {
      variant: "line",
    },
  }
)

function TabsList({
  className,
  variant = "line",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-10 flex-1 items-center justify-center gap-1.5 px-4 text-[14px] font-medium tracking-[-0.01em] whitespace-nowrap text-[#727578] transition-colors outline-none hover:text-[#171618] disabled:pointer-events-none disabled:opacity-50 data-active:text-[#171618]",
        /* Line variant: ink underline */
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:bg-transparent after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-[#171618] after:opacity-0 after:transition-opacity group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        /* Pill variant */
        "group-data-[variant=default]/tabs-list:rounded-[100px] group-data-[variant=default]/tabs-list:data-active:bg-white group-data-[variant=default]/tabs-list:data-active:shadow-[var(--shadow-subtle-2)]",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
