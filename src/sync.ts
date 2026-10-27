/**
 * Cloud sync (optional): keeps followed teams/players/leagues/regions, settings and revealed spoilers the same on
 * every device signed in to the same RiftWise account (server: server/sync, /api/sync/*).
 *
 * Three synced fields, each with the time it last changed: "follows", "settings", "revealed". A local change is
 * sent a moment later; other devices' changes are fetched on start, every 2 minutes, and when the window comes
 * back into view. For each field the newest change wins, except on a device's first sign-in: follows and reveals
 * are merged (nothing followed on either device is lost) and the account's settings are used. A list a device never
 * changed (still the starting T1 / Gen.G / Faker... follows) isn't merged in: the account's list is used as it is,
 * so signing in on a new computer can't bring back follows removed elsewhere. Before sync changes what this device
 * follows, the previous lists are kept (the last 5), and Settings -> Sync & account can put one back.
 */
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./api";
import type { AppSettings } from "./types";
import { IS_WEB, WEB_APP_URL } from "./platform";
import { allRevealed, replaceRevealed, REVEALED_EVENT } from "./revealed";

// The Windows app keeps the old address: installed apps can only reach lolworlds.com, and it keeps answering there
const API = IS_WEB ? "/api/sync/" : "https://lolworlds.com/riftwise/api/sync/";
const TOKEN_KEY = "riftwatch_sync_token";
const ACCOUNT_KEY = "riftwatch_sync_account";
const STATE_KEY = "riftwatch_sync_state"; // {times: {field: ms}, snap: {field: json}, last: ms}
const CODE_KEY = "riftwatch_sync_code"; // this account's sync code, kept on the device that made it (to show again)
const BACKUP_KEY = "riftwatch_follow_backups"; // [{at, follows}], newest first: what was followed before sync changed it
export const SYNC_EVENT = "riftwatch_sync_updated";

export interface SyncAccount {
  username: string;
  hasPassword: boolean;
  hasRecovery: boolean;
  hasCode: boolean;
  discord: string;
  hasDiscord: boolean;
  twitch: string;
  hasTwitch: boolean;
  created: string;
}

export interface SyncConfig {
  discord: boolean;
  twitch: boolean;
  minPassword: number;
}

/** Server error codes come back as Error(code): "wrong", "taken", "password_short" ... */
export class SyncError extends Error {}

type Field = { v: unknown; t: number };
type State = { times: Record<string, number>; snap: Record<string, string>; last: number };

const SETTING_KEYS = ["theme", "language", "spoilerMode", "defaultTab", "soundAlerts", "notifyKickoff", "notifyPregame", "notifyStream"] as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export const syncToken = (): string | null => read<string | null>(TOKEN_KEY, null);
export const syncAccount = (): SyncAccount | null => read<SyncAccount | null>(ACCOUNT_KEY, null);
export const savedSyncCode = (): string | null => read<string | null>(CODE_KEY, null);
export const lastSynced = (): number => read<State>(STATE_KEY, { times: {}, snap: {}, last: 0 }).last;
const changed = () => window.dispatchEvent(new Event(SYNC_EVENT));

async function call<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const headers: Record<string, string> = {};
  const tok = syncToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  } catch {
    throw new SyncError("offline");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (data as { error?: string }).error || `http_${res.status}`;
    // this device's sign-in is no longer valid (a password reset, "sign out everywhere", account deleted);
    // other refusals (a wrong password, an expired QR code) leave it signed in
    if (res.status === 401 && code === "not_signed_in" && tok) forget();
    throw new SyncError(code);
  }
  return data as T;
}

// ---- local values ----------------------------------------------------------------------------------------------

function localFields(s: AppSettings = loadSettings()): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) settings[k] = s[k];
  return {
    follows: { teams: s.followedTeams, players: s.followedPlayers, leagues: s.followedLeagues, regions: s.followedRegions },
    settings,
    revealed: allRevealed(),
  };
}

