/**
 * The Worlds Pick'Em leaderboard: everyone's picks scored against Riot's results (server/sync/pickem.go). Entering
 * needs a sync account (Settings → Sync), because a score needs a name and a way back in. Only picks for matches
 * not yet played count, and a pick can't change once its match is done: the server stamps each one. An entrant can
 * hide their name: the row and score stay, shown as a hidden player to everyone else.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, EyeOff, LogIn, Plus, Trophy, Upload, UserMinus, Users } from "lucide-react";
import { tl, tn } from "../../i18n";
import {
  pickemBoard,
  submitPickem,
  leavePickem,
  hidePickem,
  fetchPickemGroups,
  createPickemGroup,
  joinPickemGroup,
  leavePickemGroup,
  syncAccount,
  SYNC_EVENT,
  SyncError,
  type PickemBoard as Board,
  type PickemGroupSummary,
  type PickemPick,
  type PickemRow,
  type PickemTeam,
} from "../../sync";
import { normText, resolveLeagueSlug, searchAlias } from "../../hub/data";
import { BASE, currentHubRoute } from "../../hub/route";
import { Section, HubLink } from "./ui";
import { BroadcastCardButton, listCard } from "./BroadcastCard";

const LazySyncPanel = React.lazy(() => import("../SyncPanel").then((m) => ({ default: m.SyncPanel })));

const btn =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50 disabled:opacity-50";

const GROUP_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

const readGroupParam = (q?: string) => {
  const raw = (new URLSearchParams(q ?? (typeof window !== "undefined" ? window.location.search : "")).get("group") || "").trim().toUpperCase();
  return GROUP_CODE_RE.test(raw) ? raw : "";
};

const setUrlGroupParam = (code: string) => {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const u = new URL(window.location.href);
  if (code) u.searchParams.set("group", code);
  else u.searchParams.delete("group");
  window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
};

const shownName = (r: PickemRow) => r.name || tl("Hidden player");

export const PickemBoard: React.FC<{
  event: string;
  name: string;
  picks: PickemPick[];
  teams: PickemTeam[];
  scoringNote?: string;
  onServerPicks?: (picks: PickemPick[]) => void;
}> = ({ event, name, picks, teams, scoringNote, onServerPicks }) => {
  const nowRoute = currentHubRoute();
  const routeQuery = "query" in nowRoute ? nowRoute.query : undefined;
  const [board, setBoard] = useState<Board | null>(null);
  const [signedIn, setSignedIn] = useState(() => !!syncAccount());
  const [showSignIn, setShowSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState(() => readGroupParam(routeQuery));
  const [groups, setGroups] = useState<PickemGroupSummary[]>([]);
  const [groupMode, setGroupMode] = useState<"none" | "create" | "join">("none");
  const [groupInput, setGroupInput] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const onServerPicksRef = useRef(onServerPicks);
  onServerPicksRef.current = onServerPicks;

  useEffect(() => {
    const qGroup = readGroupParam(routeQuery);
    if (qGroup) setActiveGroup((prev) => (prev === qGroup ? prev : qGroup));
  }, [routeQuery]);

  const selectGroup = (code: string) => {
    const clean = code && GROUP_CODE_RE.test(code) ? code : "";
    setGroupError(null);
    setActiveGroup(clean);
    setUrlGroupParam(clean);
  };

  const refresh = (groupOverride?: string) => {
    const grp = groupOverride !== undefined ? groupOverride : activeGroup;
    return pickemBoard(event, grp || undefined)
      .then((b) => {
        setBoard(b);
        setGroupError(null);
        if (b.myPicks) onServerPicksRef.current?.(b.myPicks);
      })
      .catch((e) => {
        if (grp && e instanceof SyncError && (e.message === "group_not_found" || e.message === "bad_group")) {
          setBoard(null);
          setGroupError(tl("Friends league not found."));
        }
      });
  };

  const refreshGroups = () => {
    if (!syncAccount()) {
      setGroups([]);
      return Promise.resolve();
    }
    return fetchPickemGroups()
      .then((r) => setGroups(r.groups || []))
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    refreshGroups();
    const onSync = () => {
      const ok = !!syncAccount();
      setSignedIn(ok);
      if (ok) setShowSignIn(false);
      refresh();
      refreshGroups();
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, activeGroup]);

  const enter = async () => {
    setBusy(true);
    setNote(null);
    try {
      const b = await submitPickem(event, picks, teams, activeGroup || undefined);
      setBoard(b);
      if (b.myPicks) onServerPicksRef.current?.(b.myPicks);
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
      setBoard(await hidePickem(event, on, activeGroup || undefined));
    } catch {
      setNote(tl("That didn't work. Try again in a minute."));
    }
    setBusy(false);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = groupInput.trim();
    if (!clean) return;
    setBusy(true);
    setGroupError(null);
    try {
      const res = await createPickemGroup(clean);
      setGroups(res.groups || []);
      setGroupMode("none");
      setGroupInput("");
      selectGroup(res.group.code);
    } catch (err) {
      setGroupError(
        err instanceof SyncError && err.message === "too_many_groups"
          ? tl("You can join at most 12 friends leagues.")
          : tl("That didn't work. Try again in a minute."),
      );
    }
    setBusy(false);
  };

  const handleJoinGroup = async (codeRaw: string) => {
    const clean = codeRaw.trim().toUpperCase();
    if (!GROUP_CODE_RE.test(clean)) {
      setGroupError(tl("Enter a valid 6-character invite code."));
      return;
    }
    setBusy(true);
    setGroupError(null);
    try {
      const res = await joinPickemGroup(clean);
      setGroups(res.groups || []);
      setGroupMode("none");
      setGroupInput("");
      if (activeGroup === res.group.code) {
        await refresh(res.group.code);
      } else {
        selectGroup(res.group.code);
      }
    } catch (err) {
      setGroupError(
        err instanceof SyncError && err.message === "group_not_found"
          ? tl("Friends league not found.")
          : err instanceof SyncError && err.message === "group_full"
            ? tl("This friends league is full.")
            : err instanceof SyncError && err.message === "too_many_groups"
              ? tl("You can join at most 12 friends leagues.")
              : tl("That didn't work. Try again in a minute."),
      );
    }
    setBusy(false);
  };

  const handleLeaveGroup = async (code: string) => {
    if (!window.confirm(tl("Leave this friends league? Your picks stay on the global board."))) return;
    setBusy(true);
    setGroupError(null);
    try {
      const res = await leavePickemGroup(code);
      setGroups(res.groups || []);
      selectGroup("");
    } catch {
      setGroupError(tl("That didn't work. Try again in a minute."));
    }
    setBusy(false);
  };

  const copyInviteLink = async (code: string) => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    u.searchParams.set("group", code);
    try {
      await navigator.clipboard?.writeText(u.toString());
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      setGroupError(u.toString());
    }
  };

  const rows = board?.rows || [];
  const bare = (s: string) => normText(s).replace(/[^a-z0-9\u00c0-\uffff]/g, "");
  const rawUrlSearch = useMemo(() => {
    const p = new URLSearchParams(routeQuery ?? (typeof window !== "undefined" ? window.location.search : ""));
    return p.get("q") || p.get("player") || p.get("name") || "";
  }, [routeQuery]);
  const effectiveUrlSearch = useMemo(() => {
    if (!rawUrlSearch.trim() || !rows.length) return "";
    const terms = rawUrlSearch
      .trim()
      .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
      .map((s) => normText(searchAlias(s.trim())))
      .filter(Boolean);
    const matchingTerms = terms.filter((t) => {
      const tBare = bare(t);
      return rows.some((r) => {
        const hay = normText(shownName(r));
        return hay.includes(t) || (tBare.length >= 2 && bare(hay).includes(tBare));
      });
    });
    return matchingTerms.join(",");
  }, [rawUrlSearch, rows]);
  const userTypedRef = useRef(false);
  const lastUrlSearchRef = useRef(rawUrlSearch);
  const [search, setSearch] = useState(() => effectiveUrlSearch);
  useEffect(() => {
    if (lastUrlSearchRef.current !== rawUrlSearch) {
      lastUrlSearchRef.current = rawUrlSearch;
      userTypedRef.current = false;
    }
    if (!userTypedRef.current) {
      setSearch(effectiveUrlSearch);
    }
  }, [rawUrlSearch, effectiveUrlSearch]);
  const qTerms = search
    .trim()
    .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
    .map((s) => normText(searchAlias(s.trim())))
    .filter(Boolean);
  const filteredRows = qTerms.length
    ? rows.filter((r) => {
        const hay = normText(shownName(r));
        const hayBare = bare(hay);
        return qTerms.some((q) => {
          const qBare = bare(q);
          return hay.includes(q) || (qBare.length >= 2 && hayBare.includes(qBare));
        });
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
          {(() => {
            const pickSlugs = Array.from(
              new Set(
                [
                  ...picks
                    .slice()
                    .reverse()
                    .flatMap((p) => [p.w, p.a, p.b]),
                  ...teams.map((t) => t.u),
                ].filter(Boolean),
              ),
            );
            const t0 = pickSlugs[0];
            const t1 = pickSlugs.find((u) => u && u !== t0);
            const evYr = /\b(20\d{2})\b/.exec(event)?.[1];
            const isSeason = event.startsWith("season-");
            const evBase = event.replace(/-\d{4}$/, "");
            const evLg = isSeason
              ? undefined
              : evBase === "worlds"
                ? "world-championship"
                : evBase === "msi"
                  ? "mid-season-invitational"
                  : evBase === "first-stand"
                    ? "first-stand"
                    : resolveLeagueSlug(evBase);
            const showEventLink = evBase === "worlds" || evBase === "msi" || evBase === "first-stand";
            const period = showEventLink ? `e:${event}` : evYr ? `y${evYr}` : "all";
            return (
              <>
                {showEventLink ? (
                  <HubLink
                    to={{
                      kind: "event",
                      slug: event,
                      ...(t0 ? { query: `q=${encodeURIComponent([t0, t1].filter(Boolean).join(","))}` } : {}),
                    }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("Tournament")} →
                  </HubLink>
                ) : evLg ? (
                  <HubLink
                    to={{
                      kind: "league",
                      slug: evLg,
                      ...(evYr ? { year: evYr } : {}),
                    }}
                    className="text-[11px] font-semibold text-rw-accent hover:underline"
                    data-nocapture="1"
                  >
                    {tl("League")} →
                  </HubLink>
                ) : null}
                {t0 && (
                  <>
                    <HubLink
                      to={{ kind: "prep", a: t0, ...(t1 ? { b: t1 } : {}), period }}
                      className="text-[11px] font-semibold text-rw-accent hover:underline"
                      data-nocapture="1"
                    >
                      {tl("Match prep")} →
                    </HubLink>
                    <HubLink
                      to={{
                        kind: "draft",
                        query: `teams=${encodeURIComponent(t0)}${t1 ? `,${encodeURIComponent(t1)}` : ""}&p=${encodeURIComponent(period)}`,
                      }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                      data-nocapture="1"
                    >
                      {tl("Draft board")} →
                    </HubLink>
                    <HubLink
                      to={{ kind: "compare", mode: "team", a: t0, ...(t1 ? { b: t1 } : {}), period }}
                      className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                      data-nocapture="1"
                    >
                      {tl("Compare")} →
                    </HubLink>
                  </>
                )}
                <HubLink
                  to={{
                    kind: "items",
                    query: new URLSearchParams({
                      ...(showEventLink ? { event } : {}),
                      ...(evLg ? { league: evLg } : {}),
                      ...(evYr ? { year: evYr } : {}),
                      ...(t0 ? { team: t0 } : {}),
                      ...(t1 ? { vs: t1 } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Item history")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "finder",
                    query: new URLSearchParams({
                      ...(showEventLink ? { event } : {}),
                      ...(evLg ? { league: evLg } : {}),
                      ...(evYr ? { year: evYr } : {}),
                      ...(t0 ? { team: t0 } : {}),
                      ...(t1 ? { vs: t1 } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Game finder")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "rankings",
                    query:
                      new URLSearchParams({
                        ...(evLg ? { league: evLg } : {}),
                        ...(t0 ? { q: `${t0}${t1 ? `,${t1}` : ""}` } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Power rankings")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tournaments",
                    ...(evYr || evLg
                      ? {
                          query: new URLSearchParams({
                            ...(evLg ? { league: evLg } : {}),
                            ...(evYr ? { year: evYr } : {}),
                          }).toString(),
                        }
                      : {}),
                  }}
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
                        ...(showEventLink ? { event } : {}),
                        ...(t0 ? { q: `${t0}${t1 ? `,${t1}` : ""}` } : {}),
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
                      ...(showEventLink ? { event } : {}),
                      ...(t0 ? { q: `${t0}${t1 ? `,${t1}` : ""}` } : {}),
                    }).toString(),
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Player leaderboards")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "champions",
                    query:
                      new URLSearchParams({
                        ...(evLg ? { scope: evLg, league: evLg } : {}),
                        ...(showEventLink ? { event } : {}),
                        ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
                      }).toString() || undefined,
                  }}
                  className="text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                  data-nocapture="1"
                >
                  {tl("Champions")} →
                </HubLink>
                <HubLink
                  to={{
                    kind: "tiers",
                    query:
                      new URLSearchParams({
                        ...(evLg ? { scope: evLg, league: evLg } : {}),
                        ...(showEventLink ? { event } : {}),
                        ...(evYr ? { key: `y${evYr}`, year: evYr } : {}),
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
          {(rows.length > 8 || Boolean(search.trim())) && (
            <input
              type="search"
              value={search}
              onChange={(e) => {
                userTypedRef.current = true;
                setSearch(e.target.value);
              }}
              placeholder={tl("Filter by name or team…")}
              aria-label={tl("Filter by name or team…")}
              data-nocapture="1"
              className="bg-rw-bg border border-rw-border rounded-md px-2 py-0.5 text-[11px] text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-36"
            />
          )}
          <a
            href={`${BASE}embed?studio=1&mode=pickem&event=${encodeURIComponent(event)}${activeGroup ? `&group=${encodeURIComponent(activeGroup)}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-rw-accent hover:underline"
            data-nocapture="1"
          >
            {tl("Embed / OBS")} →
          </a>
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
            <button type="button" className={btn} aria-expanded={showSignIn} onClick={() => setShowSignIn((v) => !v)}>
              <LogIn className="w-3.5 h-3.5" />
              {tl("Sign in to enter")}
            </button>
          )}
        </span>
      }
    >
      <p className="text-[11px] text-rw-muted">
        {scoringNote ||
          tl("{event}: your Swiss and bracket picks against the results, scored for everyone who entered. 1 point per Swiss series, 2 per quarterfinal, 3 per semifinal, 4 for the final. Your sync username is shown.", {
            event: name,
          })}
      </p>
      <div className="flex flex-wrap items-center gap-1.5" data-nocapture="1">
        <button
          type="button"
          onClick={() => selectGroup("")}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
            !activeGroup ? "bg-rw-accent/15 text-rw-accent border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
          }`}
        >
          {tl("Global")}
        </button>
        {groups.map((g) => (
          <button
            key={g.code}
            type="button"
            onClick={() => selectGroup(g.code)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
              activeGroup === g.code ? "bg-rw-accent/15 text-rw-accent border-rw-accent" : "border-rw-border text-rw-sub hover:text-rw-text"
            }`}
          >
            <Users className="w-3 h-3" />
            {g.name} <span className="font-num text-rw-muted">({g.members})</span>
          </button>
        ))}
        {activeGroup && !groups.some((g) => g.code === activeGroup) && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border bg-rw-accent/15 text-rw-accent border-rw-accent">
            <Users className="w-3 h-3" />
            {board?.group?.name || activeGroup}
          </span>
        )}
        {signedIn ? (
          <>
            <button
              type="button"
              onClick={() => {
                setGroupMode((m) => (m === "create" ? "none" : "create"));
                setGroupInput("");
                setGroupError(null);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
            >
              <Plus className="w-3 h-3" />
              {tl("Create friends league")}
            </button>
            <button
              type="button"
              onClick={() => {
                setGroupMode((m) => (m === "join" ? "none" : "join"));
                setGroupInput("");
                setGroupError(null);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-rw-border text-rw-sub hover:text-rw-text hover:border-rw-accent/50"
            >
              {tl("Join code")}
            </button>
          </>
        ) : (
          <span className="text-[11px] text-rw-muted">{tl("Sign in to create or join a friends league.")}</span>
        )}
      </div>
      {signedIn && groupMode === "create" && (
        <form onSubmit={handleCreateGroup} className="flex flex-wrap items-center gap-2" data-nocapture="1">
          <input
            type="text"
            value={groupInput}
            maxLength={40}
            onChange={(e) => setGroupInput(e.target.value)}
            placeholder={tl("League name")}
            aria-label={tl("League name")}
            className="bg-rw-bg border border-rw-border rounded-md px-2.5 py-1 text-xs text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-52"
          />
          <button type="submit" disabled={busy || !groupInput.trim()} className={btn}>
            {tl("Create")}
          </button>
        </form>
      )}
      {signedIn && groupMode === "join" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoinGroup(groupInput);
          }}
          className="flex flex-wrap items-center gap-2"
          data-nocapture="1"
        >
          <input
            type="text"
            value={groupInput}
            maxLength={6}
            onChange={(e) => setGroupInput(e.target.value.toUpperCase())}
            placeholder={tl("6-letter invite code")}
            aria-label={tl("6-letter invite code")}
            className="bg-rw-bg border border-rw-border rounded-md px-2.5 py-1 text-xs font-num uppercase tracking-wider text-rw-text placeholder:text-rw-muted focus:border-rw-accent focus:outline-none w-44"
          />
          <button type="submit" disabled={busy || groupInput.trim().length < 6} className={btn}>
            {tl("Join")}
          </button>
        </form>
      )}
      {activeGroup && board?.group && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-rw-border/80 bg-rw-bg/60 text-xs" data-nocapture="1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-rw-text">{board.group.name}</span>
            <span className="font-num px-1.5 py-0.5 rounded bg-rw-panel border border-rw-border text-[11px] text-rw-accent">{board.group.code}</span>
            <span className="text-[11px] text-rw-muted">{tn("{n} member", "{n} members", board.group.members)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => copyInviteLink(board.group!.code)} className={btn}>
              {copiedInvite ? <Check className="w-3.5 h-3.5 text-rw-teal" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedInvite ? tl("Copied") : tl("Copy link")}
            </button>
            {!board.group.joined ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => (signedIn ? handleJoinGroup(board.group!.code) : setShowSignIn(true))}
                className={btn}
              >
                {tl("Join league")}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => handleLeaveGroup(board.group!.code)} className={btn}>
                {tl("Leave league")}
              </button>
            )}
          </div>
        </div>
      )}
      {groupError && <p className="text-xs text-rw-red">{groupError}</p>}
      {!signedIn && showSignIn && (
        <div className="my-2 rounded-lg border border-rw-border bg-rw-card/60 p-3">
          <React.Suspense fallback={null}>
            <LazySyncPanel onOpenUrl={(u) => window.open(u, "_blank", "noopener,noreferrer")} />
          </React.Suspense>
        </div>
      )}
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
              {me && !filteredRows.some((r) => r.me) && (qTerms.length === 0 || qTerms.some((q) => { const qBare = bare(q); return normText(shownName(me)).includes(q) || (qBare.length >= 2 && bare(shownName(me)).includes(qBare)); })) && renderRow(me, "me", true)}
            </ol>
          );
        })()
      ) : (
        board && <p className="text-xs text-rw-sub">{tl("Nobody has entered yet. Be the first.")}</p>
      )}
    </Section>
  );
};
