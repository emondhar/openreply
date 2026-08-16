"use client";

/**
 * Keyword Input
 *
 * Tag-style input for adding/removing keywords.
 */

import { useState, type KeyboardEvent } from "react";

interface KeywordInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  max?: number;
  /**
   * Trigger keywords are stored upper-case. Caption-rule terms are not — they
   * are matched case-insensitively anyway, and shouting "#LAUNCH" back at
   * someone who typed "#launch" reads as a bug.
   */
  uppercase?: boolean;
  placeholder?: string;
  /** Noun used in the hint line. */
  noun?: string;
}

export default function KeywordInput({
  keywords,
  onChange,
  max = 10,
  uppercase = true,
  placeholder,
  noun = "keywords",
}: KeywordInputProps) {
  const [input, setInput] = useState("");

  function addKeyword(value: string) {
    const trimmed = uppercase ? value.trim().toUpperCase() : value.trim();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) return;
    if (keywords.length >= max) return;
    onChange([...keywords, trimmed]);
    setInput("");
  }

  function removeKeyword(keyword: string) {
    onChange(keywords.filter((k) => k !== keyword));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(input);
    }
    if (e.key === "Backspace" && !input && keywords.length > 0) {
      removeKeyword(keywords[keywords.length - 1]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 p-3 rounded bg-surface border border-border min-h-[48px]">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-2 px-2 py-1 rounded border border-border text-xs"
          >
            {keyword}
            <button
              type="button"
              onClick={() => removeKeyword(keyword)}
              aria-label={`Remove ${keyword}`}
              className="text-muted hover:text-error"
            >
              Remove
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            keywords.length === 0
              ? (placeholder ?? "Type keyword and press Enter...")
              : ""
          }
          className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground placeholder:text-zinc-500 outline-none"
        />
      </div>
      <p className="text-xs text-muted">
        {keywords.length}/{max} {noun} · Press Enter or comma to add
      </p>
    </div>
  );
}