export interface Follows {
  teams: string[];
  players: string[];
  leagues: string[];
  regions: string[];
}
export interface FollowBackup {
  at: number;
  follows: Follows;
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
const sameSet = (a: unknown, b: string[]) => {
  const x = strings(a);
  return x.length === b.length && b.every((v) => x.includes(v));
};

/** What this device followed before each of the last few sync changes, newest first. */
export const followBackups = (): FollowBackup[] => read<FollowBackup[]>(BACKUP_KEY, []);

function keepBackup(f: Follows) {
  const list = followBackups().filter((b) => JSON.stringify(b.follows) !== JSON.stringify(f));
  write(BACKUP_KEY, [{ at: Date.now(), follows: f }, ...list].slice(0, 5));
}

/** Put an earlier copy back (it then syncs to the account's other devices as a normal change). */
export function restoreFollows(i: number) {
  const b = followBackups()[i];
  if (!b) return;
  const cur = loadSettings();
  keepBackup({ teams: cur.followedTeams, players: cur.followedPlayers, leagues: cur.followedLeagues, regions: cur.followedRegions });
  saveSettings({ ...cur, followedTeams: b.follows.teams, followedPlayers: b.follows.players, followedLeagues: b.follows.leagues, followedRegions: b.follows.regions });
}

const uniq = (a: unknown, b: unknown) =>
  Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter((x): x is string => typeof x === "string")));

function applyField(name: string, v: unknown) {
  if (name === "follows" && v && typeof v === "object") {
    const f = v as Record<string, unknown>;
    const cur = loadSettings();
    const list = (x: unknown, dflt: string[]) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : dflt);
    const before: Follows = { teams: cur.followedTeams, players: cur.followedPlayers, leagues: cur.followedLeagues, regions: cur.followedRegions };
    const after: Follows = { teams: list(f.teams, before.teams), players: list(f.players, before.players), leagues: list(f.leagues, before.leagues), regions: list(f.regions, before.regions) };
    if (JSON.stringify(before) !== JSON.stringify(after)) keepBackup(before);
    saveSettings({
      ...cur,
      followedTeams: list(f.teams, cur.followedTeams),
      followedPlayers: list(f.players, cur.followedPlayers),
      followedLeagues: list(f.leagues, cur.followedLeagues),
      followedRegions: list(f.regions, cur.followedRegions),
    });
  } else if (name === "settings" && v && typeof v === "object") {
    const cur = loadSettings();
    const next = { ...cur } as Record<string, unknown>;
    for (const k of SETTING_KEYS) if (k in (v as object)) next[k] = (v as Record<string, unknown>)[k];
    saveSettings(next as unknown as AppSettings);
    // loadSettings() cleans up anything this version doesn't know; a new language needs the page reloaded
    if (cur.language !== loadSettings().language) window.setTimeout(() => window.location.reload(), 300);
  } else if (name === "revealed" && v && typeof v === "object") {
    replaceRevealed(v as Record<string, number>);
  }
}

// ---- syncing ---------------------------------------------------------------------------------------------------

let running: Promise<void> | null = null;
let pushTimer: number | undefined;

/** Fetch the account's data, apply what's newer, send what's newer here. */
export function syncNow(): Promise<void> {
  if (!syncToken()) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    const st = read<State>(STATE_KEY, { times: {}, snap: {}, last: 0 });
    const first = Object.keys(st.times).length === 0;
    const remote = (await call<{ fields: Record<string, Field> }>("data")).fields || {};
    const local = localFields();
    const now = Date.now();
    const out: Record<string, Field> = {};
    for (const name of Object.keys(local)) {
      const lv = local[name];
      const ljson = JSON.stringify(lv);
      const r = remote[name];
      // has this field changed here since the last sync?
      if (st.snap[name] !== undefined && st.snap[name] !== ljson) st.times[name] = now;
      if (!r) {
        st.times[name] = st.times[name] || now;
        out[name] = { v: lv, t: st.times[name] };
      } else if (first && (name === "follows" || name === "revealed")) {
        // first sign-in on this device: keep everything from both sides, except lists this device never changed
        // (the starting follows), which would otherwise come back on every account that removed them
        let merged: unknown;
        if (name === "follows") {
          const a = (lv || {}) as Record<string, unknown>;
          const b = (r.v || {}) as Record<string, unknown>;
          const both = (k: "teams" | "players" | "leagues" | "regions", start: string[]) =>
            sameSet(a[k], start) && Array.isArray(b[k]) ? strings(b[k]) : uniq(b[k], a[k]);
          merged = {
            teams: both("teams", DEFAULT_SETTINGS.followedTeams),
            players: both("players", DEFAULT_SETTINGS.followedPlayers),
            leagues: both("leagues", DEFAULT_SETTINGS.followedLeagues),
            regions: both("regions", DEFAULT_SETTINGS.followedRegions),
          };
        } else {
          merged = { ...(lv as object), ...(r.v as object) };
        }
        applyField(name, merged);
        const mjson = JSON.stringify(merged);
        st.times[name] = mjson === JSON.stringify(r.v) ? r.t : now;
        if (st.times[name] !== r.t) out[name] = { v: merged, t: st.times[name] };
      } else if (r.t > (st.times[name] || 0) || (first && name === "settings")) {
        applyField(name, r.v);
        st.times[name] = r.t;
      } else if ((st.times[name] || 0) > r.t) {
        out[name] = { v: lv, t: st.times[name] };
      }
    }
    if (Object.keys(out).length) await call("data", { fields: out });
    // remember what each field looks like now, so the next change is noticed
    const after = localFields();
    for (const name of Object.keys(after)) st.snap[name] = JSON.stringify(after[name]);
    st.last = Date.now();
    write(STATE_KEY, st);
    changed();
  })().finally(() => {
    running = null;
  });
  return running;
}

