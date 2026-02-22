import { FIELD_LABEL_CLASS, INPUT_CLASS } from "@/features/setup/constants";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}>) {
  return (
    <label className={FIELD_LABEL_CLASS}>
      {label}
      <input
        className={INPUT_CLASS}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
