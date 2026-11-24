export type HowToSection = {
  id: string;
  title: string;
  body: string[];
};

export const HOW_TO: HowToSection[] = [
  {
    id: "shoot",
    title: "Shoot",
    body: ["The round button takes the picture. The little counter keeps score. This roll does not run out."],
  },
  {
    id: "wait",
    title: "The wait",
    body: [
      "A frame you just shot is not ready. It takes five to thirty minutes, and you do not pick the number. No peeking. When the dot shows, tap Develop.",
    ],
  },
  {
    id: "albums",
    title: "Albums",
    body: ["Albums are stacks you name. File a frame you shot into one you started."],
  },
  {
    id: "stickers",
    title: "Frame stickers",
    body: [
      "Double-tap a photo someone else shot. Seven emojis show up to tap, or type your own. One sticker, and it stays. Double-tap again for a new seven and to change yours. A frame you shot does not take one.",
    ],
  },
  {
    id: "zoom",
    title: "Pinch zoom",
    body: ["Pinch the viewfinder. The picture keeps the view you had."],
  },
  {
    id: "flip",
    title: "Flip",
    body: [
      "Double-tap the viewfinder to swap the front camera and the back camera. The front preview stays a mirror. The saved photo does not.",
    ],
  },
  {
    id: "profile",
    title: "Profile",
    body: ["Your name, your photo, and three emojis. They show up on the frames you share."],
  },
  {
    id: "menu",
    title: "This menu",
    body: [
      "You found it. Version is the number that moves when the camera changes. Inspiration hands you one line, then a different one next time.",
    ],
  },
];
