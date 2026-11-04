import { beforeEach, describe, expect, it } from "vitest";
import { sanitizeObjects } from "../boards/boardDoc";
import { parseObjects, serializeObjects } from "../whiteboard/logic/clipboard";
import type { ImageObject } from "../whiteboard/types";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { addRow, buildSpec, defaultForm, sanitizeGraphSource, setEquation, type GraphSource } from "./graphForm";
import { useGraphDialog } from "./graphStore";
import { selectedGraph } from "./selectedGraph";

const initial = useWhiteboardStore.getState();
const get = () => useWhiteboardStore.getState();
const source = (over: Partial<GraphSource["form"]> = {}, tab: GraphSource["tab"] = "function"): GraphSource => ({ tab, form: { ...defaultForm(), ...over } });
const picture = (graph?: GraphSource): Omit<ImageObject, "id" | "kind"> => ({ uri: "data:image/png;base64,AAAA", x: 10, y: 20, width: 300, height: 200, ...(graph ? { graph } : {}) });
const images = () => get().objects.filter((o): o is ImageObject => o.kind === "image");

beforeEach(() => {
  useWhiteboardStore.setState(initial, true);
  useGraphDialog.getState().hide();
});

describe("a graph keeps what it was made from", () => {
  it("is stored with the picture and saved with the board", () => {
    const saved = source({ equations: ["y = x^2", "x^2 + y^2 = 25"], functionTitle: "Two curves" });
    get().addImage(picture(saved));
    const back = sanitizeObjects(JSON.parse(JSON.stringify(get().objects))) as ImageObject[];
    expect(back[0].graph).toEqual(saved);
    expect(back[0]).toMatchObject({ uri: "data:image/png;base64,AAAA", x: 10, y: 20, width: 300, height: 200 });
  });

  it("survives copy and paste, so a copied graph can be edited too", () => {
    get().addImage(picture(source({ equations: ["y = 2x"] })));
    const pasted = parseObjects(serializeObjects(get().objects));
    expect((pasted![0] as ImageObject).graph?.form.equations).toEqual(["y = 2x"]);
  });

  it("is kept when a graph is duplicated", () => {
    get().addImage(picture(source()));
    get().duplicateSelected();
    expect(images().map((i) => !!i.graph)).toEqual([true, true]);
  });

  it("leaves an ordinary picture without graph settings", () => {
    get().addImage(picture());
    expect(images()[0].graph).toBeUndefined();
    expect("graph" in (sanitizeObjects(JSON.parse(JSON.stringify(get().objects)))[0] as object)).toBe(false);
  });

  it("drops damaged settings and keeps the picture", () => {
    const damaged = [
      { id: "a", kind: "image", uri: "u", x: 0, y: 0, width: 5, height: 5, graph: { tab: "nope", form: {} } },
      { id: "b", kind: "image", uri: "u", x: 0, y: 0, width: 5, height: 5, graph: { tab: "bar", form: { equations: [], seriesNames: ["s"], rows: [{ label: "a", values: ["1"] }] } } },
      { id: "c", kind: "image", uri: "u", x: 0, y: 0, width: 5, height: 5, graph: "text" },
    ];
    const out = sanitizeObjects(damaged) as ImageObject[];
    expect(out).toHaveLength(3);
    expect(out.every((o) => o.graph === undefined)).toBe(true);
  });
});

describe("reading saved graph settings", () => {
  it("accepts what the dialog makes, for every tab", () => {
    for (const tab of ["function", "line", "bar", "pie"] as const) expect(sanitizeGraphSource(source({}, tab))).toEqual(source({}, tab));
  });

  it("repairs a row with too few values and ignores unknown fields", () => {
    const s = sanitizeGraphSource({ tab: "bar", form: { ...defaultForm(), seriesNames: ["A", "B"], rows: [{ label: "x", values: ["1"] }], extra: 1 } });
    expect(s?.form.rows[0].values).toEqual(["1", ""]);
    expect(s && "extra" in s.form).toBe(false);
  });

  it("refuses nonsense", () => {
    for (const bad of [null, 5, "x", {}, { tab: "line" }, { tab: "line", form: null }, { tab: "radar", form: defaultForm() }]) expect(sanitizeGraphSource(bad)).toBeUndefined();
  });
});

