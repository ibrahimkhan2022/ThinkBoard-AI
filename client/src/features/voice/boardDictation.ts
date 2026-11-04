import { refocusEditor, syncEditorSelection } from "../whiteboard/editorFocus";
import { screenToWorld } from "../whiteboard/logic/viewport";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { useVoiceStore, type WordsSink } from "./voiceStore";

/**
 * Where one recording's words go on the board. With live captions the words appear in a text box as they are spoken (and are
 * corrected in place as Meta hears more); without them the finished text arrives once. The words go in at the caret of the text
 * box being edited (replacing a selection), or into a new text box in the middle of the view when none is open.
 */
export function createBoardSink(): WordsSink {
  let region: { session: number; start: number; length: number; prefix: string; ownBox: boolean } | null = null;
  let written: string | null = null;

  const sink: WordsSink = (text, final) => {
    const board = useWhiteboardStore.getState();
    let draft = board.textDraft;

    if (!region) {
      if (!draft) {
        // Nothing open to speak into. The finished text becomes a box; live words open one so they can be seen as they come.
        if (final) return board.pasteText(text);
        board.beginTextEditAt(screenToWorld(board.viewport, { x: board.canvasSize.width / 2, y: board.canvasSize.height / 2 }));
        draft = useWhiteboardStore.getState().textDraft;
        if (!draft) return;
        region = { session: draft.session, start: 0, length: 0, prefix: "", ownBox: true };
      } else {
        syncEditorSelection();
        const start = Math.min(draft.sel.anchor, draft.sel.focus);
        const end = Math.max(draft.sel.anchor, draft.sel.focus);
        const needsSpace = start > 0 && !/\s/.test(draft.text[start - 1] ?? " ");
        region = { session: draft.session, start, length: end - start, prefix: needsSpace ? " " : "", ownBox: false };
      }
    }

    const current = useWhiteboardStore.getState().textDraft;
    if (!current || current.session !== region.session) {
      // The box was closed while it was listening: words already written stay where they are; otherwise they are not lost.
      if (final && written === null) board.pasteText(text);
      return;
    }
    // The student typed in the middle of the words: they are left alone, and the finished text is added at the caret instead.
    const intact = region.start + region.length <= current.text.length && (written === null || current.text.slice(region.start, region.start + region.length) === written);
    if (!intact) {
      if (final) {
        useWhiteboardStore.getState().insertIntoDraft(text);
        refocusEditor();
      }
      return;
    }
    const inserted = region.prefix + text;
    const next = current.text.slice(0, region.start) + inserted + current.text.slice(region.start + region.length);
    useWhiteboardStore.getState().inputDraftText(next, region.start + inserted.length);
    region.length = inserted.length;
    written = inserted;

    if (final) {
      if (region.ownBox) useWhiteboardStore.getState().commitTextEdit(region.session, { select: true });
      else refocusEditor();
    }
  };

  // Cancel: whatever was written while listening is taken back out.
  sink.discard = () => {
    if (!region || written === null) return;
    const board = useWhiteboardStore.getState();
    const current = board.textDraft;
    if (!current || current.session !== region.session) return;
    if (region.ownBox) return board.cancelTextEdit(region.session);
    if (current.text.slice(region.start, region.start + region.length) === written) {
      board.inputDraftText(current.text.slice(0, region.start) + current.text.slice(region.start + region.length), region.start);
    }
  };
  return sink;
}

/** The microphone on the whiteboard: press to listen, press again to stop and turn it into text. */
export function toggleBoardDictation() {
  const voice = useVoiceStore.getState();
  if (voice.status === "recording") {
    if (voice.source === "board") void voice.finish();
    return;
  }
  if (voice.status !== "idle") return;
  void voice.start(createBoardSink(), "board");
}
