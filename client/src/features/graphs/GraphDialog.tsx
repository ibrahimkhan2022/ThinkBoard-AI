import { drawGraph, GRAPH_COLORS, MAX_CATEGORIES, MAX_EQUATIONS, MAX_SERIES } from "@thinkboard/shared";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View, type TextStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { Plus, Trash as Trash2, X } from "../../components/icons";
import { colors, mono, radius } from "../../lib/theme";
import { placeImage } from "../whiteboard/import/importImage";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { useModalGuard } from "../overlays/overlayStore";
import {
  addEquation,
  addRow,
  addSeries,
  badCells,
  buildSpec,
  defaultForm,
  EXAMPLE_EQUATIONS,
  removeEquation,
  removeRow,
  removeSeries,
  setEquation,
  setLabel,
  setSeriesName,
  setValue,
  type GraphForm,
  type GraphSource,
  type GraphTab,
} from "./graphForm";
import { useGraphDialog, type EditingGraph } from "./graphStore";
import { rasterizeSvg } from "./rasterizeSvg";

const TABS: { id: GraphTab; label: string }[] = [
  { id: "function", label: "Equation" },
  { id: "line", label: "Line" },
  { id: "bar", label: "Bar" },
  { id: "pie", label: "Pie" },
];

// react-native-web only: no outline when focused.
const noOutline = { outlineStyle: "none" } as unknown as TextStyle;

/**
 * "Add a graph": type equations to plot (y = x^2 - 4, x^2 + y^2 = 25) or fill in a table for a line, bar or pie
 * chart. The preview is drawn live; "Add to board" puts it on the board as a picture the AI tutor can also read.
 */
export function GraphDialog() {
  const open = useGraphDialog((s) => s.open);
  const editing = useGraphDialog((s) => s.editing);
  const hide = useGraphDialog((s) => s.hide);
  useModalGuard(open);
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={hide}>
      {open && <GraphDialogBody key={editing?.id ?? "new"} editing={editing} onClose={hide} />}
    </Modal>
  );
}

