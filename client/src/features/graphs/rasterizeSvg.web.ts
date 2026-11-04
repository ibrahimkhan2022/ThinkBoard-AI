/**
 * Draws an SVG into a canvas and returns it as a PNG data URI. A data URI (not a blob URL) survives reloads and
 * saved boards, like every other picture on the board. `scale` makes the PNG sharper than its size on the board.
 */
export async function rasterizeSvg(svg: string, width: number, height: number, scale = 1.5): Promise<string> {
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not draw the graph."));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the graph.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
