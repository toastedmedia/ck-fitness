import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { FormMemory } from "@/components/FormMemory";
import { NativeShell } from "@/components/NativeShell";
import { NavProgress } from "@/components/NavProgress";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Chardikala Fitness", template: "%s | Chardikala Fitness" },
  description:
    "Training, progress and accountability, built for you by Chardikala Fitness.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1b1b36",
  width: "device-width",
  initialScale: 1,
  // Lets the page use the whole screen; the safe-area padding then keeps content clear of notches.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-card focus:bg-white focus:px-4 focus:py-3"
        >
          Skip to main content
        </a>
        <NativeShell />
        <NavProgress />
        <FormMemory />
        {children}
      </body>
    </html>
  );
}
