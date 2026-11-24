export type FrameSticker = {
  emoji: string;
  profileId: string;
  profileName: string;
  mine: boolean;
};

export type FeedItem = {
  id: string;
  caption: string;
  createdAt: number;
  developedAt: number | null;
  sortAt: number;
  albumId: string | null;
  albumName: string | null;
  eventId: string | null;
  eventName: string | null;
  mine: boolean;
  profileId: string | null;
  profileName: string | null;
  profileEmojis: [string, string, string] | null;
  profileAvatar: boolean;
  stickers: FrameSticker[];
  onFeed: boolean;
};

export type SharedProfile = {
  id: string;
  username: string;
  emojis: [string, string, string];
  avatarPhotoId: string | null;
  avatarUrl: string | null;
  carouselIds: string[];
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

export type LabItem = {
  id: string;
  caption: string;
  createdAt: number;
  readyAt: number;
  labState: LabState;
  eventId: string | null;
  eventName: string | null;
  revealAt: number | null;
};

export type Album = {
  id: string;
  name: string;
  createdAt: number;
  frameCount: number;
};

export type EventStatus = "open" | "sealing" | "ready";

export type RollMember = {
  name: string | null;
  owner: boolean;
};

export type EventRoll = {
  id: string;
  name: string;
  durationHours: number;
  createdAt: number;
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
