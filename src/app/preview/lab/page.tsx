import type { Metadata } from "next";
import { LabSwipePreview } from "@/components/LabSwipe";
import { labPose } from "@/lib/lab-swipe";

export const metadata: Metadata = {
  title: "Lab preview · Re-Lapse",
  robots: { index: false, follow: false },
};

/** A workshop for the lab swipe. It is not linked from the live lab. */
export default async function LabPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ pose?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.pose) ? params.pose[0] : params.pose;
  return <LabSwipePreview pose={labPose(raw)} />;
}
