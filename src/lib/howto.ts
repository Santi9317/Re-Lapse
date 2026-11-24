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
      "Shoot is the camera. The round button is the shutter. The space bar does the same job, and a volume key will too when the phone passes it through.",
      "Flip turns the lens around. The live front preview is a mirror, so your face sits where a mirror would put it. The shutter ignores that trick. The JPEG, the lab print, and the developed photo stay in true orientation. The back camera is never mirrored.",
      "The numbers up top are the stock, 400, and a tally of frames this camera has already sent. It is a counter, not a last-exposure warning. This disposable does not run out.",
      "If the lens cap stays on, allow the camera, or load a JPEG or PNG. You can also drop a picture onto the finder. On an iPhone the flash starts on. The little bolt turns it off. The back camera uses the phone's light. The front camera lights the screen, because a selfie has nowhere to bolt a flash. The camera you already allowed is the one that opens next time.",
      "The moment a frame is exposed, the finder covers. No peeking at the negative. That is the whole trick. Retake if it was a blink. If you are shooting an event, its name sits on the finder like a piece of tape. Peel the tape off and the next frame is a personal one.",
    ],
  },
  {
    id: "look",
    title: "The film look",
    body: [
      "What leaves the camera is not the preview. Re-Lapse prints a tall 4-by-5 frame with a mild disposable grade: a little warmer, a little softer, fine grain, and a light falloff in the corners. No light leaks. No smeared blur. Just the feeling of a cheap camera that knew what it was doing.",
      "The date stamp is on unless you turn it off. It prints in the corner the way a point-and-shoot does: month, day, and a short year, in that orange that means the picture already happened.",
    ],
  },
  {
    id: "captions",
    title: "Captions",
    body: [
      "After the exposure, a caption is optional. Eighty characters, counting the ones you meant. It rides on the lab card, and if you share the frame it rides on the print.",
      "Leave it blank and the lab does not invent one. Enter sends the frame. The count under the field is there so the sentence stops before it gets away from you.",
    ],
  },
  {
    id: "wait",
    title: "The develop wait",
    body: [
      "A personal frame goes to the lab, then it waits. Somewhere between five and thirty minutes. You do not pick the number, and you do not get to look early. The picture stays covered. The lab shows a countdown and talks a little while you do something else.",
      "Lab wears a dot when a frame is ready to develop. While everything is still waiting, it wears a count instead. Tap Develop. That is the first time the print is allowed to exist in front of you, and it is still yours alone.",
      "Download it, delete it, or send it on. Delete asks you to confirm. Gone means gone. If the lab says this camera needs a minute, the frames are coming in hot. Wait, then try again. The pictures already in the soup stay there.",
    ],
  },
  {
    id: "feed-send",
    title: "Sending to the feed",
    body: [
      "Developed is not the same as shared. Send to the feed when the frame deserves other people. Until you do, it stays in the lab, for your eyes. Everyone with this link can see what you send.",
      "Download hands the picture to the phone's share sheet when it can take a photo. On an iPhone you may still need Save Image to land it in Photos. The lab will say so if that is the case.",
    ],
  },
  {
    id: "albums",
    title: "Albums",
    body: [
      "Rolls are albums. Stacks of keepers with a name. Make one on the Rolls tab, up to forty characters. From the feed, a frame you shot can be filed into a roll you started, or left as a loose frame.",
      "Open the roll and the frames sit in a grid. You can only file into a roll you started. Event frames stay with their event. They do not join these stacks.",
    ],
  },
  {
    id: "events",
    title: "Event albums",
    body: [
      "An event is a shared camera with a clock. You choose how long the window stays open, from one hour through twenty-four. Twelve is where the dial starts. Start the event, then invite people. Copy the code, copy the link, or invite someone by the name on their profile. If two people wear the same name, send the code instead. They can also type the code under Join.",
      "Only people on the roll can add frames while the window is open. Shoot this event from the roll, and the finder wears the name. When the window closes, the roll seals for twenty-four hours. Nothing from it can be viewed. Not by you. Not by the group. The lab is allowed to be rude about this.",
      "An event frame does not use the five-to-thirty-minute wait. It waits with the whole roll. Until the seal breaks it sits in your lab covered, with the roll's name on it. There is no Develop button. The roll comes back together.",
      "When the seal breaks, the frames return in the order they were shot. You pick which ones hit the shared feed. The rest can stay held back. People you invited can see the whole roll, and they can see which frames you sent out. The feed only gets the ones you checked. Clear every check and the feed stays clear of this roll.",
      "You can still invite someone during the seal, so they are there when it opens. The phases read Open, Sealing, and Ready, so the hour is never a guess.",
    ],
  },
  {
    id: "feed",
    title: "The shared feed",
    body: [
      "The feed is everyone with this link. Personal frames you chose to send, and event frames the host released. A frame stays up for a week from the moment it was shared, or from the moment an event roll was revealed, then the file lapses. The print says how long it has left, and how long ago it was made.",
      "Tap a print once to open it larger. Double-tap someone else's developed photo to stick an emoji on the frame. The name, the little photo, and the three emojis belong to the person who shot it. Tap them to open their profile. Download keeps a copy. If you shot the frame, you can delete it. Yours can be filed into a roll from the menu on the print. An event name or a roll name shows on the border when the frame belongs somewhere.",
    ],
  },
  {
    id: "stickers",
    title: "Frame stickers",
    body: [
      "On someone else's developed photo, double-tap the picture. A tray of emoji opens. One emoji per person, and it stays on the frame. Pick again and yours changes. You do not get a second sticker, and you cannot sticker a frame you shot. A frame that is already covered says so.",
      "If the camera does not know your name yet, it asks. The sticker needs a person. The same double-tap works after you open the print. A single tap still opens the picture.",
      "On a photo you took, the stickers sit on the print. Tap one and that person's profile opens. On everyone else's photos the marks just stay where they were stuck.",
    ],
  },
  {
    id: "home",
    title: "The home-screen shortcut",
    body: [
      "Safari asks once, the first time you open Re-Lapse in the browser. The dialog says Add Re-Lapse to your home screen? Yes keeps the camera on the nightstand. On an iPhone the steps are Share, then Add to Home Screen, then Add. On a Mac they are Share, then Add to Dock. The lab cannot place the icon for you. No remembers that you heard it.",
      "Open Re-Lapse from the home-screen icon and the question stays quiet. It does not appear in Chrome or the other browsers. Those still get a small note: Install, when the browser can do it, or Hide, when it cannot. Hide remembers, on this device. A camera you already added opens full screen, like a thing you own rather than a tab you borrowed.",
    ],
  },
  {
    id: "updates",
    title: "Updates",
    body: [
      "The home-screen camera keeps a spare shell of Re-Lapse, so the icon can still open if the lab is slow to answer. The shell is the camera. The negatives still live at the lab.",
      "When a new version is waiting, one dialog shows up. It says Santi is in the lab, developing a better camera for you. Develop the update reloads the camera once. That same new version does not ask again.",
      "People who already saved the shortcut are not asked to add it again. The name stored on this device, the answer you already gave about the home screen, and the camera that already knows you stay put. Frames in the lab stay in the lab. If one corner of the interface still looks like an older roll, leave and come back.",
    ],
  },
  {
    id: "profile",
    title: "The profile",
    body: [
      "You is the sleeve with your name on it. A name, up to twenty-four characters. A photo, from this device or from a frame already on the feed. Three emojis that describe you, picked from the grids or typed. They show on the frames you share. Anyone on the feed can open that profile from a print.",
      "The carousel holds up to seventeen frames. The first one plays first. Arrange the strip to add, remove, and reorder. Drag a row, or use Earlier and Later. Everyone is the whole feed. Yours is only frames you shot. Tap a frame on the strip to open it.",
      "Edit the profile whenever you like. Wander off mid-edit and the draft waits in this tab until you save it, discard it, or close the tab. This guide, the version, and a stray line of inspiration live behind the faint marks at the top of You. Easy to miss. That is the point.",
    ],
  },
];