/** A setting, follow or reveal changed here: send it a moment later (several quick changes go together). */
function schedulePush() {
  if (!syncToken()) return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => syncNow().catch(() => {}), 1500);
}

/**
 * Sign-in hand-offs that arrive in the address: #link=... (a phone scanned another device's QR code), #signin=...
 * (back from Discord / Twitch on the website), #signin-error=... and #signin-linked. Checked on start and whenever the
 * address changes (the site may already be open in that tab).
 */
function handleHash() {
  // open Settings first, then report (the Sync & account panel has to be there to show it)
  const report = (detail: { error?: string; linked?: boolean }) => {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { open: true } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail })), 400);
  };
  const h = window.location.hash;
  if (h.startsWith("#link=")) {
    // a phone scanned the QR code another device showed: sign in to that account
    const token = h.slice(6);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    call<{ token: string; account: SyncAccount }>("link/use", { token })
      .then((r) => signedIn(r.token, r.account))
      .then(() => report({ linked: true }))
      .catch((e) => report({ error: (e as Error).message === "expired" ? "link_expired" : (e as Error).message }));
  } else if (h.startsWith("#signin=")) {
    const ticket = h.slice(8);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    call<{ token: string; account: SyncAccount }>("auth/ticket", { ticket })
      .then((r) => signedIn(r.token, r.account))
      .then(() => report({}))
      .catch((e) => report({ error: (e as Error).message }));
  } else if (h.startsWith("#signin-error=") || h === "#signin-linked") {
    const error = h.startsWith("#signin-error=") ? decodeURIComponent(h.slice(14)) : "";
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (h === "#signin-linked") refreshAccount().catch(() => {});
    report({ error });
  }
}

let started = false;
/** Called once at startup: sync now, on changes, every 2 minutes and when the window comes back. */
export function startSync() {
  if (started) return;
  started = true;
  window.addEventListener("riftwatch_settings_updated", schedulePush);
  window.addEventListener(REVEALED_EVENT, schedulePush);
  window.setInterval(() => document.visibilityState === "visible" && syncNow().catch(() => {}), 2 * 60 * 1000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && syncNow().catch(() => {}));
  handleHash();
  window.addEventListener("hashchange", handleHash);
  if (syncToken()) {
    syncNow().catch(() => {});
    refreshAccount().catch(() => {});
  }
}

function forget() {
  write(TOKEN_KEY, null);
  write(ACCOUNT_KEY, null);
  write(STATE_KEY, null);
  write(CODE_KEY, null);
  changed();
}

function signedIn(token: string, account: SyncAccount) {
  write(TOKEN_KEY, token);
  write(ACCOUNT_KEY, account);
  write(STATE_KEY, null); // first sync on this device: merge
  changed();
  return syncNow();
}

// ---- account actions (Settings -> Sync & account) --------------------------------------------------------------

export const getConfig = () => call<SyncConfig>("config");

export async function refreshAccount() {
  const a = await call<SyncAccount>("me");
  write(ACCOUNT_KEY, a);
  changed();
  return a;
}

/** New account; returns the recovery code to show once. */
export async function register(username: string, password: string): Promise<string> {
  const r = await call<{ token: string; account: SyncAccount; recoveryCode: string }>("register", { username, password });
  await signedIn(r.token, r.account);
  return r.recoveryCode;
}

export async function login(username: string, password: string) {
  const r = await call<{ token: string; account: SyncAccount }>("login", { username, password });
  await signedIn(r.token, r.account);
}

/** Forgotten password: returns the new recovery code to show once. */
export async function recover(username: string, recoveryCode: string, newPassword: string): Promise<string> {
  const r = await call<{ token: string; account: SyncAccount; recoveryCode: string }>("recover", { username, recoveryCode, newPassword });
  await signedIn(r.token, r.account);
  return r.recoveryCode;
}

/** A sync code: signed in → a code for this account; signed out → a new code-only account. */
export async function newSyncCode(): Promise<string> {
  const r = await call<{ token?: string; account: SyncAccount; code: string }>("code/new", {});
  write(CODE_KEY, r.code);
  if (r.token) await signedIn(r.token, r.account);
  else {
    write(ACCOUNT_KEY, r.account);
    changed();
  }
  return r.code;
}

