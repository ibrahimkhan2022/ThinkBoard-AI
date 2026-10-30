export interface ImageSize {
  width: number;
  height: number;
}

/** Pixel size read from a PNG or JPEG header, or null if it cannot be determined. */
export function imageSizeFromBase64(base64: string, mimeType: string | undefined): ImageSize | null {
  try {
    const bytes = Buffer.from(base64, "base64");
    if (mimeType === "image/png" || bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
      if (bytes.length < 24) return null;
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    // JPEG: walk the segments until a start-of-frame marker.
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const length = bytes.readUInt16BE(i + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      i += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

/** Assumed when the size is unknown: deliberately high, so cost estimates stay conservative. */
const UNKNOWN_IMAGE_TOKENS = 3000;
/**
 * Meta reports roughly 1,300–1,500 tokens for a ~1280 px image (about one
 * token per 700 pixels). We assume one per 500 so the estimate errs high.
 */
const PIXELS_PER_TOKEN = 500;

export function estimateImageTokens(size: ImageSize | null): number {
  if (!size) return UNKNOWN_IMAGE_TOKENS;
  return Math.max(100, Math.ceil((size.width * size.height) / PIXELS_PER_TOKEN));
}

/** Rough text token count (about 3 characters per token, a high estimate for English and maths). */
export const estimateTextTokens = (text: string) => Math.ceil(text.length / 3);
