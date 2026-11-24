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

export const EXPOSURE_LINES = [
  "Caught it. The light can relax. 📸",
  "That blink stayed. ✨",
  "Click, then keep. 💿",
  "The moment sat still. 🪑",
  "Memory, still warm. 🔥",
  "The shutter kept a secret. 🤫",
  "Written down in light. ✍️",
  "This second stays. 🌟",
  "Pocketed for the roll. 👜",
  "A little forever. ♾️",
  "The roll remembers. 🧠",
  "Caught mid-laugh. 😄",
  "Proof you were here. 📍",
  "Bottled this instant. 🍾",
  "Saved before it slipped. 🌅",
  "A souvenir of light. 🎁",
  "The feeling took. 💗",
  "The camera didn't flinch. 😎",
  "One keeper, sealed. ⭐",
  "Held for the people in it. 🫶",
  "You can blink now. ⏱️",
  "A quiet click, kept loud. 🔊",
  "The good light stayed. ☀️",
  "Caught the afterglow. 🌇",
  "A frame with a pulse. 💓",
  "Shutter, then story. 📖",
  "The blink you meant. 💫",
  "Latent, and loved. 💌",
  "Kept on purpose. 🎯",
  "The moment took a seat. 😌",
  "Light, on a short leash. 🦮",
  "Clicked into memory. 🧠",
  "The roll just winked. 😉",
  "Held the almost-gone. 🌙",
  "A lapse worth keeping. 💎",
  "Caught, caption optional. 💬",
  "Soft proof of now. 🫧",
  "This light doesn't leave. 🌟",
  "A yes from the shutter. ✅",
  "The frame took notes. 📝",
  "The unrepeatable bit. 🔒",
  "You clicked. It stayed. ✨",
  "A handshake with the light. 🤝",
  "Filed under we were here. 📁",
  "The whole table, caught. 🍽️",
  "Already a keeper. 💿",
  "Held still on purpose. 🪄",
  "A wink on the negative. 😉",
  "Suspiciously good timing. ⌚",
  "The light agreed to stay. 💡",
  "Memory, with sprockets. 🎞️",
  "Sealed while it's true. 🔐",
  "The good part is on film. 🎬",
  "A face, before it changed. 😊",
  "This memory has a frame. 🖼️",
  "Click, keep, remember. 💬",
  "Freshly exposed. Be gentle. 📸",
  "That laugh is on the roll. 😄",
  "Borrowed from the moment. ⌛",
  "The version you'll want back. 💭",
  "The room, as it was. 🏠",
  "Held the in-between. 🌀",
  "A click with witnesses. 👀",
  "Ordinary, and somehow magic. ✨",
  "On the roll, on purpose. 🎞️",
];

export function exposureLine(last: string | null, random: () => number = Math.random): string {
  const pool = last ? EXPOSURE_LINES.filter((line) => line !== last) : EXPOSURE_LINES;
  const source = pool.length > 0 ? pool : EXPOSURE_LINES;
  const unit = Math.min(0.999999, Math.max(0, random()));
  const index = Math.floor(unit * source.length);
  const line = source[index] ?? source[0];
  if (!line) throw new Error("The shutter has no lines left.");
  return line;
}
