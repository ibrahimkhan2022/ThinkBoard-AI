import * as ImagePicker from "expo-image-picker";
import { visibleWorldRect } from "../logic/viewport";
import { useWhiteboardStore } from "../whiteboardStore";
import { prepareImage } from "./prepareImage";

/** Fraction of the visible board a newly added image may occupy. */
const INITIAL_FILL = 0.6;

/**
 * Lets the user pick a picture and places it, centred, in the part of the
 * board they are looking at. Resolves false if they cancelled.
 */
export async function importImageToBoard(): Promise<boolean> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return false;

  const image = await prepareImage(asset.uri, asset.width, asset.height);
  const { viewport, canvasSize } = useWhiteboardStore.getState();
  const view = visibleWorldRect(viewport, canvasSize);

  const fit = Math.min((view.width * INITIAL_FILL) / image.width, (view.height * INITIAL_FILL) / image.height, 1);
  const width = image.width * fit;
  const height = image.height * fit;
  useWhiteboardStore.getState().addImage({
    uri: image.uri,
    width,
    height,
    x: view.x + (view.width - width) / 2,
    y: view.y + (view.height - height) / 2,
  });
  return true;
}
