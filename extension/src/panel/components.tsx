// Tiny shared UI primitives. Kept dumb on purpose — no state, no side effects.

import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <div className="vl-row">
      {label && <span className="vl-label" style={{ flex: 1 }}>{label}</span>}
      <button
        role="switch"
        aria-checked={checked}
        className="vl-toggle"
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="vl-label" style={{ marginBottom: 4 }}>{label}</div>
      {children}
      {help && <div className="vl-help">{help}</div>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={`vl-input ${className ?? ''}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={`vl-textarea ${className ?? ''}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return <select className={`vl-select ${className ?? ''}`} {...rest} />;
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="vl-card">
      {title && <div className="vl-card-title">{title}</div>}
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="vl-empty">{children}</div>;
}
