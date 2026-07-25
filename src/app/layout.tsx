import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./mobile-nav.css";
import { Suspense } from "react";

import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import DraftSystemUpdate150ClientPatch from "@/components/draft/DraftSystemUpdate150ClientPatch";
import PwaInstallPrompt from "@/components/pwa/PwaInstallPrompt";
import PwaRegistration from "@/components/pwa/PwaRegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "East v. West Fantasy Football",
  description: "Dynasty fantasy football league for East v. West",
  applicationName: "East v. West",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "East v. West",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/pwa/icon.svg", type: "image/svg+xml" }],
    apple: [
      {
        url: "/assets/teams/East%20v%20West%20Logos/Official%20East%20v.%20West%20Logo.png",
        sizes: "500x500",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#08111f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pre-hydration theme setter to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try {
              const saved = localStorage.getItem('theme');
              const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
              const theme = saved || (prefersDark ? 'dark' : 'light');
              const el = document.documentElement;
              el.setAttribute('data-theme', theme);
              // Drive native form controls
              el.style.setProperty('color-scheme', theme);
            } catch (e) {} })();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
        <DraftSystemUpdate150ClientPatch />
        <PwaInstallPrompt />
        <PwaRegistration />
        <Analytics />
      </body>
    </html>
  );
}
