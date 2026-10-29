export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

/**
 * Native: the picked file is used as-is. Downscaling on device needs
 * expo-image-manipulator, which is deferred until native builds are a priority.
 */
export async function prepareImage(uri: string, width: number, height: number): Promise<PreparedImage> {
  return { uri, width, height };
}
