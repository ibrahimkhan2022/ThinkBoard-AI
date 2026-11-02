import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { recognizeShape } from "./shapeSnap";

const options = { minSize: 30 };

/** A small repeatable wobble, so "hand drawn" test strokes are not perfect and not random. */
function wobble(seed: number) {
  let s = seed;
  return (amount: number) => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return (s / 4294967296 - 0.5) * 2 * amount;
  };
}

const line = (a: Point, b: Point, steps = 40, noise = 2, seed = 1): Point[] => {
  const w = wobble(seed);
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / steps + w(noise), y: a.y + ((b.y - a.y) * i) / steps + w(noise) }));
};

const circle = (cx: number, cy: number, r: number, { turns = 1.03, noise = 3, steps = 90, start = 0.5, direction = 1, squash = 1 } = {}): Point[] => {
  const w = wobble(7);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = start + direction * 2 * Math.PI * turns * (i / steps);
    return { x: cx + (r + w(noise)) * Math.cos(angle), y: cy + (r + w(noise)) * Math.sin(angle) * squash };
  });
};

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

describe("lines", () => {
  it("snaps a wobbly diagonal stroke to two points, from where it began to where it ended", () => {
    const stroke = line({ x: 100, y: 100 }, { x: 400, y: 260 });
    const shape = recognizeShape(stroke, options)!;
    expect(shape.kind).toBe("line");
    expect(shape.points).toHaveLength(2);
    expect(shape.points[0]).toEqual(stroke[0]);
    const end = stroke[stroke.length - 1];
    expect(dist(shape.points[1], end)).toBeLessThan(1);
  });

  it("makes a nearly horizontal or vertical line exactly so, and keeps its length", () => {
    const flat = recognizeShape(line({ x: 100, y: 100 }, { x: 400, y: 110 }), options)!;
    expect(flat.points[1].y).toBeCloseTo(flat.points[0].y, 6);
    const upright = recognizeShape(line({ x: 100, y: 100 }, { x: 108, y: 420 }), options)!;
    expect(upright.points[1].x).toBeCloseTo(upright.points[0].x, 6);
    expect(dist(upright.points[0], upright.points[1])).toBeGreaterThan(300);
  });

  it("snaps a clear diagonal to 45 degrees, but leaves other slopes alone", () => {
    const diagonal = recognizeShape(line({ x: 0, y: 0 }, { x: 300, y: 296 }), options)!;
    expect(diagonal.points[1].x - diagonal.points[0].x).toBeCloseTo(diagonal.points[1].y - diagonal.points[0].y, 6);
    const other = recognizeShape(line({ x: 0, y: 0 }, { x: 300, y: 150 }), options)!;
    expect(other.points[1].y / other.points[1].x).toBeCloseTo(0.5, 1);
  });

  it("leaves strokes that are too short, curved, or back and forth", () => {
    expect(recognizeShape(line({ x: 0, y: 0 }, { x: 20, y: 5 }), options)).toBeNull();
    const arc = circle(200, 200, 150, { turns: 0.3 });
    expect(recognizeShape(arc, options)).toBeNull();
    const there = line({ x: 0, y: 0 }, { x: 300, y: 0 }, 30, 0.5);
    const zigzag = [...there, ...there.slice().reverse(), ...there];
    expect(recognizeShape(zigzag, options)).toBeNull();
  });
});

describe("circles", () => {
  it("snaps a hand-drawn circle to a closed ring of the same size and place", () => {
    const shape = recognizeShape(circle(300, 250, 100), options)!;
    expect(shape.kind).toBe("circle");
    const xs = shape.points.map((p) => p.x);
    const ys = shape.points.map((p) => p.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(300, 0);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(250, 0);
    expect((Math.max(...xs) - Math.min(...xs)) / 2).toBeCloseTo(100, -1);
    // Perfectly round and closed.
    const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    const radii = shape.points.map((p) => dist(p, centre));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.001 + 0);
    expect(dist(shape.points[0], shape.points[shape.points.length - 1])).toBeLessThan(0.001);
  });

  it("starts the ring where the pen started and goes the way the pen went", () => {
    for (const direction of [1, -1]) {
      const stroke = circle(300, 250, 100, { direction });
      const shape = recognizeShape(stroke, options)!;
      expect(dist(shape.points[0], stroke[0])).toBeLessThan(12);
      const a = Math.atan2(shape.points[1].y - 250, shape.points[1].x - 300) - Math.atan2(shape.points[0].y - 250, shape.points[0].x - 300);
      expect(Math.sign(Math.atan2(Math.sin(a), Math.cos(a)))).toBe(direction);
    }
  });

  it("accepts a circle that does not quite close, or overlaps a little", () => {
    expect(recognizeShape(circle(300, 250, 100, { turns: 0.9 }), options)?.kind).toBe("circle");
    expect(recognizeShape(circle(300, 250, 100, { turns: 1.15 }), options)?.kind).toBe("circle");
  });

  it("works at any size above the minimum", () => {
    expect(recognizeShape(circle(0, 0, 18, { noise: 0.5 }), options)?.kind).toBe("circle");
    expect(recognizeShape(circle(0, 0, 900, { noise: 20 }), options)?.kind).toBe("circle");
  });

  it("leaves an oval, an arc, a spiral or a scribble alone", () => {
    expect(recognizeShape(circle(300, 250, 100, { squash: 0.5 }), options)).toBeNull(); // a long oval
    expect(recognizeShape(circle(300, 250, 100, { turns: 0.5 }), options)).toBeNull(); // half a circle
    expect(recognizeShape(circle(300, 250, 100, { turns: 2.4 }), options)).toBeNull(); // goes round twice
    const w = wobble(3);
    const scribble = Array.from({ length: 80 }, () => ({ x: 300 + w(120), y: 250 + w(120) }));
    expect(recognizeShape(scribble, options)).toBeNull();
  });

  it("leaves a tiny circle (a dot or an 'o' in handwriting)", () => {
    expect(recognizeShape(circle(0, 0, 6, { noise: 0.2 }), options)).toBeNull();
  });
});

describe("other strokes", () => {
  it("leaves handwriting-like shapes alone: an S, a wave, a rectangle, a check mark", () => {
    const wave = Array.from({ length: 80 }, (_, i) => ({ x: i * 5, y: Math.sin(i / 6) * 40 }));
    expect(recognizeShape(wave, options)).toBeNull();
    const s = Array.from({ length: 80 }, (_, i) => {
      const t = (i / 79) * 2 * Math.PI;
      return { x: Math.sin(t) * 60, y: -100 + (i / 79) * 200 + Math.sin(t * 2) * 25 };
    });
    expect(recognizeShape(s, options)).toBeNull();
    const rect = [...line({ x: 0, y: 0 }, { x: 200, y: 0 }, 20), ...line({ x: 200, y: 0 }, { x: 200, y: 120 }, 15), ...line({ x: 200, y: 120 }, { x: 0, y: 120 }, 20), ...line({ x: 0, y: 120 }, { x: 0, y: 0 }, 15)];
    expect(recognizeShape(rect, options)).toBeNull();
    const check = [...line({ x: 0, y: 40 }, { x: 40, y: 90 }, 10), ...line({ x: 40, y: 90 }, { x: 160, y: 0 }, 20)];
    expect(recognizeShape(check, options)).toBeNull();
  });

  it("needs at least a few points", () => {
    expect(recognizeShape([], options)).toBeNull();
    expect(recognizeShape([{ x: 0, y: 0 }, { x: 100, y: 0 }], options)).toBeNull();
  });
});
