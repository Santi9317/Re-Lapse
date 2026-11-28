import { blobToBase64, developPhoto, fetchLatent } from "@/lib/api";
import { developStampDate } from "@/lib/date-stamp";
import { renderDisposable } from "@/lib/filter";
import type { Chemistry } from "@/lib/types";

/** Run one bath and store the print. The caller already picked the chemistry. */
export async function developFrame(
  item: { id: string; capturedAt: number | null },
  options: { chemistry: Chemistry; stamp: boolean },
): Promise<void> {
  const latent = await fetchLatent(item.id);
  const bitmap = await createImageBitmap(latent);
  try {
    const when = developStampDate(options.stamp, item.capturedAt);
    const blob = await renderDisposable(bitmap, {
      chemistry: options.chemistry,
      dateStamp: Boolean(when),
      date: when,
      seed: item.id,
    });
    await developPhoto(item.id, { imageBase64: await blobToBase64(blob), chemistry: options.chemistry });
  } finally {
    bitmap.close();
  }
}
