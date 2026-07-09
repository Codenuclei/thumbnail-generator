import type { Metadata } from "next";
import "./globals.css";
import { DM_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

/* OpenRunde substitute — geometric humanist sans */
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Thumbnail Studio",
  description: "Research, map, and generate YouTube thumbnails with Gemini",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", dmSans.variable)}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
