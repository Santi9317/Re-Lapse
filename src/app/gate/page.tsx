import type { Metadata } from "next";
import { GatePortal } from "@/components/GatePortal";

export const metadata: Metadata = {
  title: "Gate · Re-Lapse",
  robots: { index: false, follow: false },
  manifest: "/gate.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gate",
  },
  icons: {
    icon: [{ url: "/icons/gate-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/gate-apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function GatePage() {
  return <GatePortal />;
}
