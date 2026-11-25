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
