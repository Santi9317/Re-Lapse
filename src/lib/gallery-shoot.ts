export type ShotEvent = {
  id: string;
  startsAt: number;
  endsAt: number;
};

/**
 * A gallery session and an open timecapsule cannot share a frame.
 * An open timecapsule wins. Otherwise the frame is for the gallery, and it
 * still takes the ordinary lab wait.
 */
export function shotDestination(
  capturedAt: number,
  event: ShotEvent | null,
  galleryId: string | null,
): { eventId: string | null; albumId: string | null } {
  if (event != null && capturedAt >= event.startsAt && capturedAt < event.endsAt) {
    return { eventId: event.id, albumId: null };
  }
  return { eventId: null, albumId: galleryId };
}
