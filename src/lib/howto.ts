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
      "A frame you just shot is not ready. It takes five to thirty minutes, and you do not pick the number. No peeking. When the dot shows, tap Develop. Daylight and Night are other baths: pick one before the clock runs out, or when the frame is ready. Tap the one you picked again to clear it. With neither picked, Develop uses the usual bath. A frame takes one bath.",
    ],
  },
  {
    id: "keepsakes",
    title: "Keepsakes",
    body: [
      "A gallery is photos you sent to the feed. Name the album, pick a cover, and add or remove your frames on that gallery. It shows on your profile.",
    ],
  },
  {
    id: "timecapsules",
    title: "Timecapsules",
    body: [
      "Pick when a timecapsule opens. It stays open for 1 to 24 hours from that time, then it seals for a day. Invite people, and when it comes back you pick which frames hit the feed.",
    ],
  },
  {
    id: "stickers",
    title: "Frame stickers",
    body: [
      "Double-tap a photo someone else shot. Seven emojis show up to tap, and a plus lets you type your own. One sticker, and it stays. Double-tap again for a new seven and to change yours. The line under the photo is a note for the back. Tap the frame once to turn it over and read the notes, written out by hand. A frame you shot does not take one.",
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
    body: ["Your name, your photo, and three emojis. They show up on the frames you share. Galleries you make show here too."],
  },
  {
    id: "menu",
    title: "This menu",
    body: [
      "You found it. Version is the number that moves when the camera changes. Inspiration hands you one line, then a different one next time.",
    ],
  },
];
