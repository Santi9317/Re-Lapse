export type GalleryPlace = "profile" | "keepsakes";

type Framed = { id: string; albumId: string | null };

/**
 * A profile opens a gallery to look at the photos in it.
 * Add, remove, cover, title, and delete stay on Keepsakes, and only for the owner.
 */
export function galleryView<T extends Framed>(input: {
  place: GalleryPlace;
  owner: boolean;
  albumId: string;
  photos: readonly T[];
  library: readonly T[];
}): { editing: boolean; photos: T[]; addable: T[] } {
  const editing = input.place === "keepsakes" && input.owner;
  const photos = input.photos.filter((photo) => photo.albumId === input.albumId);
  if (!editing) return { editing, photos, addable: [] };
  const filed = new Set(photos.map((photo) => photo.id));
  return {
    editing,
    photos,
    addable: input.library.filter((photo) => !filed.has(photo.id)),
  };
}

const GALLERY_NAME_LIMIT = 40;

/**
 * Save stores a changed title, then the editor leaves for Keepsakes.
 * A blank title stays on the editor and says why. An unchanged title just leaves.
 */
export function galleryTitleSave(
  title: string,
  saved: string,
): { status: "write"; name: string } | { status: "leave" } | { status: "stay"; error: string } {
  const name = title
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length > GALLERY_NAME_LIMIT) return { status: "stay", error: "Give it a short name." };
  if (name === saved) return { status: "leave" };
  return { status: "write", name };
}
