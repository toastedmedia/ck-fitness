import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const heading = Fraunces({ variable: "--font-heading", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "CK Fitness", template: "%s | CK Fitness" },
  description: "Training, progress and accountability, built for you by CK Fitness.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f3d2e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
