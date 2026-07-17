import type { Metadata } from "next";
import "./globals.css";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

/* Cycle: Inter for UI/body, Plus Jakarta Sans 800 as Eudoxus Sans substitute */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800"],
});

export const metadata: Metadata = {
  title: "Thumbnail Studio",
  description: "Research, map, and generate YouTube thumbnails with Gemini",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable, display.variable)}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
