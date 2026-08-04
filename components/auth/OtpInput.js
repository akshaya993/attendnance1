"use client";

// Six single-character boxes that behave like one field.
// Controlled component: the parent owns the string, this owns the focus.

import { useRef } from "react";

export default function OtpInput({
  value = "",
  onChange,
  disabled = false,
  length = 6,
  autoFocus = true,
}) {
  const boxes = useRef([]);

  // Missing positions render as empty boxes.
  const chars = Array.from({ length }, (_, i) => value[i] ?? "");

  function commit(nextChars) {
    // Gaps collapse when joined. Normal typing cannot create a gap - deleting
    // a middle digit shifts the rest left, which is what users expect anyway.
    onChange(nextChars.join("").replace(/\D/g, "").slice(0, length));
  }

  function focusBox(index) {
    const box = boxes.current[index];
    if (box) {
      box.focus();
      box.select();
    }
  }

  function handleChange(index, raw) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;

    // Pasting the whole code: fill forward from this box.
    if (digits.length > 1) {
      const next = [...chars];
      for (let i = 0; i < digits.length && index + i < length; i += 1) {
        next[index + i] = digits[i];
      }
      commit(next);
      focusBox(Math.min(index + digits.length, length - 1));
      return;
    }

    const next = [...chars];
    next[index] = digits;
    commit(next);
    if (index < length - 1) focusBox(index + 1);
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...chars];

      if (next[index]) {
        // Clear this box, stay put.
        next[index] = "";
        commit(next);
      } else if (index > 0) {
        // Already empty - clear the one before and move back.
        next[index - 1] = "";
        commit(next);
        focusBox(index - 1);
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusBox(index - 1);
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Verification code">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            boxes.current[index] = el;
          }}
          type="text"
          // Brings up the number pad on phones without rejecting paste.
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          value={char}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
          className="field h-14 w-full min-w-0 text-center text-xl"
        />
      ))}
    </div>
  );
}