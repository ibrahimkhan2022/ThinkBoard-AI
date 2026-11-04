/**
 * Turns a drawing (SVG text) into a PNG picture for the board. The web build does it in the browser
 * (rasterizeSvg.web.ts); on native the board pictures need a native image library that is not added yet.
 */
export async function rasterizeSvg(_svg: string, _width: number, _height: number, _scale = 1.5): Promise<string> {
  throw new Error("Adding a graph to the board works in the web version for now.");
}
