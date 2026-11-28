/**
 * One walk through the Feed, on a sample photo.
 * Everyone sees it on the next open. After that it waits for a new profile,
 * or for Feature Walkthrough in the You menu. The sample is not saved.
 */

export const FEATURE_WALK_KEY = "relapse.featureWalk";

export type FeatureWalkStep = {
  id: "feed" | "frame" | "notes";
  kicker: string;
  title: string;
  line: string;
};

export const FEATURE_WALK: readonly FeatureWalkStep[] = [
  {
    id: "feed",
    kicker: "Feed",
    title: "Frames from this link",
    line: "Photos people develop show up here. A frame stays up for a week, then it lapses.",
  },
  {
    id: "frame",
    kicker: "A frame",
    title: "Tap the sample",
    line: "Tap the photo to turn it over. The front is the picture. This sample is only for the walk.",
  },
  {
    id: "notes",
    kicker: "Notes",
    title: "On the back",
    line: "Notes sit on the back, written out by hand. When you leave, the sample is gone.",
  },
];

export function featureWalkSeen(raw: string | null): boolean {
  return raw === "seen";
}

/**
 * The first open shows the walk once. A profile that was just created shows it
 * again, and so does the menu. A later open does not.
 */
export function featureWalkDue(input: { seen: boolean; profileCreated: boolean; fromMenu: boolean }): boolean {
  if (input.fromMenu || input.profileCreated) return true;
  return !input.seen;
}