describe("editing a graph on the board", () => {
  it("replaces the picture and the settings in place: same place, same size, same selection", () => {
    const id = get().addImage(picture(source({ equations: ["y = x"] })));
    get().updateImage(id, { uri: "data:image/png;base64,BBBB", graph: source({ equations: ["y = x^3"] }) });
    expect(images()).toHaveLength(1);
    expect(images()[0]).toMatchObject({ id, uri: "data:image/png;base64,BBBB", x: 10, y: 20, width: 300, height: 200 });
    expect(images()[0].graph?.form.equations).toEqual(["y = x^3"]);
    expect(get().selectedIds).toEqual([id]);
  });

  it("is one undo step, and undo brings the old graph back", () => {
    const id = get().addImage(picture(source({ equations: ["y = x"] })));
    get().updateImage(id, { uri: "data:image/png;base64,BBBB", graph: source({ equations: ["y = x^3"] }) });
    get().undo();
    expect(images()[0].uri).toBe("data:image/png;base64,AAAA");
    expect(images()[0].graph?.form.equations).toEqual(["y = x"]);
    get().redo();
    expect(images()[0].graph?.form.equations).toEqual(["y = x^3"]);
  });

  it("does nothing for a picture that is gone", () => {
    get().updateImage("missing", { uri: "x", graph: source() });
    expect(get().objects).toHaveLength(0);
  });

  it("starts from a copy, so cancelling the dialog cannot change the graph", () => {
    const saved = source({ equations: ["y = x"] });
    const id = get().addImage(picture(saved));
    useGraphDialog.getState().edit(id, saved);
    let form = useGraphDialog.getState().editing!.source.form;
    form = addRow(setEquation(form, 0, "y = x^9"));
    expect(form.equations[0]).toBe("y = x^9");
    expect(images()[0].graph?.form.equations).toEqual(["y = x"]); // the board's graph is untouched until Update
    expect(saved.form.rows).toHaveLength(4);
  });

  it("draws the saved settings again exactly as before", () => {
    const saved = source({ equations: ["y = x^2 - 4"], xMin: "-5", xMax: "5" });
    expect(buildSpec(saved.form, saved.tab)).toMatchObject({ kind: "function", xMin: -5, xMax: 5, equations: [{ text: "y = x^2 - 4" }] });
  });
});

describe("the dialog's two modes", () => {
  it("opens empty for a new graph and filled in for an edit, and forgets the edit when it closes", () => {
    const saved = source({ equations: ["y = x"] });
    useGraphDialog.getState().edit("g1", saved);
    expect(useGraphDialog.getState()).toMatchObject({ open: true, editing: { id: "g1", source: saved } });
    useGraphDialog.getState().hide();
    expect(useGraphDialog.getState()).toMatchObject({ open: false, editing: null });
    useGraphDialog.getState().edit("g1", saved);
    useGraphDialog.getState().show();
    expect(useGraphDialog.getState()).toMatchObject({ open: true, editing: null });
  });
});

describe("which selection can be edited", () => {
  it("is a single selected graph, and nothing else", () => {
    const g = get().addImage(picture(source()));
    const p = get().addImage(picture());
    expect(selectedGraph(get().objects, [g])?.id).toBe(g);
    expect(selectedGraph(get().objects, [p])).toBeNull(); // an ordinary picture
    expect(selectedGraph(get().objects, [g, p])).toBeNull(); // more than one
    expect(selectedGraph(get().objects, [])).toBeNull();
    expect(selectedGraph(get().objects, ["missing"])).toBeNull();
  });
});
