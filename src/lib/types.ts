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

export type EventRoll = {
  id: string;
  name: string;
  durationHours: number;
  createdAt: number;
  endsAt: number;
  revealAt: number;
  status: EventStatus;
  frameCount: number | null;
};

export type EventDetail = EventRoll & {
  photos: FeedItem[];
};
