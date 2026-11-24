import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { PortraitLock } from "@/components/PortraitLock";
import "@fontsource/audiowide/latin-400.css";
import "@fontsource/chakra-petch/latin-400.css";
import "@fontsource/chakra-petch/latin-500.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Re-Lapse",
  description: "A shared disposable camera. Shoot, wait, develop.",
  applicationName: "Re-Lapse",
  manifest: "/manifest.webmanifest",
  referrer: "same-origin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Re-Lapse",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#07060f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers();
  return (
    <html lang="en">
      <body>
        <PortraitLock />
        {children}
      </body>
    </html>
  );
}
