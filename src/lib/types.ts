export type FrameSticker = {
  id: string;
  emoji: string;
  profileId: string;
  profileName: string;
  mine: boolean;
  /** When this emoji was pinned. */
  pinnedAt: number;
  /** Center of this sticker, as a percent of the photo. */
  x: number;
  y: number;
};

export type FrameComment = {
  id: string;
  text: string;
  profileId: string;
  profileName: string;
  emojis: [string, string, string];
  hand: "caveat" | "patrick" | "kalam";
  mine: boolean;
  /** When this note was signed. */
  createdAt: number;
};

export type FeedItem = {
  id: string;
  caption: string;
  createdAt: number;
  developedAt: number | null;
  sortAt: number;
  /** When this frame landed on the feed. A timecapsule pick can be later than sortAt. */
  addedAt: number;
  albumId: string | null;
  /** Every gallery this photo sits in. Absent on older rows that only know albumId. */
  albumIds?: readonly string[];
  albumName: string | null;
  eventId: string | null;
  eventName: string | null;
  mine: boolean;
  profileId: string | null;
  profileName: string | null;
  profileEmojis: [string, string, string] | null;
  profileAvatar: boolean;
  stickers: FrameSticker[];
  comments: FrameComment[];
  onFeed: boolean;
};

export type SharedProfile = {
  id: string;
  username: string;
  emojis: [string, string, string];
  avatarPhotoId: string | null;
  avatarUrl: string | null;
  carouselIds: string[];
  galleries: GalleryCard[];
};

/** Fields present on a profile save. Omitted fields stay as they are. */
export type ProfilePatch = {
  username?: string;
  emojis?: [string, string, string];
  avatarPhotoId?: string | null;
  avatarImageBase64?: string | null;
  keepUpload?: boolean;
  carouselIds?: string[];
};

export type ProfileWrite = {
  username: string;
  emojis: [string, string, string];
  avatarPhotoId: string | null;
  avatarImageBase64: string | null;
  keepUpload: boolean;
  carouselIds: string[];
};

export type LabState = "developing" | "ready" | "developed" | "sealed";

export type Chemistry = "default" | "daylight" | "night";

export type LabItem = {
  id: string;
  caption: string;
  createdAt: number;
  readyAt: number;
  labState: LabState;
  eventId: string | null;
  eventName: string | null;
  revealAt: number | null;
  chemistry: Chemistry | null;
  graded: boolean;
  dateStamp: boolean;
  capturedAt: number | null;
};

export type Album = {
  id: string;
  name: string;
  createdAt: number;
  frameCount: number;
  coverPhotoId: string | null;
  owner: boolean;
};

export type GalleryCard = {
  id: string;
  name: string;
  frameCount: number;
  coverPhotoId: string | null;
};

/** Shoot is aimed at this gallery until the marker is cleared. */
export type GalleryRoll = {
  id: string;
  name: string;
};

export type AlbumDetail = {
  album: Album;
  photos: FeedItem[];
  library: FeedItem[];
};

export type EventStatus = "waiting" | "open" | "sealing" | "ready";

export type RollMember = {
  name: string | null;
  owner: boolean;
};

export type EventRoll = {
  id: string;
  name: string;
  durationHours: number;
  createdAt: number;
  startsAt: number;
  endsAt: number;
  revealAt: number;
  status: EventStatus;
  frameCount: number | null;
  inviteOnly: boolean;
  owner: boolean;
  memberCount: number;
  inviteCode: string | null;
};

export type EventDetail = EventRoll & {
  photos: FeedItem[];
  members: RollMember[];
};
