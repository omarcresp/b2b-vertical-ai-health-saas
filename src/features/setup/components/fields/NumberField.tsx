import { FIELD_LABEL_CLASS, INPUT_CLASS } from "@/features/setup/constants";

export function NumberField({
  label,
  value,
  onChange,
  min,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
}>) {
  return (
    <label className={FIELD_LABEL_CLASS}>
      {label}
      <input
        className={INPUT_CLASS}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    </label>
  );
}
