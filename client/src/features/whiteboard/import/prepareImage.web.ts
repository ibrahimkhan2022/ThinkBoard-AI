export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 2048;

/**
 * Decodes (honouring EXIF orientation), downscales so the longest edge is at
 * most 2048px, and re-encodes as a data URI. Data URIs survive reloads and
 * saved sessions, unlike blob URLs. Lossless sources stay PNG; photos become JPEG.
 */
export async function prepareImage(uri: string): Promise<PreparedImage> {
  const blob = await (await fetch(uri)).blob();
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process the image.");
    context.drawImage(bitmap, 0, 0, width, height);

    const lossless = /png|gif|webp|svg/.test(blob.type);
    return { uri: lossless ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9), width, height };
  } finally {
    bitmap.close();
  }
}
