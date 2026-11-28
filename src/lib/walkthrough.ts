/**
 * One walk through the Feed, then emojis, then signatures.
 * The first step is the Feed tab itself. The sample photo comes after that.
 * Everyone sees it on the next open. After that it waits for a new profile,
 * or for Feature Walkthrough in the You menu. The sample is not saved.
 */

export const FEATURE_WALK_KEY = "relapse.featureWalk";

export type FeatureWalkStep = {
  id: "feed" | "emoji" | "signatures";
  kicker: string;
  title: string;
  line: string;
};

export const FEATURE_WALK: readonly FeatureWalkStep[] = [
  {
    id: "feed",
    kicker: "Feed",
    title: "The Feed",
    line: "Photos people develop show up here. A frame stays up for a week, then it lapses.",
  },
  {
    id: "emoji",
    kicker: "Emoji",
    title: "On a frame",
    line: "Double-tap a frame to add an emoji. Hold it down to drag it. Tap yours, then Remove, to take it off. Newly added emojis glow blue.",
  },
  {
    id: "signatures",
    kicker: "Signatures",
    title: "On the back",
    line: "Tap once to flip the frame and write on the back. Frames with new unopened signatures glow blue. Frames glow blue when they have unread signatures. When you leave, the sample is gone.",
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
