/**
 * Settings -> Sync & account: optional cloud sync (src/sync.ts, server/sync). Signed out: create an account
 * (username + password), sign in, use a sync code, or Discord / Twitch. Signed in: sync status, sign-in methods,
 * recovery code, sync code, download, sign out (everywhere), delete.
 */
import React, { useEffect, useState } from "react";
import { KeyRound, LogIn, UserPlus, Hash, RefreshCw, Download, LogOut, Trash2, X, Copy, Check, ShieldCheck, QrCode as QrIcon, History } from "lucide-react";
import { QrCode } from "./QrCode";
import { tl, locale } from "../i18n";
import { IS_WEB } from "../platform";
import {
  SYNC_EVENT,
  SyncAccount,
  SyncConfig,
  deleteAccount,
  exportData,
  getConfig,
  lastSynced,
  followBackups,
  restoreFollows,
  login,
  loginWithCode,
  newRecoveryCode,
  newSignInLink,
  newSyncCode,
  oauthSignIn,
  recover,
  register,
  savedSyncCode,
  setPassword,
  signOut,
  syncAccount,
  syncNow,
  unlink,
} from "../sync";

type Dialog =
  | { kind: "register" }
  | { kind: "login" }
  | { kind: "recover" }
  | { kind: "code" }
  | { kind: "password" }
  | { kind: "new-recovery" }
  | { kind: "delete" }
  | { kind: "show-recovery"; code: string }
  | { kind: "show-code"; code: string }
  | { kind: "qr" };

/** A server error code in the reader's language. */
function errorText(code: string): string {
  switch (code) {
    case "wrong":
      return tl("That didn't match. Check it and try again.");
    case "taken":
      return tl("That username is taken.");
    case "username":
      return tl("Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.");
    case "password_short":
      return tl("Passwords need at least 10 characters.");
    case "password_long":
      return tl("Passwords can be at most 128 characters.");
    case "password_common":
      return tl("That password is too easy to guess. A few random words work well.");
    case "password_username":
      return tl("Your password can't contain your username.");
    case "mismatch":
      return tl("The two passwords don't match.");
    case "too_many":
      return tl("Too many tries. Wait a few minutes and try again.");
    case "offline":
      return tl("Can't reach RiftWise right now. Check your connection.");
    case "last_method":
      return tl("That's your only way to sign in. Add another one first.");
    case "expired":
      return tl("That took too long. Please try again.");
    case "link_expired":
      return tl("That QR code has expired or was already used. Make a new one on your other device.");
    case "cancelled":
      return tl("Signing in was cancelled.");
    case "linked_elsewhere":
      return tl("That account is already used by another RiftWise account.");
    default:
      return tl("Something went wrong. Please try again in a minute.");
  }
}

const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50";
const primary = `${btn} bg-rw-accent border-rw-accent text-rw-bg`;
const plain = `${btn} border-rw-border text-rw-text hover:border-rw-line hover:bg-rw-raised`;
const input =
  "w-full rounded-lg bg-rw-bg border border-rw-border px-3 py-2 text-sm text-rw-text placeholder:text-rw-muted focus:outline-none focus:border-rw-accent";

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
    <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1L18 21a19.8 19.8 0 0 0 6-3c.5-5.1-.8-9.5-3.7-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
  </svg>
);
const TwitchIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
    <path d="M4.3 1 2 5.6v15.5h5.4V24h3l2.9-2.9h4.4L23 15.8V1H4.3Zm16.6 13.8-3.3 3.3h-5.4l-2.9 2.9v-2.9H4.9V3.1h16v11.7ZM17.6 7.6v6h-2.1v-6h2.1Zm-5.6 0v6H9.9v-6H12Z" />
  </svg>
);

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={plain}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        }, () => {})
      }
    >
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? tl("Copied") : tl("Copy")}
    </button>
  );
};

/**
 * A one-time sign-in QR code: scanning it with a phone camera opens riftwise.gg signed in to this account.
 * It works once, for 10 minutes; a new one can be made any time.
 */
