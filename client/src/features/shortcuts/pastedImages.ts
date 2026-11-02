import { useToastStore } from "../feedback/toastStore";
import { placeImage } from "../whiteboard/import/importImage";
import { prepareImage } from "../whiteboard/import/prepareImage";

/** A picture larger than this is refused rather than slowing the board down. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** The part of a DataTransfer that can hold pictures, so the logic can be tested without a browser. */
export interface PictureSource {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile: () => File | null }> | null;
}

/** The pictures on the clipboard or in a drop: a screenshot, a copied image, or image files dragged in. */
export function imageFilesFrom(data: PictureSource): File[] {
  const found: File[] = [];
  const add = (file: File | null) => {
    if (file && file.type.startsWith("image/") && !found.includes(file)) found.push(file);
  };
  for (const file of Array.from(data.files ?? [])) add(file);
  // Some browsers list a pasted picture only under `items`.
  for (const item of Array.from(data.items ?? [])) if (item.kind === "file" && item.type.startsWith("image/")) add(item.getAsFile());
  return found;
}

/** Adds each picture to the board (a few pixels apart when there are several) and says so if one could not be used. */
export async function addImageFiles(files: File[]): Promise<number> {
  let added = 0;
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      useToastStore.getState().show("That picture is too large (over 25 MB).", "error");
      continue;
    }
    const url = URL.createObjectURL(file);
    try {
      placeImage(await prepareImage(url, 0, 0), added);
      added++;
    } catch {
      useToastStore.getState().show("Could not add that image. Try a PNG or JPEG.", "error");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return added;
}
