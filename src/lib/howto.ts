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
      "A frame you just shot is not ready. It takes five to thirty minutes, and you do not pick the number. No peeking. When photos are ready, one large frame shows how many. Develop opens them one at a time. Swipe right to send a photo to the feed. You can write a caption, or skip it with one tap. Darkroom still lists every photo. Daylight and Night are other baths there: pick one before the clock runs out, or when the frame is ready. Tap the one you picked again to clear it. With neither picked, Develop uses the usual bath. A frame takes one bath.",
    ],
  },
  {
    id: "keepsakes",
    title: "Keepsakes",
    body: [
      "A gallery is photos you sent to the feed. Name the album, pick a cover, and add or remove your frames on that gallery. It shows on your profile. Open a photo you shot and tap it to write on the back. A photo you did not shoot stays face up.",
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
      "Double-tap a photo on the feed, including one you shot. Seven emojis show up to tap, and a plus lets you type your own. Each tap adds another sticker, and it stays. Tap a sticker to see who stuck it. On yours, remove sits next to your name. Drag a sticker when they cover the photo. The person who placed it, and the one who shot the frame, can move it. Double-tap again for a new seven. The line under the photo is a note for the back. Tap the frame once to turn it over and read the notes, written out by hand. You can sign a frame you shot.",
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
      "Double-tap the viewfinder, or the empty space around the frame, to swap the front camera and the back camera. The front preview stays a mirror. The saved photo does not.",
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
