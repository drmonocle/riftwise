/**
 * The Worlds Pick'Em leaderboard: everyone's picks scored against Riot's results (server/sync/pickem.go). Entering
 * needs a sync account (Settings → Sync), because a score needs a name and a way back in. Only picks for matches
 * not yet played count, and a pick can't change once its match is done: the server stamps each one. An entrant can
 * hide their name: the row and score stay, shown as a hidden player to everyone else.
 */
import React, { useEffect, useState } from "react";
import { EyeOff, LogIn, Trophy, UserMinus, Upload } from "lucide-react";
import { tl, tn } from "../../i18n";
import { pickemBoard, submitPickem, leavePickem, hidePickem, syncAccount, SYNC_EVENT, SyncError, type PickemBoard as Board, type PickemPick, type PickemRow, type PickemTeam } from "../../sync";
import { normText } from "../../hub/data";
import { Section, HubLink } from "./ui";
import { BroadcastCardButton, listCard } from "./BroadcastCard";
import { OPEN_TAB_EVENT } from "../../a11y";

const btn =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50 disabled:opacity-50";

const shownName = (r: PickemRow) => r.name || tl("Hidden player");

export const PickemBoard: React.FC<{
  event: string;
  name: string;
  picks: PickemPick[];
  teams: PickemTeam[];
}> = ({ event, name, picks, teams }) => {
  const [board, setBoard] = useState<Board | null>(null);
  const [signedIn, setSignedIn] = useState(() => !!syncAccount());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => pickemBoard(event).then(setBoard).catch(() => {});
  useEffect(() => {
    refresh();
    const onSync = () => {
      setSignedIn(!!syncAccount());
      refresh();
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  const enter = async () => {
    setBusy(true);
    setNote(null);
    try {
      setBoard(await submitPickem(event, picks, teams));
      setNote(tl("Your picks are in. Matches already played don't count, and a pick is locked once its match is done."));
    } catch (e) {
      setNote(e instanceof SyncError && e.message === "not_signed_in" ? tl("Sign in under Settings → Sync first.") : tl("That didn't work. Try again in a minute."));
    }
    setBusy(false);
  };
  const leave = async () => {
    if (!window.confirm(tl("Leave the leaderboard? Your entered picks are deleted."))) return;
    setBusy(true);
    try {
      await leavePickem(event);
      await refresh();
      setNote(null);
    } catch {
      setNote(tl("That didn't work. Try again in a minute."));
    }
    setBusy(false);
  };
  const hide = async (on: boolean) => {
    setBusy(true);
    try {
      setBoard(await hidePickem(event, on));
    } catch {
      setNote(tl("That didn't work. Try again in a minute."));
    }
    setBusy(false);
  };

  const [search, setSearch] = useState("");
  const rows = board?.rows || [];
  const bare = (s: string) => normText(s).replace(/[^a-z0-9\u00c0-\uffff]/g, "");
  const q = normText(search.trim());
  const qBare = bare(q);
  const filteredRows = q
    ? rows.filter((r) => {
        const hay = normText(shownName(r));
        return hay.includes(q) || (qBare.length >= 2 && bare(hay).includes(qBare));
      })
    : rows;
  const me = board?.me;
  const sub = board ? `${tn("{n} player entered", "{n} players entered", board.players)} · ${tn("{n} series decided", "{n} series decided", board.results)}` : "";
  return (
    <Section
      title={tl("Pick'Em leaderboard")}
      id="leaderboard"
      right={
        <span className="flex flex-wrap items-center gap-1.5">
          {teams.length >= 1 && (
            <>
              <HubLink
                to={{ kind: "prep", a: teams[0].u, ...(teams[1] ? { b: teams[1].u } : {}), period: `e:${event}` }}
                className="text-[11px] font-semibold text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Match prep")} →
              </HubLink>
              <HubLink
                to={{
                  kind: "draft",
                  query: `teams=${encodeURIComponent(teams[0].u)}${teams[1] ? `,${encodeURIComponent(teams[1].u)}` : ""}&p=e:${encodeURIComponent(event)}`,
                }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Draft board")} →
              </HubLink>
              <HubLink
                to={{ kind: "compare", mode: "team", a: teams[0].u, ...(teams[1] ? { b: teams[1].u } : {}), period: `e:${event}` }}
                className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                data-nocapture="1"
              >
                {tl("Compare")} →
              </HubLink>
            </>
          )}
          <HubLink
            to={{ kind: "finder", query: `event=${encodeURIComponent(event)}` }}
            className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Game finder")} →
          </HubLink>
          {(() => {
            const evYr = /\b(20\d{2})\b/.exec(event)?.[1];
            const evLg = event.startsWith("msi-")
              ? "mid-season-invitational"
              : event.startsWith("first-stand-")
                ? "first-stand"
                : event.startsWith("worlds-")
                  ? "world-championship"
                  : undefined;
            return (
              <>
                <HubLink
                  to={{
                    kind: "rankings",
                    query:
                      new URLSearchParams({
                        ...(evLg ? { league: evLg } : {}),
                        ...(teams.length >= 1 ? { q: `${teams[0].u}${teams[1] ? `,${teams[1].u}` : ""}` } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{ kind: "tournaments", ...(evYr ? { query: `year=${encodeURIComponent(evYr)}` } : {}) }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Tournaments")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "best",
                    query:
                      new URLSearchParams({
                        ...(evLg ? { league: evLg } : {}),
                        ...(evYr ? { year: evYr } : {}),
                        event,
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Best games")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "leaders",
                    query: new URLSearchParams({
                      ...(evLg ? { league: evLg } : {}),
                      ...(evYr ? { year: evYr } : {}),
                      event,
                      ...(teams.length >= 1 ? { q: `${teams[0].n || teams[0].u}${teams[1] ? `,${teams[1].n || teams[1].u}` : ""}` } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query:
                      new URLSearchParams({
                        ...(evLg ? { league: evLg } : {}),
                        ...(event ? { event, key: `e:${event}` } : evYr ? { key: `y${evYr}` } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Pro tier list")} →
                </HubLink>
              </>
            );
          })()}
          {rows.length > 8 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              data-nocapture="1"
              className="bg-rw-bg border border-rw-border rounded-md px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-36"
            />
          )}
          {rows.length > 0 && (
            <BroadcastCardButton
              compact
              data={() =>
                listCard({
                  section: tl("Pick'Em leaderboard"),
                  name,
                  sub,
                  rows: filteredRows.slice(0, 12).map((r) => ({ label: `${r.rank}. ${shownName(r)}`, sub: `${r.right}/${r.scored}`, value: String(r.score) })),
                })
              }
              name={`${event}-pickem`}
              label={tl("Overview card")}
            />
          )}
          {signedIn ? (
            <>
              <button type="button" className={btn} onClick={enter} disabled={busy || !picks.length} title={!picks.length ? tl("Pick some matches first") : undefined}>
                <Upload className="w-3.5 h-3.5" />
                {me ? tl("Update my picks") : tl("Enter my picks")}
              </button>
              {me && (
                <button type="button" className={btn} onClick={leave} disabled={busy} aria-label={tl("Leave the leaderboard")}>
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <button type="button" className={btn} onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: "settings" }))}>
              <LogIn className="w-3.5 h-3.5" />
              {tl("Sign in to enter")}
            </button>
          )}
        </span>
      }
    >
      <p className="text-[11px] text-rw-muted">
        {tl("{event}: your Swiss and bracket picks against the results, scored for everyone who entered. 1 point per Swiss series, 2 per quarterfinal, 3 per semifinal, 4 for the final. Your sync username is shown.", { event: name })}
      </p>
      {me && (
        <label className="inline-flex items-center gap-2 text-xs text-rw-sub cursor-pointer">
          <input type="checkbox" checked={!!me.hidden} disabled={busy} onChange={(e) => hide(e.target.checked)} className="accent-[var(--rw-accent)]" />
          <EyeOff className="w-3.5 h-3.5" />
          {tl("Hide my name (others see “Hidden player”; your score still counts)")}
        </label>
      )}
      {note && <p className="text-xs text-rw-teal">{note}</p>}
      {board && <p className="text-xs text-rw-sub">{sub}</p>}
      {rows.length > 0 ? (
        (() => {
          const maxScore = Math.max(1, ...rows.map((r) => r.score), me?.score || 0);
          const renderRow = (r: PickemRow, key: React.Key, forceMe?: boolean) => {
            const isMe = forceMe || r.me;
            const accPct = r.scored > 0 ? Math.round((r.right / r.scored) * 100) : 0;
            const scorePct = Math.max(6, Math.round((r.score / maxScore) * 100));
            return (
              <li key={key} className={`flex items-center gap-3 px-3 py-1.5 ${isMe ? "bg-rw-accent/10" : ""}`}>
                <span className="w-6 text-rw-muted font-num tabular-nums text-right">{r.rank}</span>
                {r.rank === 1 && <Trophy className="w-3.5 h-3.5 text-rw-accent shrink-0" />}
                <span className={`flex-1 min-w-0 truncate ${isMe ? "font-bold text-rw-text" : r.name ? "text-rw-text" : "text-rw-muted italic"}`}>
                  {shownName(r)}
                  {isMe && r.hidden && <EyeOff className="w-3 h-3 inline ml-1.5 text-rw-muted" aria-label={tl("Hidden from others")} />}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-rw-muted font-num tabular-nums">
                  <span>
                    {r.right}/{r.scored}
                  </span>
                  {r.scored > 0 && (
                    <span className="hidden sm:inline-block w-10 h-1 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${accPct >= 60 ? "bg-rw-teal/80" : accPct <= 40 ? "bg-rw-red/75" : "bg-rw-sub/60"}`}
                        style={{ width: `${Math.max(6, accPct)}%` }}
                      />
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center justify-end gap-1.5 w-20 text-right">
                  <span className="hidden sm:inline-block w-10 h-1.5 rounded-full bg-rw-border/70 overflow-hidden" aria-hidden="true">
                    <span className="block h-full rounded-full bg-rw-accent/80" style={{ width: `${scorePct}%` }} />
                  </span>
                  <span className="font-num tabular-nums font-bold text-rw-accent w-8 text-right">{r.score}</span>
                </span>
              </li>
            );
          };
          return (
            <ol className="text-xs divide-y divide-rw-border border border-rw-border rounded-lg overflow-hidden">
              {filteredRows.map((r, i) => renderRow(r, i))}
              {me && !filteredRows.some((r) => r.me) && (!q || normText(shownName(me)).includes(q) || (qBare.length >= 2 && bare(shownName(me)).includes(qBare))) && renderRow(me, "me", true)}
            </ol>
          );
        })()
      ) : (
        board && <p className="text-xs text-rw-sub">{tl("Nobody has entered yet. Be the first.")}</p>
      )}
    </Section>
  );
};
