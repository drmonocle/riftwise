import type React from "react";

/**
 * Props that make a non-button element (a team name, a badge) work like a button for keyboard and
 * screen-reader users: it can be reached with Tab and opened with Enter or Space, not only clicked.
 */
export function clickable(onActivate: () => void): {
  role: "button";
  tabIndex: 0;
  onClick: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
} {
  return {
    role: "button",
    tabIndex: 0,
    onClick: () => onActivate(),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
