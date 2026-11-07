"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Adapted from components/app/composer-input.tsx in OrgoAI/bops.
 * Copyright 2026 Nick Vasilescu and Organic Intelligence, Inc. FSL-1.1-ALv2.
 * Enter sends. Shift+Enter inserts a line. The box grows with the text.
 */
export function ComposerInput({
  value,
  onChange,
  className = "",
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        rest.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
      className={`block max-h-40 resize-none overflow-y-auto ${className}`}
      {...rest}
    />
  );
}