export async function loginWithCode(code: string) {
  const r = await call<{ token: string; account: SyncAccount }>("code/login", { code });
  await signedIn(r.token, r.account);
  write(CODE_KEY, code.trim().toUpperCase());
}

/** Change the password, or give a code / Discord / Twitch account a username and password. Returns a recovery code
 *  when the account didn't have one yet. */
export async function setPassword(current: string, next: string, username?: string): Promise<string | null> {
  const r = await call<{ account: SyncAccount; recoveryCode?: string }>("password", { current, new: next, username: username || "" });
  write(ACCOUNT_KEY, r.account);
  changed();
  return r.recoveryCode || null;
}

/** A one-time sign-in link for the QR code (works once, for `expires` seconds). */
export async function newSignInLink(): Promise<{ url: string; expires: number }> {
  const r = await call<{ token: string; expires: number }>("link/new", {});
  return { url: `${WEB_APP_URL}#link=${r.token}`, expires: r.expires };
}

export async function newRecoveryCode(password: string): Promise<string> {
  return (await call<{ recoveryCode: string }>("recovery/new", { password })).recoveryCode;
}

export async function unlink(method: "discord" | "twitch" | "code") {
  const r = await call<{ account: SyncAccount }>("unlink", { method });
  if (method === "code") write(CODE_KEY, null);
  write(ACCOUNT_KEY, r.account);
  changed();
}

export async function signOut(everywhere = false) {
  try {
    await call(`logout${everywhere ? "?all=1" : ""}`, {});
  } finally {
    forget();
  }
}

export async function deleteAccount(password: string) {
  await call("delete", { password });
  forget();
}

/** The account's synced data as a JSON file. */
export async function exportData(): Promise<Blob> {
  const r = await call<unknown>("export");
  return new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
}

/**
 * Discord / Twitch: the website goes to the provider and comes back with #signin=...; the Windows app opens the
 * provider in the browser (openUrl) and waits here until the person has signed in there.
 * Signed in already = add that sign-in method to the account.
 */
export async function oauthSignIn(provider: "discord" | "twitch", openUrl?: (url: string) => void): Promise<void> {
  const r = await call<{ url: string; poll: string }>(`auth/${provider}/start`, { mode: IS_WEB ? "web" : "app" });
  if (IS_WEB || !openUrl) {
    window.location.href = r.url;
    return new Promise(() => {}); // the page is leaving
  }
  openUrl(r.url);
  const until = Date.now() + 10 * 60 * 1000;
  while (Date.now() < until) {
    await new Promise((res) => setTimeout(res, 2000));
    let p: { pending?: boolean; token?: string; account?: SyncAccount };
    try {
      p = await call<{ pending?: boolean; token?: string; account?: SyncAccount }>(`auth/poll?id=${encodeURIComponent(r.poll)}`);
    } catch (e) {
      if ((e as Error).message === "offline") continue;
      throw e;
    }
    if (p.pending) continue;
    if (p.token && p.account) await signedIn(p.token, p.account);
    else if (p.account) {
      write(ACCOUNT_KEY, p.account);
      changed();
    }
    return;
  }
  throw new SyncError("expired");
}

// ── Pick'Em leaderboard (server/sync/pickem.go): the Worlds picks, scored against Riot's results ──

/** One pick: the stage, its round, the two teams (stats slugs, with Riot's code and name for matching) and the winner picked. */
export interface PickemPick {
  s: "swiss" | "ko";
  r: number;
  a: string;
  b: string;
  w: string;
}
export interface PickemTeam {
  u: string;
  c: string;
  n: string;
}
export interface PickemRow {
  rank: number;
  name: string;
  score: number;
  right: number;
  scored: number;
  me?: boolean;
}
export interface PickemBoard {
  event: string;
  players: number;
  results: number;
  rows: PickemRow[];
  me?: PickemRow | null;
}

/** Enters (or updates) the signed-in account's picks for an event; the board comes back. */
export const submitPickem = (event: string, picks: PickemPick[], teams: PickemTeam[]) =>
  call<PickemBoard>("pickem/submit", { event, picks, teams });
/** The leaderboard (no sign-in needed; the caller's own row is marked when signed in). */
export const pickemBoard = (event: string) => call<PickemBoard>(`pickem/board?event=${encodeURIComponent(event)}`);
/** Leaves the leaderboard (the account's picks for that event are deleted). */
export const leavePickem = (event: string) => call<{ ok: boolean }>("pickem/leave", { event });
