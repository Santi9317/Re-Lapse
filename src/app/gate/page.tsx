import type { Metadata } from "next";
import { GatePortal } from "@/components/GatePortal";

export const metadata: Metadata = {
  title: "Gate · Re-Lapse",
  robots: { index: false, follow: false },
};

export default function GatePage() {
  return <GatePortal />;
}
