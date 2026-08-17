"use client";

/**
 * Click-to-insert copy suggestions for a campaign field.
 *
 * Deliberately a row of full-text chips rather than a dropdown: the suggestion
 * *is* the label, so you read what you are about to insert instead of picking
 * a name and then discovering what it says. A dropdown would add a click and
 * remove the information the click needs.
 *
 * Inserting replaces the field rather than appending. These are starting
 * points, and appending a second greeting onto copy someone has already edited
 * is never what was meant.
 */

import { useState } from "react";
import {
  SUGGESTIONS,
  type SuggestionIntent,
} from "@/lib/campaigns/suggestions";

export function IntentTabs({
  value,
  onChange,
}: {
  value: SuggestionIntent;
  onChange: (intent: SuggestionIntent) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SUGGESTIONS.map((s) => (
        <button
          key={s.intent}
          type="button"
          onClick={() => onChange(s.intent)}
          aria-pressed={value === s.intent}
          title={s.hint}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            value === s.intent
              ? "bg-accent-strong text-background"
              : "border border-border text-muted hover:text-foreground"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export default function SuggestionPicker({
  options,
  onPick,
  label = "Suggestions",
  fillAll,
}: {
  /** Each option's text is both the label and what gets inserted. */
  options: string[];
  onPick: (text: string) => void;
  label?: string;
  /** Offered where a field holds a set (the rotating public replies). */
  fillAll?: { count: number; onFill: () => void };
}) {
  const [justPicked, setJustPicked] = useState<number | null>(null);

  if (!options.length) return null;

  function pick(text: string, i: number) {
    onPick(text);
    setJustPicked(i);
    window.setTimeout(
      () => setJustPicked((cur) => (cur === i ? null : cur)),
      1200
    );
  }

  return (
    <div className="mt-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-2">{label}</span>
        {fillAll && (
          <button
            type="button"
            onClick={fillAll.onFill}
            className="text-xs font-medium text-accent-strong hover:underline"
          >
            Fill all {fillAll.count}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((text, i) => (
          <button
            key={text}
            type="button"
            onClick={() => pick(text, i)}
            // The full text is the button, so a long DM suggestion is clamped
            // to one line here and shown in full on hover.
            title={text}
            className={`max-w-full truncate rounded-full border px-2.5 py-1 text-left text-xs transition-colors ${
              justPicked === i
                ? "border-accent-strong bg-accent-strong text-background"
                : "border-border text-muted hover:border-border-hover hover:text-foreground"
            }`}
          >
            {justPicked === i ? "Added ✓" : text.replace(/\n+/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}
