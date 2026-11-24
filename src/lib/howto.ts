export type HowToSection = {
  id: string;
  title: string;
  body: string[];
};

export const HOW_TO: HowToSection[] = [
  {
    id: "shoot",
    title: "Shooting",
    body: [
      "The round button is the shutter. Space bar too. The tally counts frames sent. This disposable does not run out. On an iPhone, flash starts on. The bolt turns it off. Back flash is the phone. Front flash is the screen.",
    ],
  },
  {
    id: "look",
    title: "The film look",
    body: [
      "What leaves the camera is not the preview. A tall frame, a little warmer, fine grain, soft corners. The date stamp prints in that orange, unless you turn it off.",
    ],
  },
  {
    id: "preview",
    title: "Front preview",
    body: [
      "The live front preview is a mirror. The shutter ignores the trick. The print stays true. The back camera is never mirrored.",
    ],
  },
  {
    id: "captions",
    title: "Captions",
    body: [
      "Optional, eighty characters. It rides the print if you share. Leave it blank and the lab does not invent one. Enter sends the frame.",
    ],
  },
  {
    id: "wait",
    title: "The develop wait",
    body: [
      "A personal frame waits five to thirty minutes. You do not pick the number, and you do not peek. A dot means it is ready. Tap Develop. Still yours alone.",
    ],
  },
  {
    id: "feed",
    title: "The feed",
    body: [
      "Developed is not shared. Send it when the frame deserves other people. Everyone with this link can see it for a week, then it lapses. Tap to open. Yours can be saved, deleted, or filed.",
    ],
  },
  {
    id: "albums",
    title: "Albums",
    body: [
      "Rolls are stacks you name. File a frame you shot into a roll you started. Event frames stay with their event.",
    ],
  },
  {
    id: "events",
    title: "Events",
    body: [
      "A shared camera with a clock, from one hour to a day. Invite by code, link, or name. It seals for a day and nobody peeks. Then you pick what hits the feed.",
    ],
  },
  {
    id: "stickers",
    title: "Stickers",
    body: [
      "Double-tap someone else's photo. One emoji, and it stays. Pick again to change yours. Not on a frame you shot.",
    ],
  },
  {
    id: "updates",
    title: "Updates",
    body: [
      "One dialog when a new version is waiting. Santi is in the lab. Develop the update reloads once. That version does not ask again.",
    ],
  },
  {
    id: "home",
    title: "Safari home screen",
    body: [
      "Safari asks once. Yes, then Share, Add to Home Screen, Add. On a Mac, Share, then Add to Dock. Opened from the icon, it stays quiet.",
    ],
  },
];
