"use client";

/**
 * Checkbox
 *
 * A native input styled to match the rest of the dashboard — flat surface, 1px
 * border, accent fill when on. `indeterminate` cannot be set in markup, so it is
 * applied to the DOM node via a ref callback.
 */

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Renders the dash state used by a "select all" header when only some rows are on. */
  indeterminate?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export default function Checkbox({
  checked,
  onChange,
  indeterminate = false,
  disabled = false,
  label,
  className = "",
}: CheckboxProps) {
  return (
    <input
      type="checkbox"
      ref={(node) => {
        if (node) node.indeterminate = indeterminate && !checked;
      }}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className={`h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-border bg-surface accent-accent
        checked:border-accent checked:bg-accent
        indeterminate:border-accent indeterminate:bg-accent
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/50
        disabled:cursor-not-allowed disabled:opacity-40
        bg-[length:100%_100%] bg-center bg-no-repeat
        checked:bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 8.5l3.5 3.5L13 5'/%3E%3C/svg%3E")]
        indeterminate:bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M4 8h8'/%3E%3C/svg%3E")]
        ${className}`}
    />
  );
}
