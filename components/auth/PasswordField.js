"use client";

// Reusable password input with a SHOW / HIDE toggle.
// Used by the login form now, and by the first-login and change-password
// screens in Task 9. Parents on phones mistype passwords constantly, and a
// visibility toggle cuts failed logins far more than any error message can.

import { useState } from "react";

export default function PasswordField({
  id = "password",
  name = "password",
  label = "Password",
  value,
  onChange,
  disabled = false,
  autoComplete = "current-password",
  placeholder = "",
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="label-micro text-muted block mb-2">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="field w-full pr-20"
        />

        {/* type="button" is critical - without it this submits the form */}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          className="label-micro text-muted hover:text-body absolute right-1 top-1/2 -translate-y-1/2 px-3 py-3"
        >
          {visible ? "HIDE" : "SHOW"}
        </button>
      </div>
    </div>
  );
}