import { Image as SkiaImage, type SkImage } from "@shopify/react-native-skia";
import { memo, useEffect, useState } from "react";
import { loadSkImage } from "./skiaImages";
import type { ImageObject } from "./types";

export const ImageView = memo(function ImageView({ image }: { image: ImageObject }) {
  const [decoded, setDecoded] = useState<SkImage | null>(null);

  useEffect(() => {
    let live = true;
    void loadSkImage(image.uri).then((result) => live && setDecoded(result));
    return () => {
      live = false;
    };
  }, [image.uri]);

  if (!decoded) return null;
  return <SkiaImage image={decoded} x={image.x} y={image.y} width={image.width} height={image.height} fit="fill" />;
});
