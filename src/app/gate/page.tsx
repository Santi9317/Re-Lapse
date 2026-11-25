import type { Metadata } from "next";
import { GatePortal } from "@/components/GatePortal";
import { gateShortcutIcons } from "@/lib/home-icons";
import { APP_VERSION } from "@/lib/release";

const shortcutIcons = gateShortcutIcons(APP_VERSION);

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
    icon: [{ url: shortcutIcons.any192, sizes: "192x192", type: "image/png" }],
    apple: [{ url: shortcutIcons.apple, sizes: "180x180" }],
  },
};

export default function GatePage() {
  return <GatePortal />;
}
