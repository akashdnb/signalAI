import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const describedBy = error ? `${htmlFor ?? "field"}-error` : hint ? `${htmlFor ?? "field"}-hint` : undefined;
  return (
    <div className={["min-w-0", className].filter(Boolean).join(" ")}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error ? (
        <p id={`${htmlFor ?? "field"}-error`} role="alert" className="m-0 mt-1.5 text-xs leading-5 text-err-ink">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor ?? "field"}-hint`} className="m-0 mt-1.5 text-xs leading-5 text-subtle">{hint}</p>
      ) : null}
      {describedBy && <span className="sr-only" aria-live={error ? "polite" : undefined} />}
    </div>
  );
}

const CONTROL_CLASSES = "mt-0.5 block min-h-10 w-full min-w-0 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink shadow-none transition-colors placeholder:text-subtle/80 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-60";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={[CONTROL_CLASSES, props.className ?? ""].filter(Boolean).join(" ")} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={[CONTROL_CLASSES, props.className ?? ""].filter(Boolean).join(" ")} />;
}

export function TextareaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={[CONTROL_CLASSES, "min-h-24 resize-y", props.className ?? ""].filter(Boolean).join(" ")} />;
}