function GraphDialogBody({ editing, onClose }: { editing: EditingGraph | null; onClose: () => void }) {
  // Editing starts from what the graph was made from; Cancel leaves the graph on the board as it was.
  const [tab, setTab] = useState<GraphTab>(editing?.source.tab ?? "function");
  const [form, setForm] = useState<GraphForm>(() => editing?.source.form ?? defaultForm());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const wide = useWindowDimensions().width >= 860;

  const change = (next: GraphForm) => {
    setForm(next);
    setFailure(null);
  };
  const drawing = useMemo(() => drawGraph(buildSpec(form, tab)), [form, tab]);
  const bad = useMemo(() => badCells(form), [form]);
  const canAdd = !drawing.problem && !busy;

  const add = async () => {
    if (!canAdd) return;
    setBusy(true);
    try {
      const picture = await rasterizeSvg(drawing.svg, drawing.width, drawing.height, 1.5);
      const source: GraphSource = { tab, form };
      if (editing) useWhiteboardStore.getState().updateImage(editing.id, { uri: picture, graph: source });
      else placeImage({ uri: picture, width: drawing.width, height: drawing.height }, 0, source);
      onClose();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Could not add the graph.");
      setBusy(false);
    }
  };

  const preview = (
    <View style={styles.previewColumn}>
      <View style={styles.previewBox} onLayout={(e) => setPreviewWidth(e.nativeEvent.layout.width)}>
        {drawing.problem ? (
          <View style={[styles.previewEmpty, { height: Math.max(180, previewWidth * 0.66) }]}>
            <Text style={styles.previewEmptyText}>{drawing.problem}</Text>
          </View>
        ) : (
          previewWidth > 0 && <SvgXml xml={drawing.svg} width={previewWidth} height={previewWidth * (drawing.height / drawing.width)} />
        )}
      </View>
      {bad.length > 0 && <Text style={styles.warn}>Some cells are not numbers; they are drawn as 0.</Text>}
      {failure && <Text style={styles.warn}>{failure}</Text>}
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      {tab === "function" ? <FunctionControls form={form} errors={drawing.equationErrors} change={change} /> : <ChartControls form={form} tab={tab} change={change} />}
    </View>
  );

  return (
    <View style={styles.backdrop}>
      <View style={styles.card} accessibilityLabel={editing ? "Edit the graph" : "Add a graph"}>
        <View style={styles.header}>
          <Text style={styles.title}>{editing ? "Edit graph" : "Add a graph"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <X size={18} color={colors.muted} strokeWidth={2.25} />
          </Pressable>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
              <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={[styles.body, wide && styles.bodyWide]} keyboardShouldPersistTaps="handled">
          {controls}
          {preview}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.button, styles.cancel]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={editing ? "Update the graph on the board" : "Add the graph to the board"} accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} onPress={() => void add()} style={[styles.button, styles.confirm, !canAdd && styles.confirmOff]}>
            <Text style={styles.confirmText}>{busy ? (editing ? "Updating…" : "Adding…") : editing ? "Update graph" : "Add to board"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, width, placeholder, mono: useMono, label2 }: { label: string; value: string; onChange: (v: string) => void; width?: number; placeholder?: string; mono?: boolean; label2?: string }) {
  return (
    <View style={[styles.field, width ? { width } : { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label2 ?? label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} spellCheck={false} style={[styles.input, useMono && styles.mono, noOutline]} />
    </View>
  );
}

function FunctionControls({ form, errors, change }: { form: GraphForm; errors: (string | null)[]; change: (f: GraphForm) => void }) {
  return (
    <>
      <Text style={styles.sectionLabel}>Equations</Text>
      {form.equations.map((text, i) => (
        <View key={i} style={styles.eqBlock}>
          <View style={styles.eqRow}>
            <View style={[styles.swatch, { backgroundColor: GRAPH_COLORS[i % GRAPH_COLORS.length] }]} />
            <TextInput
              value={text}
              onChangeText={(t) => change(setEquation(form, i, t.slice(0, 120)))}
              placeholder="y = x^2 - 4"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`Equation ${i + 1}`}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={[styles.input, styles.mono, styles.eqInput, errors[i] ? styles.inputBad : null, noOutline]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove equation ${i + 1}`} onPress={() => change(removeEquation(form, i))} style={styles.iconBtn}>
              <Trash2 size={16} color={colors.muted} strokeWidth={2} />
            </Pressable>
          </View>
          {errors[i] ? <Text style={styles.error}>{errors[i]}</Text> : null}
        </View>
      ))}
      {form.equations.length < MAX_EQUATIONS && (
        <Pressable accessibilityRole="button" accessibilityLabel="Add another equation" onPress={() => change(addEquation(form))} style={styles.addRow}>
          <Plus size={14} color={colors.accent} strokeWidth={2.5} />
          <Text style={styles.addText}>Add equation</Text>
        </Pressable>
      )}
      <Text style={styles.hint}>Try: y = 2x + 1 · y = sin(x) · x^2 + y^2 = 25 (a circle) · x = 3 (a vertical line)</Text>
      <View style={styles.chips}>
        {EXAMPLE_EQUATIONS.map((example) => (
          <Pressable key={example} accessibilityRole="button" accessibilityLabel={`Use the example ${example}`} onPress={() => change(addEquation(form, example))} style={styles.chip}>
            <Text style={styles.chipText}>{example}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Window</Text>
      <View style={styles.row}>
        <Field label="x from" value={form.xMin} onChange={(v) => change({ ...form, xMin: v })} />
        <Field label="x to" value={form.xMax} onChange={(v) => change({ ...form, xMax: v })} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Fit y to the curve</Text>
        <Switch value={form.autoY} onValueChange={(v) => change({ ...form, autoY: v })} accessibilityLabel="Fit the y range to the curve" trackColor={{ true: colors.accent, false: colors.border }} />
      </View>
      {!form.autoY && (
        <View style={styles.row}>
          <Field label="y from" value={form.yMin} onChange={(v) => change({ ...form, yMin: v })} />
          <Field label="y to" value={form.yMax} onChange={(v) => change({ ...form, yMax: v })} />
        </View>
      )}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Grid lines</Text>
        <Switch value={form.grid} onValueChange={(v) => change({ ...form, grid: v })} accessibilityLabel="Show grid lines" trackColor={{ true: colors.accent, false: colors.border }} />
      </View>
      <Field label="Title (optional)" value={form.functionTitle} onChange={(v) => change({ ...form, functionTitle: v.slice(0, 80) })} placeholder="e.g. A parabola" />
    </>
  );
}

function ChartControls({ form, tab, change }: { form: GraphForm; tab: Exclude<GraphTab, "function">; change: (f: GraphForm) => void }) {
  const pie = tab === "pie";
  const series = pie ? [form.seriesNames[0] ?? ""] : form.seriesNames;
  return (
    <>
      <Field label="Title (optional)" value={form.title} onChange={(v) => change({ ...form, title: v.slice(0, 80) })} placeholder="e.g. Fruit sold on Monday" />
      {!pie && (
        <View style={styles.row}>
          <Field label="x axis label" value={form.xLabel} onChange={(v) => change({ ...form, xLabel: v.slice(0, 50) })} placeholder="e.g. Fruit" />
          <Field label="y axis label" value={form.yLabel} onChange={(v) => change({ ...form, yLabel: v.slice(0, 50) })} placeholder="e.g. Number sold" />
        </View>
      )}

      <Text style={styles.sectionLabel}>Data</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.colHead, styles.labelCol]}>{pie ? "Slice" : "Label"}</Text>
        {series.map((name, k) => (
          <View key={k} style={styles.valueCol}>
            <TextInput value={name} onChangeText={(v) => change(setSeriesName(form, k, v.slice(0, 20)))} accessibilityLabel={`Name of series ${k + 1}`} placeholder={`Series ${k + 1}`} placeholderTextColor={colors.muted} style={[styles.colInput, { color: GRAPH_COLORS[pie ? 0 : k % GRAPH_COLORS.length] }, noOutline]} />
            {!pie && form.seriesNames.length > 1 && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove series ${k + 1}`} onPress={() => change(removeSeries(form, k))} style={styles.tinyBtn}>
                <X size={12} color={colors.muted} strokeWidth={2.5} />
              </Pressable>
            )}
          </View>
        ))}
        <View style={styles.iconBtn} />
      </View>
      {form.rows.map((row, r) => (
        <View key={r} style={styles.tableRow}>
          <TextInput value={row.label} onChangeText={(v) => change(setLabel(form, r, v.slice(0, 24)))} accessibilityLabel={`Row ${r + 1} label`} placeholder="label" placeholderTextColor={colors.muted} style={[styles.input, styles.labelCol, noOutline]} />
          {series.map((_, k) => (
            <TextInput
              key={k}
              value={row.values[k] ?? ""}
              onChangeText={(v) => change(setValue(form, r, k, v.slice(0, 14)))}
              accessibilityLabel={`Row ${r + 1} value${series.length > 1 ? ` ${k + 1}` : ""}`}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={[styles.input, styles.valueCol, badStyle(row.values[k] ?? ""), noOutline]}
            />
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove row ${r + 1}`} disabled={form.rows.length <= 1} onPress={() => change(removeRow(form, r))} style={[styles.iconBtn, form.rows.length <= 1 && styles.off]}>
            <Trash2 size={16} color={colors.muted} strokeWidth={2} />
          </Pressable>
        </View>
      ))}
      <View style={styles.row}>
        {form.rows.length < MAX_CATEGORIES && (
          <Pressable accessibilityRole="button" accessibilityLabel="Add a row" onPress={() => change(addRow(form))} style={styles.addRow}>
            <Plus size={14} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.addText}>Add row</Text>
          </Pressable>
        )}
        {!pie && form.seriesNames.length < MAX_SERIES && (
          <Pressable accessibilityRole="button" accessibilityLabel="Add a series" onPress={() => change(addSeries(form))} style={styles.addRow}>
            <Plus size={14} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.addText}>Add series</Text>
          </Pressable>
        )}
      </View>
      {pie && <Text style={styles.hint}>Each slice is its share of the total. Zero and negative values are left out.</Text>}
    </>
  );
}

const badStyle = (value: string) => (value.trim() !== "" && !Number.isFinite(Number(value.trim().replace(",", "."))) ? styles.inputBad : null);

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(0,0,0,0.38)" },
  card: { width: "100%", maxWidth: 980, maxHeight: "94%", borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  tab: { paddingHorizontal: 16, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  tabOn: { backgroundColor: colors.accentSoft },
  tabText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  tabTextOn: { color: colors.accent },
  body: { padding: 20, gap: 16 },
  bodyWide: { flexDirection: "row", alignItems: "flex-start" },
  controls: { flex: 1, minWidth: 0, gap: 10 },
  previewColumn: { flex: 1.25, minWidth: 0, gap: 8 },
  previewBox: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", overflow: "hidden" },
  previewEmpty: { alignItems: "center", justifyContent: "center", padding: 24 },
  previewEmptyText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  sectionLabel: { color: colors.muted, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 4 },
  field: { gap: 4 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  input: { height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, fontSize: 14 },
  inputBad: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  mono: { fontFamily: mono },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-end", flexWrap: "wrap" },
  eqBlock: { gap: 4 },
  eqRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eqInput: { flex: 1, minWidth: 0 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  off: { opacity: 0.3 },
  error: { color: colors.danger, fontSize: 12, marginLeft: 22 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.accentSoft },
  addText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  chipText: { color: colors.text, fontSize: 12.5, fontFamily: mono },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  tableHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  colHead: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  colInput: { flex: 1, minWidth: 0, height: 30, fontSize: 13, fontWeight: "700" },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  labelCol: { flex: 1.2, minWidth: 0 },
  valueCol: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  tinyBtn: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  warn: { color: colors.warning, fontSize: 12.5 },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  button: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.sm },
  cancel: { backgroundColor: colors.background },
  cancelText: { color: colors.text, fontWeight: "600" },
  confirm: { backgroundColor: colors.accent },
  confirmOff: { backgroundColor: "#B9B7EE" },
  confirmText: { color: "#fff", fontWeight: "700" },
});
