import React from "react";
import { tl } from "../i18n";

/**
 * Keeps a crash in one part of the app (the stats hub) from blanking the whole window: shows a short
 * message with a Reload button instead. Live scores and the other tabs keep working.
 */
export class PartBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(err: unknown): void {
    console.error("RiftWise: part of the app failed", err);
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="py-10 text-center text-xs text-rw-sub space-y-3" role="alert">
        <p>{tl("Couldn't load the stats right now. Check your connection and try again in a minute.")}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 rounded-lg border border-rw-border text-rw-teal hover:border-rw-teal"
        >
          {tl("Reload")}
        </button>
      </div>
    );
  }
}
