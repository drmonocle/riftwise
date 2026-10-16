import React from "react";

const RELOAD_KEY = "riftwatch_part_reload";

/**
 * A part of the app that downloads the first time it's shown (the stats hub). Each website update replaces
 * these files, so a page left open across an update can ask for one that is gone: then reload once to get
 * the new version instead of showing a blank screen.
 */
export function lazyPart<P extends object>(load: () => Promise<React.ComponentType<P>>): React.LazyExoticComponent<React.ComponentType<P>> {
  return React.lazy(() =>
    load().then(
      (component) => {
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          /* storage blocked: nothing to clear */
        }
        return { default: component };
      },
      (err) => {
        let tried = true;
        try {
          tried = sessionStorage.getItem(RELOAD_KEY) === "1";
          sessionStorage.setItem(RELOAD_KEY, "1");
        } catch {
          /* storage blocked: don't risk a reload loop */
        }
        if (!tried) {
          window.location.reload();
          return new Promise<never>(() => {});
        }
        throw err;
      },
    ),
  );
}
