import { StyleSheet, View } from "react-native";
import { Redo2, Undo2 } from "../../components/icons";
import { IconButton } from "../../components/IconButton";
import { shortcutLabel } from "../shortcuts/shortcuts";
import { useWhiteboardStore } from "./whiteboardStore";

/** Undo and redo for the current board; disabled when there is nothing to undo or redo. */
export function UndoRedo() {
  const canUndo = useWhiteboardStore((s) => s.history.past.length > 0);
  const canRedo = useWhiteboardStore((s) => s.history.future.length > 0);
  const { undo, redo } = useWhiteboardStore.getState();
  return (
    <View style={styles.row}>
      <IconButton icon={Undo2} label="Undo" shortcut={shortcutLabel("Z", { mod: true })} onPress={undo} disabled={!canUndo} size={36} />
      <IconButton icon={Redo2} label="Redo" shortcut={shortcutLabel("Z", { mod: true, shift: true })} onPress={redo} disabled={!canRedo} size={36} />
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 2 } });
