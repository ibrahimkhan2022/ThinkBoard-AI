interface Props {
  min: number;
  max: number;
  value: number;
  onStart: () => void;
  onChange: (value: number) => void;
  onEnd: () => void;
}

/** Native platforms use the −/+ buttons and number field instead of a slider. */
export function RangeInput(_props: Props) {
  return null;
}
