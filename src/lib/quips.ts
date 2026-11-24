const DEVELOPING = [
  "This frame is on a time lapse. The feed can chill. ⏳",
  "Don't lapse into peeking. It's still in the soup. 🧪",
  "Exposure pending. That's a lapse, not a leak. 📸",
  "Shutter up. This negative needs a minute. ✨",
  "It's having a little lapse before its big debut. 💿",
  "Focus is a process. Mid-lapse, do not disturb. 🌀",
  "Re\u2011Lapse later. The darkroom has the aux. 🎧",
  "No sneak peek. That would be a lapse in judgment. 😏",
  "Long exposure, short patience. It's getting there. 🌙",
  "Hold the aperture. The print is lapsing into focus. 🔮",
];

export function lapseQuip(seed: string): string {
  let n = 0;
  for (const char of seed) n = (n + char.charCodeAt(0)) % DEVELOPING.length;
  return DEVELOPING[n] ?? DEVELOPING[0];
}
