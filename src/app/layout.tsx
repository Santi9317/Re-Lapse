import type { Metadata, Viewport } from "next";
import "@fontsource/audiowide/latin-400.css";
import "@fontsource/chakra-petch/latin-400.css";
import "@fontsource/chakra-petch/latin-500.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relapse",
  description: "A shared disposable camera. Shoot, wait, develop.",
  applicationName: "Relapse",
  manifest: "/manifest.webmanifest",
  referrer: "same-origin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Relapse",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#07060f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
