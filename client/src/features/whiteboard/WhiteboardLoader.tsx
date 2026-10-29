import WhiteboardCanvas from "./WhiteboardCanvas";

/** Native: Skia is ready at startup, so the canvas renders directly. */
export default function WhiteboardLoader() {
  return <WhiteboardCanvas />;
}
