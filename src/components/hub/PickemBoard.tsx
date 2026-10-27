/**
 * The Worlds Pick'Em leaderboard: everyone's picks scored against Riot's results (server/sync/pickem.go). Entering
 * needs a sync account (Settings → Sync), because a score needs a name and a way back in. Only picks for matches
 * not yet played count, and a pick can't change once its match is done: the server stamps each one.
 */
import React, { useEffect, useState } from "react";
import { LogIn, Trophy, UserMinus, Upload } from "lucide-react";
import { tl, tn } from "../../i18n";
import { pickemBoard, submitPickem, leavePickem, syncAccount, SYNC_EVENT, SyncError, type PickemBoard as Board, type PickemPick, type PickemTeam } from "../../sync";
import { Section } from "./ui";
import { OPEN_TAB_EVENT } from "../../a11y";

const btn =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50 disabled:opacity-50";

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

  const rows = board?.rows || [];
  const me = board?.me;
  return (
    <Section
      title={tl("Pick'Em leaderboard")}
      id="leaderboard"
      right={
        signedIn ? (
          <span className="flex items-center gap-1.5">
            <button type="button" className={btn} onClick={enter} disabled={busy || !picks.length} title={!picks.length ? tl("Pick some matches first") : undefined}>
              <Upload className="w-3.5 h-3.5" />
              {me ? tl("Update my picks") : tl("Enter my picks")}
            </button>
            {me && (
              <button type="button" className={btn} onClick={leave} disabled={busy} aria-label={tl("Leave the leaderboard")}>
                <UserMinus className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ) : (
          <button type="button" className={btn} onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: "settings" }))}>
            <LogIn className="w-3.5 h-3.5" />
            {tl("Sign in to enter")}
          </button>
        )
      }
    >
      <p className="text-[11px] text-rw-muted">
        {tl("{event}: your Swiss and bracket picks against the results, scored for everyone who entered. 1 point per Swiss series, 2 per quarterfinal, 3 per semifinal, 4 for the final. Your sync username is shown.", { event: name })}
      </p>
      {note && <p className="text-xs text-rw-teal">{note}</p>}
      {board && (
        <p className="text-xs text-rw-sub">
          {tn("{n} player entered", "{n} players entered", board.players)} · {tn("{n} series decided", "{n} series decided", board.results)}
        </p>
      )}
      {rows.length > 0 ? (
        <ol className="text-xs divide-y divide-rw-border border border-rw-border rounded-lg">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={`flex items-center gap-3 px-3 py-1.5 ${r.me ? "bg-rw-accent/10" : ""}`}>
              <span className="w-6 text-rw-muted font-num tabular-nums text-right">{r.rank}</span>
              {r.rank === 1 && <Trophy className="w-3.5 h-3.5 text-rw-accent shrink-0" />}
              <span className={`flex-1 min-w-0 truncate ${r.me ? "font-bold text-rw-text" : "text-rw-text"}`}>{r.name}</span>
              <span className="text-[11px] text-rw-muted font-num tabular-nums">
                {r.right}/{r.scored}
              </span>
              <span className="font-num tabular-nums font-bold text-rw-accent w-10 text-right">{r.score}</span>
            </li>
          ))}
          {me && !rows.some((r) => r.me) && (
            <li className="flex items-center gap-3 px-3 py-1.5 bg-rw-accent/10">
              <span className="w-6 text-rw-muted font-num tabular-nums text-right">{me.rank}</span>
              <span className="flex-1 min-w-0 truncate font-bold text-rw-text">{me.name}</span>
              <span className="text-[11px] text-rw-muted font-num tabular-nums">
                {me.right}/{me.scored}
              </span>
              <span className="font-num tabular-nums font-bold text-rw-accent w-10 text-right">{me.score}</span>
            </li>
          )}
        </ol>
      ) : (
        board && <p className="text-xs text-rw-sub">{tl("Nobody has entered yet. Be the first.")}</p>
      )}
    </Section>
  );
};
