import React, { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { AppSettings } from "../types";
import { tl, tn } from "../i18n";
import { PushStatus, getPushStatus, enablePush, disablePush, sendTestPush } from "../push";

/** Current alert status for this browser, refreshed when it changes anywhere in the app. */
function usePushStatus(): [PushStatus | null, () => void] {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const refresh = useCallback(() => {
    getPushStatus()
      .then(setStatus)
      .catch(() => setStatus("unsupported"));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("riftwatch_push_changed", refresh);
    return () => window.removeEventListener("riftwatch_push_changed", refresh);
  }, [refresh]);
  return [status, refresh];
}

const toggleCls = (on: boolean) =>
  `px-3 py-1 font-bold rounded text-xs transition-colors shrink-0 ${on ? "bg-[#0ac8b9] text-[#091428]" : "bg-[#1e282d] text-[#7e8e9f]"}`;

/** Settings card: turn web alerts on/off, choose which ones, send a test. Web version only. */
export const PushAlertsCard: React.FC<{ settings: AppSettings; onUpdateSettings: (s: Partial<AppSettings>) => void }> = ({
  settings,
  onUpdateSettings,
}) => {
  const [status, refresh] = usePushStatus();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      const s = await enablePush(settings);
      if (s === "blocked") setNote(tl("Alerts are blocked for this site. Allow notifications for lolworlds.com in your browser's site settings, then try again."));
    } catch {
      setNote(tl("Couldn't turn on alerts. Check your connection and try again."));
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush().catch(() => {});
    setBusy(false);
    setNote(null);
    refresh();
  };
  const test = async () => {
    setNote(null);
    const ok = await sendTestPush().catch(() => false);
    setNote(ok ? tl("Test alert sent") : tl("Couldn't turn on alerts. Check your connection and try again."));
  };

  if (status === null) return null;

  return (
    <div className="p-3 rounded-lg bg-[#0a1420] border border-[#c8aa6e]/40 space-y-3">
      <div>
        <div className="font-semibold text-[#f0e6d2] flex items-center gap-1.5">
          {status === "on" ? <Bell className="w-3.5 h-3.5 text-[#0ac8b9]" /> : <BellOff className="w-3.5 h-3.5 text-[#7e8e9f]" />}
          <span>{tl("Alerts on this device")}</span>
        </div>
        <div className="text-[11px] text-[#7e8e9f]">
          {tl("Get an alert on this phone or computer when a team you follow is about to play, even with RiftWatch closed.")}
        </div>
      </div>

      {status === "unsupported" && <p className="text-xs text-[#9bb3c9]">{tl("This browser can't show alerts. Try Chrome, Edge, Firefox or Safari.")}</p>}
      {status === "needs-install" && (
        <p className="text-xs text-[#9bb3c9]">
          {tl("On iPhone or iPad: tap Share, then Add to Home Screen. Open RiftWatch from your home screen, then turn on alerts here.")}
        </p>
      )}
      {status === "blocked" && (
        <p className="text-xs text-[#9bb3c9]">
          {tl("Alerts are blocked for this site. Allow notifications for lolworlds.com in your browser's site settings, then try again.")}
        </p>
      )}
      {status === "off" && (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-[#c8aa6e] hover:bg-[#f0e6d2] text-[#091428] font-bold text-xs disabled:opacity-60 flex items-center gap-1.5"
        >
          <Bell className="w-3.5 h-3.5" />
          {tl("Turn on alerts")}
        </button>
      )}

      {status === "on" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#0ac8b9] font-semibold">{tl("Alerts are on for this device.")}</span>
            <span className="text-[#9bb3c9]">
              {tn("Alerts cover the {n} team you follow.", "Alerts cover the {n} teams you follow.", settings.followedTeams.length)}
            </span>
          </div>
          <div className="space-y-1.5">
            {(
              [
                ["notifyKickoff", tl("When a match starts")],
                ["notifyPregame", tl("15 minutes before")],
                ["notifyStream", tl("S-tier bangers on the 24/7 stream")],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-xs text-[#f0e6d2]">
                <span>{label}</span>
                <button type="button" onClick={() => onUpdateSettings({ [key]: !settings[key] })} className={toggleCls(settings[key])}>
                  {settings[key] ? tl("ON") : tl("OFF")}
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={test}
              className="px-2.5 py-1 rounded bg-[#091428] hover:bg-[#121e2d] border border-[#1e282d] hover:border-[#c8aa6e] text-[#c8aa6e] font-semibold text-xs"
            >
              {tl("Send a test alert")}
            </button>
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="px-2.5 py-1 rounded border border-[#1e282d] hover:border-[#e84057]/60 text-[#9bb3c9] text-xs"
            >
              {tl("Turn off alerts")}
            </button>
          </div>
        </>
      )}

      {note && <p className="text-xs text-[#c8aa6e]">{note}</p>}
      <p className="text-[10px] text-[#7e8e9f]">
        {tl("To send alerts, RiftWatch keeps this browser's alert address and the teams you follow. Nothing else. Turning alerts off deletes it.")}
      </p>
    </div>
  );
};

const BANNER_KEY = "riftwatch_push_banner_closed";

/** One-line nudge on the Watchlist (web only), shown until alerts are on or it is closed. */
export const PushAlertsBanner: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const [status, refresh] = usePushStatus();
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  if (closed || status !== "off") return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {
      /* fine */
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-lg bg-[#0a1420] border border-[#c8aa6e]/40 text-xs">
      <Bell className="w-4 h-4 text-[#c8aa6e] shrink-0" />
      <span className="flex-1 min-w-[9rem] text-[#f0e6d2]">{tl("Get an alert when your teams play")}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await enablePush(settings).catch(() => {});
          setBusy(false);
          refresh();
        }}
        className="px-3 py-1 rounded-md bg-[#c8aa6e] hover:bg-[#f0e6d2] text-[#091428] font-bold shrink-0 disabled:opacity-60"
      >
        {tl("Turn on alerts")}
      </button>
      <button type="button" onClick={close} aria-label={tl("Close")} className="p-1 text-[#7e8e9f] hover:text-[#f0e6d2] shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
