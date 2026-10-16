// Phone and browser alerts for the web version (Web Push). The service worker (web/sw.js) shows them;
// riftwise-push on HomeServer sends them. The server keeps only this browser's push address, the team
// codes it follows, its language and which alerts are on.
import { AppSettings } from "./types";
import { currentLang } from "./i18n";
import { IS_WEB } from "./platform";

const API = "/riftwise/api/push";
const ON_KEY = "riftwatch_push"; // "1" once this browser asked for alerts
const SCOPE = "/riftwise/";

export type PushStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on";

const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInstalled = (): boolean =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function supported(): boolean {
  return IS_WEB && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  return (await navigator.serviceWorker.getRegistration(SCOPE)) ?? navigator.serviceWorker.register("/riftwise/sw.js", { scope: SCOPE });
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!IS_WEB) return "unsupported";
  // iPhone/iPad only allow alerts for sites added to the home screen and opened from there
  if (isIOS() && !isInstalled()) return "needs-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (localStorage.getItem(ON_KEY) !== "1" || Notification.permission !== "granted") return "off";
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function requestBody(sub: PushSubscription, s: AppSettings) {
  const j = sub.toJSON();
  return {
    endpoint: j.endpoint,
    keys: j.keys,
    teams: s.followedTeams,
    lang: currentLang(),
    kickoff: s.notifyKickoff,
    pregame: s.notifyPregame,
    banger: s.notifyStream,
  };
}

async function post(path: string, data: unknown): Promise<unknown> {
  const r = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`alerts ${path}: HTTP ${r.status}`);
  return r.json();
}

// The service worker re-subscribes by itself if the browser rotates its push address (sw.js).
async function saveForWorker(data: object, publicKey: string): Promise<void> {
  try {
    const cache = await caches.open("riftwatch-push");
    await cache.put("/riftwise/push-state", new Response(JSON.stringify({ ...data, publicKey })));
  } catch {
    /* only a fallback */
  }
}

async function savedEndpoint(): Promise<string | undefined> {
  try {
    const r = await (await caches.open("riftwatch-push")).match("/riftwise/push-state");
    return r ? ((await r.json()) as { endpoint?: string }).endpoint : undefined;
  } catch {
    return undefined;
  }
}

async function subscribeAndSend(s: AppSettings): Promise<void> {
  const reg = await registration();
  if (!reg) throw new Error("no service worker");
  const { publicKey } = (await (await fetch(`${API}/key`)).json()) as { publicKey: string };
  const key = b64ToBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Subscribed with another server key (key rotated): start over
    const cur = sub.options.applicationServerKey;
    if (cur && new Uint8Array(cur).join() !== key.join()) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const data = requestBody(sub, s);
  await post("subscribe", data);
  await saveForWorker(data, publicKey);
}

/** Asks for permission (must run from a tap/click) and signs this browser up. */
export async function enablePush(s: AppSettings): Promise<PushStatus> {
  if (!supported()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  await subscribeAndSend(s);
  localStorage.setItem(ON_KEY, "1");
  window.dispatchEvent(new Event("riftwatch_push_changed"));
  return "on";
}

export async function disablePush(): Promise<void> {
  localStorage.removeItem(ON_KEY);
  const sub = await (await registration())?.pushManager.getSubscription();
  // The browser may already have dropped its subscription (e.g. notifications were blocked in its
  // settings); the server still gets told to forget the address saved last time.
  const saved = await savedEndpoint();
  for (const endpoint of new Set([sub?.endpoint, saved].filter(Boolean) as string[])) {
    await post("unsubscribe", { endpoint }).catch(() => {});
  }
  if (sub) await sub.unsubscribe().catch(() => {});
  await caches.delete("riftwatch-push").catch(() => {});
  window.dispatchEvent(new Event("riftwatch_push_changed"));
}

/** Sends the current follows and alert choices to the server (called when they change). */
export async function syncPush(s: AppSettings): Promise<void> {
  if (!supported() || localStorage.getItem(ON_KEY) !== "1" || Notification.permission !== "granted") return;
  await subscribeAndSend(s);
}

export async function sendTestPush(): Promise<boolean> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return false;
  const r = (await post("test", { endpoint: sub.endpoint })) as { ok?: boolean };
  return !!r.ok;
}
