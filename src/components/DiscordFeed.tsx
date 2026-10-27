/**
 * "RiftWise in your Discord": a server admin pastes a channel's webhook address and picks what to get (results as
 * matches end, all-time records, the daily odds card). The push service posts there (server/push/discord.go): no bot
 * to invite, no account. A welcome message must reach the channel before it's saved. Web version only (same site).
 */
import React, { useState } from "react";
import { MessageSquare } from "lucide-react";
import { tl, tk } from "../i18n";

const ERRORS: Record<string, string> = {
  not_a_webhook: tk("That isn't a Discord webhook address (it starts with https://discord.com/api/webhooks/)."),
  webhook_refused: tk("Discord didn't take a message on that webhook. Check it still exists."),
  nothing_chosen: tk("Pick at least one thing to post."),
};

export const DiscordFeed: React.FC = () => {
  const [url, setUrl] = useState("");
  const [opts, setOpts] = useState({ results: true, records: true, daily: true });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const call = async (path: string, body: object) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/push/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, ...j } as { ok: boolean; error?: string; removed?: boolean; new?: boolean };
    } catch {
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    const r = await call("discord", { url, ...opts });
    setNote(
      r.ok
        ? { ok: true, text: r.new ? tl("Done: a welcome message is in the channel.") : tl("Saved: that channel now gets what you picked.") }
        : { ok: false, text: tl(ERRORS[r.error || ""] || "That didn't work. Try again in a minute.") },
    );
  };
  const remove = async () => {
    const r = await call("discord/remove", { url });
    setNote(r.ok ? { ok: true, text: r.removed ? tl("Removed: nothing more will be posted there.") : tl("That webhook wasn't set up.") } : { ok: false, text: tl("That didn't work. Try again in a minute.") });
  };
  const box = (key: keyof typeof opts, label: string) => (
    <label className="inline-flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" checked={opts[key]} onChange={(e) => setOpts({ ...opts, [key]: e.target.checked })} className="accent-[var(--rw-accent)]" />
      {label}
    </label>
  );
  const btn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-8 rounded border border-rw-border bg-rw-bg text-rw-text hover:border-rw-accent text-[11px] disabled:opacity-50";
  return (
    <div className="p-3 rounded-lg bg-rw-surface border border-rw-border space-y-2">
      <div className="flex items-center gap-2 font-bold text-rw-accent uppercase tracking-wider text-[11px]">
        <MessageSquare className="w-3.5 h-3.5 text-rw-teal" />
        {tl("RiftWise in your Discord")}
      </div>
      <p className="text-[11px] text-rw-sub">
        {tl("Results, records and the daily odds card, posted in a channel of your server. In Discord: Edit channel → Integrations → Webhooks → New Webhook → Copy Webhook URL, then paste it here.")}
      </p>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://discord.com/api/webhooks/…"
        aria-label={tl("Discord webhook address")}
        className="w-full bg-rw-bg border border-rw-border rounded px-2 py-1.5 text-xs text-rw-text"
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-rw-sub">
        {box("results", tl("Results"))}
        {box("records", tl("Records"))}
        {box("daily", tl("Daily odds card"))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={add} disabled={busy || !url.trim()}>
          {tl("Post to this channel")}
        </button>
        <button type="button" className={btn} onClick={remove} disabled={busy || !url.trim()}>
          {tl("Stop posting there")}
        </button>
      </div>
      {note && <p className={`text-[11px] ${note.ok ? "text-rw-teal" : "text-rw-red"}`}>{note.text}</p>}
    </div>
  );
};
