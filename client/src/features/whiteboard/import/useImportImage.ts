import { useCallback } from "react";
import { useToastStore } from "../../feedback/toastStore";
import { importImageToBoard } from "./importImage";

/** Opens the image picker; a cancelled picker does nothing, a failure shows a message. */
export function useImportImage() {
  return useCallback(() => {
    importImageToBoard().catch(() => {
      useToastStore.getState().show("Could not add that image. Try a PNG or JPEG.", "error");
    });
  }, []);
}