const SignInQr: React.FC = () => {
  const [link, setLink] = useState<{ url: string; until: number } | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const make = () => {
    setError("");
    setLink(null);
    newSignInLink().then(
      (l) => setLink({ url: l.url, until: Date.now() + l.expires * 1000 }),
      (e) => setError(errorText((e as Error).message)),
    );
  };
  useEffect(make, []);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = link ? Math.max(0, Math.round((link.until - now) / 1000)) : 0;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-rw-sub">
        {tl("Scan this with your phone's camera to open RiftWise already signed in to this account. It works once, for 10 minutes.")}
      </p>
      <div className="flex justify-center">
        {link && left > 0 ? (
          <QrCode text={link.url} size={200} label={tl("Sign-in QR code")} />
        ) : (
          <div className="w-[200px] h-[200px] rounded-lg border border-rw-border flex items-center justify-center text-rw-muted text-center p-4">
            {link ? tl("This code has expired.") : error || tl("One moment…")}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-rw-muted tabular-nums">
          {link && left > 0 ? tl("Works for {time} more", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` }) : ""}
        </span>
        <span className="flex gap-1.5">
          {link && left > 0 && <CopyButton text={link.url} />}
          <button type="button" className={plain} onClick={make}>
            <RefreshCw className="w-3.5 h-3.5" />
            {tl("New code")}
          </button>
        </span>
      </div>
    </div>
  );
};

export const SyncPanel: React.FC<{ onOpenUrl: (url: string) => void }> = ({ onOpenUrl }) => {
  const [account, setAccount] = useState<SyncAccount | null>(syncAccount());
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState(lastSynced());
  const [backups, setBackups] = useState(followBackups());

  useEffect(() => {
    getConfig().then(setConfig, () => {});
    const on = (e: Event) => {
      setAccount(syncAccount());
      setLast(lastSynced());
      setBackups(followBackups());
      const d = (e as CustomEvent<{ error?: string }>).detail;
      if (d && d.error !== undefined) setError(d.error ? errorText(d.error) : "");
    };
    window.addEventListener(SYNC_EVENT, on);
    return () => window.removeEventListener(SYNC_EVENT, on);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const who = account
    ? account.username || (account.hasDiscord ? `${account.discord} (Discord)` : account.hasTwitch ? `${account.twitch} (Twitch)` : tl("Sync code"))
    : "";
  const code = savedSyncCode();
  const oauth = (p: "discord" | "twitch") => run(() => oauthSignIn(p, IS_WEB ? undefined : onOpenUrl));

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-rw-text uppercase tracking-wider flex items-center gap-1.5">
        {tl("Sync & account")}
      </h2>
      <div className="p-3 rounded-lg bg-rw-surface border border-rw-border space-y-3 text-xs">
        {!account ? (
          <>
            <p className="text-rw-sub leading-relaxed">
              {tl("Keep your followed teams, settings and revealed results the same on every device. It's optional: everything works without an account.")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary} onClick={() => setDialog({ kind: "register" })}>
                <UserPlus className="w-3.5 h-3.5" />
                {tl("Create account")}
              </button>
              <button type="button" className={plain} onClick={() => setDialog({ kind: "login" })}>
                <LogIn className="w-3.5 h-3.5" />
                {tl("Sign in")}
              </button>
              <button type="button" className={plain} onClick={() => setDialog({ kind: "code" })}>
                <Hash className="w-3.5 h-3.5" />
                {tl("Use a sync code")}
              </button>
              {config?.discord && (
                <button type="button" className={`${btn} border-[#5865f2]/60 text-white bg-[#5865f2]/80 hover:bg-[#5865f2]`} onClick={() => oauth("discord")} disabled={busy}>
                  <DiscordIcon />
                  {tl("Sign in with Discord")}
                </button>
              )}
              {config?.twitch && (
                <button type="button" className={`${btn} border-[#9146ff]/60 text-white bg-[#9146ff]/80 hover:bg-[#9146ff]`} onClick={() => oauth("twitch")} disabled={busy}>
                  <TwitchIcon />
                  {tl("Sign in with Twitch")}
                </button>
              )}
            </div>
            <p className="text-[11px] text-rw-muted flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
              {tl("No email or personal details needed. RiftWise keeps only your username (or sync code), a scrambled copy of your password, and what you sync.")}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-rw-text">{tl("Signed in as {name}", { name: who })}</div>
                <div className="text-[11px] text-rw-muted">
                  {last
                    ? tl("Last synced {time}", { time: new Date(last).toLocaleString(locale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })
                    : tl("Not synced yet")}
                </div>
              </div>
              <span className="flex flex-wrap gap-1.5">
                <button type="button" className={primary} onClick={() => setDialog({ kind: "qr" })}>
                  <QrIcon className="w-3.5 h-3.5" />
                  {tl("Sign in on your phone")}
                </button>
                <button type="button" className={plain} disabled={busy} onClick={() => run(() => syncNow())}>
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
                  {tl("Sync now")}
                </button>
              </span>
            </div>

            <div className="divide-y divide-rw-border border-t border-rw-border">
              {/* password */}
              <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-rw-sub">
                  <KeyRound className="w-3.5 h-3.5 inline mr-1.5" />
                  {account.hasPassword ? tl("Username and password: {name}", { name: account.username }) : tl("No password yet")}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <button type="button" className={plain} onClick={() => setDialog({ kind: "password" })}>
                    {account.hasPassword ? tl("Change password") : tl("Add a username and password")}
                  </button>
                  {account.hasPassword && (
                    <button type="button" className={plain} onClick={() => setDialog({ kind: "new-recovery" })}>
                      {tl("New recovery code")}
                    </button>
                  )}
                </span>
              </div>
              {/* sync code */}
              <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-rw-sub">
                  <Hash className="w-3.5 h-3.5 inline mr-1.5" />
                  {account.hasCode ? (code ? tl("Sync code: {code}", { code }) : tl("Sync code: made on another device")) : tl("No sync code")}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {account.hasCode && code && <CopyButton text={code} />}
                  <button type="button" className={plain} disabled={busy} onClick={() => run(async () => setDialog({ kind: "show-code", code: await newSyncCode() }))}>
                    {account.hasCode ? tl("New sync code") : tl("Get a sync code")}
                  </button>
                  {account.hasCode && (
                    <button type="button" className={plain} disabled={busy} onClick={() => run(() => unlink("code"))}>
                      {tl("Remove")}
                    </button>
                  )}
                </span>
              </div>
              {/* Discord / Twitch */}
              {(["discord", "twitch"] as const).map((p) => {
                const has = p === "discord" ? account.hasDiscord : account.hasTwitch;
                const name = p === "discord" ? account.discord : account.twitch;
                if (!has && !config?.[p]) return null;
                return (
                  <div key={p} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-rw-sub flex items-center gap-1.5">
                      {p === "discord" ? <DiscordIcon /> : <TwitchIcon />}
                      {has ? tl("{service}: {name}", { service: p === "discord" ? "Discord" : "Twitch", name }) : p === "discord" ? "Discord" : "Twitch"}
                    </span>
                    {has ? (
                      <button type="button" className={plain} disabled={busy} onClick={() => run(() => unlink(p))}>
                        {tl("Remove")}
                      </button>
                    ) : (
                      <button type="button" className={plain} disabled={busy} onClick={() => oauth(p)}>
                        {tl("Connect")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* what this device followed before sync last changed it: one tap puts a list back */}
            {backups.length > 0 && (
              <details className="border-t border-rw-border pt-2">
                <summary className="cursor-pointer text-rw-sub">
                  <History className="w-3.5 h-3.5 inline mr-1.5" />
                  {tl("Earlier copies of what you follow")}
                </summary>
                <p className="text-[11px] text-rw-muted mt-1.5">
                  {tl("When sync changes what this device follows, the list from before is kept here, in case something you removed came back.")}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {backups.map((b, i) => (
                    <li key={b.at} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-rw-sub">
                        {new Date(b.at).toLocaleString(locale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        {" · "}
                        {tl("{teams} teams, {players} players", { teams: b.follows.teams.length, players: b.follows.players.length })}
                        <span className="text-rw-muted"> ({[...b.follows.teams, ...b.follows.players].slice(0, 6).join(", ")}{b.follows.teams.length + b.follows.players.length > 6 ? "…" : ""})</span>
                      </span>
                      <button type="button" className={plain} onClick={() => { restoreFollows(i); setBackups(followBackups()); }}>
                        {tl("Put this back")}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {IS_WEB && (
                <button
                  type="button"
                  className={plain}
                  onClick={() =>
                    run(async () => {
                      const url = URL.createObjectURL(await exportData());
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "riftwise-account.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  {tl("Download my data")}
                </button>
              )}
              <button type="button" className={plain} disabled={busy} onClick={() => run(() => signOut(false))}>
                <LogOut className="w-3.5 h-3.5" />
                {tl("Sign out")}
              </button>
              <button type="button" className={plain} disabled={busy} onClick={() => run(() => signOut(true))}>
                {tl("Sign out everywhere")}
              </button>
              <button type="button" className={`${btn} border-rw-red/50 text-rw-red hover:bg-rw-red/10`} onClick={() => setDialog({ kind: "delete" })}>
                <Trash2 className="w-3.5 h-3.5" />
                {tl("Delete account")}
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="text-rw-red" role="alert">
            {error}
          </p>
        )}
      </div>
      {dialog && <SyncDialog dialog={dialog} account={account} onClose={() => setDialog(null)} onNext={setDialog} />}
    </section>
  );
};

const SyncDialog: React.FC<{ dialog: Dialog; account: SyncAccount | null; onClose: () => void; onNext: (d: Dialog) => void }> = ({
  dialog,
  account,
  onClose,
  onNext,
}) => {
  const [f, setF] = useState({ username: "", password: "", password2: "", current: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && dialog.kind !== "show-recovery" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, dialog.kind, onClose]);

  const submit = async (fn: () => Promise<void>, needsMatch = false) => {
    if (needsMatch && f.password !== f.password2) {
      setError(errorText("mismatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const passwordHint = <p className="text-[11px] text-rw-muted">{tl("At least 10 characters. A few random words make a strong password that's easy to remember.")}</p>;
  const newPasswordFields = (
    <>
      <input className={input} type="password" autoComplete="new-password" placeholder={tl("Password")} value={f.password} onChange={set("password")} />
      <input className={input} type="password" autoComplete="new-password" placeholder={tl("Password again")} value={f.password2} onChange={set("password2")} />
      {passwordHint}
    </>
  );

  let title = "";
  let body: React.ReactNode = null;
  let action: React.ReactNode = null;
  const go = (label: string, fn: () => Promise<void>, needsMatch = false, danger = false) => (
    <button type="submit" className={danger ? `${btn} bg-rw-red border-rw-red text-white` : primary} disabled={busy} onClick={(e) => (e.preventDefault(), submit(fn, needsMatch))}>
      {busy ? tl("One moment…") : label}
    </button>
  );

  switch (dialog.kind) {
    case "register":
      title = tl("Create account");
      body = (
        <>
          <input className={input} autoComplete="username" placeholder={tl("Username")} value={f.username} onChange={set("username")} autoFocus />
          {newPasswordFields}
        </>
      );
      action = go(tl("Create account"), async () => onNext({ kind: "show-recovery", code: await register(f.username.trim(), f.password) }), true);
      break;
    case "login":
      title = tl("Sign in");
      body = (
        <>
          <input className={input} autoComplete="username" placeholder={tl("Username")} value={f.username} onChange={set("username")} autoFocus />
          <input className={input} type="password" autoComplete="current-password" placeholder={tl("Password")} value={f.password} onChange={set("password")} />
          <button type="button" className="text-[11px] text-rw-teal hover:underline text-left" onClick={() => onNext({ kind: "recover" })}>
            {tl("Forgot your password? Use your recovery code")}
          </button>
        </>
      );
      action = go(tl("Sign in"), async () => (await login(f.username.trim(), f.password), onClose()));
      break;
    case "recover":
      title = tl("Reset your password");
      body = (
        <>
          <p className="text-[11px] text-rw-sub">{tl("Enter your username and the recovery code you saved when you made the account.")}</p>
          <input className={input} autoComplete="username" placeholder={tl("Username")} value={f.username} onChange={set("username")} autoFocus />
          <input className={`${input} font-mono uppercase`} placeholder={tl("Recovery code")} value={f.code} onChange={set("code")} />
          {newPasswordFields}
        </>
      );
      action = go(tl("Reset password"), async () => onNext({ kind: "show-recovery", code: await recover(f.username.trim(), f.code, f.password) }), true);
      break;
    case "code":
      title = tl("Use a sync code");
      body = (
        <>
          <p className="text-[11px] text-rw-sub">{tl("Have a code from another device? Type it here. No code yet? Make one, then type it on your other devices.")}</p>
          <input className={`${input} font-mono uppercase tracking-wider`} placeholder="XXXX-XXXX-XXXX-XXXX" value={f.code} onChange={set("code")} autoFocus />
        </>
      );
      action = (
        <span className="flex flex-wrap gap-2 justify-end">
          <button type="button" className={plain} disabled={busy} onClick={() => submit(async () => onNext({ kind: "show-code", code: await newSyncCode() }))}>
            {tl("Make a new code")}
          </button>
          {go(tl("Sign in with this code"), async () => (await loginWithCode(f.code), onClose()))}
        </span>
      );
      break;
    case "password":
      title = account?.hasPassword ? tl("Change password") : tl("Add a username and password");
      body = (
        <>
          {account?.hasPassword ? (
            <input className={input} type="password" autoComplete="current-password" placeholder={tl("Current password")} value={f.current} onChange={set("current")} autoFocus />
          ) : (
            <input className={input} autoComplete="username" placeholder={tl("Username")} value={f.username} onChange={set("username")} autoFocus />
          )}
          {newPasswordFields}
          {account?.hasPassword && <p className="text-[11px] text-rw-muted">{tl("Your other devices will be signed out.")}</p>}
        </>
      );
      action = go(
        tl("Save"),
        async () => {
          const rc = await setPassword(f.current, f.password, f.username.trim());
          if (rc) onNext({ kind: "show-recovery", code: rc });
          else onClose();
        },
        true,
      );
      break;
    case "new-recovery":
      title = tl("New recovery code");
      body = (
        <>
          <p className="text-[11px] text-rw-sub">{tl("Your old recovery code will stop working.")}</p>
          <input className={input} type="password" autoComplete="current-password" placeholder={tl("Password")} value={f.password} onChange={set("password")} autoFocus />
        </>
      );
      action = go(tl("Make a new code"), async () => onNext({ kind: "show-recovery", code: await newRecoveryCode(f.password) }));
      break;
    case "delete":
      title = tl("Delete account");
      body = (
        <>
          <p className="text-[11px] text-rw-sub">
            {tl("This deletes your account and everything synced, on every device. Your settings stay on this device. It can't be undone.")}
          </p>
          {account?.hasPassword && (
            <input className={input} type="password" autoComplete="current-password" placeholder={tl("Password")} value={f.password} onChange={set("password")} autoFocus />
          )}
        </>
      );
      action = go(tl("Delete account"), async () => (await deleteAccount(f.password), onClose()), false, true);
      break;
    case "show-recovery":
      title = tl("Save your recovery code");
      body = (
        <>
          <p className="text-[11px] text-rw-sub">
            {tl("This code is the only way back in if you forget your password. Save it somewhere safe (a password manager, a note, a photo). You won't see it again.")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-base tracking-wider text-rw-text bg-rw-bg border border-rw-border rounded-lg px-3 py-2 select-all">{dialog.code}</code>
            <CopyButton text={dialog.code} />
          </div>
          <label className="flex items-center gap-2 text-rw-sub">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            {tl("I saved my recovery code")}
          </label>
        </>
      );
      action = (
        <button type="button" className={primary} disabled={!saved} onClick={onClose}>
          {tl("Done")}
        </button>
      );
      break;
    case "show-code":
      title = tl("Your sync code");
      body = (
        <>
          <p className="text-[11px] text-rw-sub">
            {tl("On your other device, go to Settings → Sync & account → Use a sync code and type this code. Keep it private: anyone with it can see and change your synced settings.")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-base tracking-wider text-rw-text bg-rw-bg border border-rw-border rounded-lg px-3 py-2 select-all">{dialog.code}</code>
            <CopyButton text={dialog.code} />
          </div>
          <div className="border-t border-rw-border pt-2">
            <SignInQr />
          </div>
        </>
      );
      action = (
        <button type="button" className={primary} onClick={onClose}>
          {tl("Done")}
        </button>
      );
      break;
    case "qr":
      title = tl("Sign in on your phone");
      body = <SignInQr />;
      action = (
        <button type="button" className={primary} onClick={onClose}>
          {tl("Done")}
        </button>
      );
      break;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <form className="w-full max-w-sm rounded-xl bg-rw-surface border border-rw-border p-4 space-y-3 text-xs" onSubmit={(e) => e.preventDefault()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-rw-text">{title}</h3>
          {dialog.kind !== "show-recovery" && (
            <button type="button" onClick={onClose} aria-label={tl("Close")} className="p-1 text-rw-muted hover:text-rw-text" disabled={busy}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="space-y-2">{body}</div>
        {error && (
          <p className="text-rw-red" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end">{action}</div>
      </form>
    </div>
  );
};
