import React, { useState, useMemo } from "react";
import { AppSettings, CatalogData, CatalogTeam, PlayerEntry, League } from "../../types";
import { MAJOR_REGIONS, DEFAULT_FOLLOWED_REGIONS, POPULAR_PLAYERS, GLOBAL_LEAGUES } from "../../api";
import { Search, Check, Plus, X, Globe, User, Shield, Trophy, RefreshCw } from "lucide-react";
import { tl, tn, regionName, roleName } from "../../i18n";
import { IS_WEB } from "../../platform";
import { PushAlertsBanner } from "../PushAlerts";
import { CalendarFeed } from "../CalendarFeed";
import { DiscordFeed } from "../DiscordFeed";
import { searchAlias, isNonLatin } from "../../searchAliases";
import { mainPlayerEntries, pickTeamByCode } from "../../helpers";
import { riotImg } from "../../riotImage";
import { navigateHub } from "../../hub/route";
import {
  bare,
  normText,
  prettySlug,
  resolveLeagueSlug,
  resolvePlayerSlug,
  resolveRegionFilter,
  resolveTeamAlias,
} from "../../hub/data";
import { normalizeRole } from "../../hub/champAgg";
import { PlayerPhoto, TeamLogo } from "../hub/ui";

const teamSlug = (name?: string, code?: string) =>
  (name && resolveTeamAlias(name)) || (code && resolveTeamAlias(code)) || prettySlug(name || code || "");
const playerSlug = (name: string) => resolvePlayerSlug(name) || prettySlug(name);

interface WatchlistViewProps {
  settings: AppSettings;
  catalog: CatalogData;
  onUpdateSettings: (s: Partial<AppSettings>) => void;
  onRefreshCatalog?: () => Promise<void>;
  isRefreshingCatalog?: boolean;
  /** the desktop app opens links itself */
  onOpenUrl?: (url: string) => void;
}

type WatchlistSubTab = "teams" | "players" | "regions" | "leagues";

const MAJOR_LEAGUES_PRIORITY = [
  "LCK",
  "LPL",
  "LEC",
  "LCS",
  "WORLDS",
  "MSI",
  "FIRST STAND",
  "LCP",
  "CBLOL",
  "EMEA MASTERS",
  "NACL",
  "LDL",
  "LCK CHALLENGERS",
];

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  settings,
  catalog,
  onUpdateSettings,
  onRefreshCatalog,
  isRefreshingCatalog = false,
  onOpenUrl,
}) => {
  const [tab, setTab] = useState<WatchlistSubTab>("teams");
  // With dozens of follows the quick-remove chips filled a phone screen; show a few until asked
  const [showAllChips, setShowAllChips] = useState(false);
  const CHIP_LIMIT = 12;
  const chipTotal = settings.followedTeams.length + settings.followedPlayers.length;
  const teamChips = showAllChips ? settings.followedTeams : settings.followedTeams.slice(0, CHIP_LIMIT);
  const playerChips = showAllChips
    ? settings.followedPlayers
    : settings.followedPlayers.slice(0, Math.max(0, CHIP_LIMIT - teamChips.length));
  const [search, setSearch] = useState("");
  const [expandedTeamSlug, setExpandedTeamSlug] = useState<string | null>(null);
  const [brokenImgs, setBrokenImgs] = useState<Record<string, boolean>>({});

  // Toggle handlers (instant in-place updates)
  const toggleTeam = (code: string) => {
    const isFollowed = settings.followedTeams.includes(code);
    const next = isFollowed
      ? settings.followedTeams.filter((t) => t !== code)
      : [...settings.followedTeams, code];
    onUpdateSettings({ followedTeams: next });
  };

  const togglePlayer = (name: string) => {
    const isFollowed = settings.followedPlayers.includes(name);
    const next = isFollowed
      ? settings.followedPlayers.filter((p) => p !== name)
      : [...settings.followedPlayers, name];
    onUpdateSettings({ followedPlayers: next });
  };

  const toggleRegion = (code: string) => {
    const isFollowed = settings.followedRegions.includes(code);
    const next = isFollowed
      ? settings.followedRegions.filter((r) => r !== code)
      : [...settings.followedRegions, code];
    onUpdateSettings({ followedRegions: next });
  };

  const toggleLeague = (slug: string) => {
    const isFollowed = settings.followedLeagues.includes(slug);
    const next = isFollowed
      ? settings.followedLeagues.filter((l) => l !== slug)
      : [...settings.followedLeagues, slug];
    onUpdateSettings({ followedLeagues: next });
  };

  // Batch actions
  const followAllRegions = () => {
    onUpdateSettings({ followedRegions: [...DEFAULT_FOLLOWED_REGIONS] });
  };

  const unfollowAllRegions = () => {
    onUpdateSettings({ followedRegions: [] });
  };

  const followInternationalEvents = () => {
    const majors = ["worlds", "msi", "first_stand"];
    const merged = Array.from(new Set([...settings.followedLeagues, ...majors]));
    onUpdateSettings({ followedLeagues: merged });
  };

  const followAllLeagues = () => {
    const allSlugs = (catalog.leagues && catalog.leagues.length > 0)
      ? catalog.leagues.map((l) => l.slug)
      : GLOBAL_LEAGUES.map((l) => l.slug);
    onUpdateSettings({ followedLeagues: Array.from(new Set(allSlugs)) });
  };

  const unfollowAllLeagues = () => {
    onUpdateSettings({ followedLeagues: [] });
  };

  const q = normText(search.trim());
  // 페이커 -> faker, B站 -> bilibili: fans type names the way their community writes them
  const qs = normText(searchAlias(search).trim());
  const qTerms = useMemo(
    () =>
      search
        .split(/[,|]+|\s+vs\.?\s+|\s+v\s+/i)
        .map((s) => normText(searchAlias(s).trim()))
        .filter(Boolean),
    [search],
  );

  // Filtered TEAMS: searches across all catalog.teams (~778 teams)
  const filteredTeams = useMemo(() => {
    const all = catalog.teams || [];
    if (!q || qTerms.length === 0) {
      const followed = all.filter((t) => settings.followedTeams.includes(t.code));
      // Prioritize teams from major Tier-1 leagues
      const major = all.filter(
        (t) =>
          !settings.followedTeams.includes(t.code) &&
          MAJOR_LEAGUES_PRIORITY.some((ml) => t.league.toUpperCase().includes(ml))
      );
      return [...followed, ...major.slice(0, 50)];
    }
    return all
      .filter((t) => {
        const hay = normText(`${t.code} ${t.name} ${t.league} ${t.region} ${regionName(t.region)}`);
        const tSlug = teamSlug(t.name, t.code);
        return qTerms.some((term) => {
          if (hay.includes(term) || (bare(term).length >= 2 && bare(hay).includes(bare(term)))) return true;
          if (tSlug && resolveTeamAlias(term) === resolveTeamAlias(tSlug)) return true;
          const r = resolveRegionFilter(term);
          if (r && (resolveRegionFilter(t.region) === r || resolveRegionFilter(t.league) === r)) return true;
          return false;
        });
      })
      .slice(0, 100);
  }, [catalog.teams, settings.followedTeams, q, qTerms]);

  // Filtered PLAYERS: searches across all catalog.players (~4,634 players)
  const filteredPlayers = useMemo(() => {
    // A player Riot lists on a main roster and its academy shows once, with the main team
    const all = mainPlayerEntries(catalog.players || [], catalog.teams);
    if (!q || qTerms.length === 0) {
      // Show followed players first, then famous popular players
      const followed = all.filter((p) => settings.followedPlayers.includes(p.name));
      const popularNames = POPULAR_PLAYERS.map((p) => p.name.toLowerCase());
      const popular = all.filter((p) => popularNames.includes(p.name.toLowerCase()));
      const combined = [...followed, ...popular.filter((p) => !settings.followedPlayers.includes(p.name))];
      return combined.length > 0 ? combined.slice(0, 40) : all.slice(0, 40);
    }
    return all
      .filter((p) => {
        const pRole = normalizeRole(p.role);
        const hay = normText(`${p.name} ${p.teamCode} ${p.teamName} ${p.role} ${roleName(pRole || p.role)} ${p.realName || ""}`);
        const pSlug = playerSlug(p.name);
        const tSlug = teamSlug(p.teamName, p.teamCode);
        return qTerms.some(
          (term) =>
            hay.includes(term) ||
            (bare(term).length >= 2 && bare(hay).includes(bare(term))) ||
            resolvePlayerSlug(term) === pSlug ||
            (!!tSlug && resolveTeamAlias(term) === resolveTeamAlias(tSlug)) ||
            (!!pRole && normalizeRole(term) === pRole),
        );
      })
      .slice(0, 100);
  }, [catalog.players, catalog.teams, settings.followedPlayers, q, qTerms]);

  // Filtered REGIONS
  const filteredRegions = useMemo(() => {
    if (!q) return MAJOR_REGIONS;
    const rq = resolveRegionFilter(qs);
    return MAJOR_REGIONS.filter(
      (r) =>
        normText(r.name).includes(qs) ||
        normText(r.code).includes(qs) ||
        normText(regionName(r.code, r.name)).includes(qs) ||
        r.leagues.some((l) => normText(l).includes(qs)) ||
        (!!rq && (resolveRegionFilter(r.code) === rq || resolveRegionFilter(r.name) === rq))
    );
  }, [qs, q]);

  // Filtered LEAGUES: searches across all catalog.leagues (~51 leagues)
  const filteredLeagues = useMemo(() => {
    const all = catalog.leagues || [];
    if (!q) {
      // International first, then sorted by region
      return [...all].sort((a, b) => {
        const aInt = a.region?.toUpperCase() === "INTERNATIONAL" ? 0 : 1;
        const bInt = b.region?.toUpperCase() === "INTERNATIONAL" ? 0 : 1;
        if (aInt !== bInt) return aInt - bInt;
        return a.name.localeCompare(b.name);
      });
    }
    const rq = resolveRegionFilter(qs);
    const lq = resolveLeagueSlug(qs);
    return all.filter(
      (l) =>
        normText(l.name).includes(qs) ||
        normText(l.slug).includes(qs) ||
        normText(l.region).includes(qs) ||
        normText(regionName(l.region)).includes(qs) ||
        resolveLeagueSlug(l.slug) === lq ||
        (!!rq && (resolveRegionFilter(l.region) === rq || resolveRegionFilter(l.slug) === rq))
    );
  }, [catalog.leagues, qs, q]);

  // Search input placeholder per tab
  const searchPlaceholder =
    tab === "teams"
      ? tl("Search all {n} active teams…", { n: catalog.teams.length || 778 })
      : tab === "players"
      ? tl("Search all {n} registered pro players…", { n: catalog.players.length || 4634 })
      : tab === "regions"
      ? tl("Search regions…")
      : tl("Search all {n} Riot leagues…", { n: catalog.leagues.length || 51 });

  return (
    <div className="p-4 space-y-4 page-5xl rw-capped overflow-y-auto h-full select-none text-xs">
      {/* Active Watchlist Summary */}
      <div className="p-3 rounded-lg bg-rw-panel border border-rw-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-rw-accent uppercase tracking-wider text-[11px]">
              {tl("Active Watchlist")}
            </span>
            <span className="text-rw-muted text-[11px]">
              {tl("{teams} teams · {players} players · {regions} regions · {leagues} leagues", {
                teams: settings.followedTeams.length,
                players: settings.followedPlayers.length,
                regions: settings.followedRegions.length,
                leagues: settings.followedLeagues.length,
              })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {settings.followedTeams.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const a = teamSlug(pickTeamByCode(catalog.teams || [], settings.followedTeams[0])?.name, settings.followedTeams[0]);
                    const b = settings.followedTeams[1]
                      ? teamSlug(pickTeamByCode(catalog.teams || [], settings.followedTeams[1])?.name, settings.followedTeams[1])
                      : undefined;
                    navigateHub({ kind: "prep", a, ...(b && b !== a ? { b } : {}) });
                  }}
                  className="hidden sm:inline text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Match prep")} →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ts = settings.followedTeams
                      .slice(0, 2)
                      .map((c) => teamSlug(pickTeamByCode(catalog.teams || [], c)?.name, c))
                      .filter(Boolean)
                      .join(",");
                    navigateHub({ kind: "draft", ...(ts ? { query: `teams=${encodeURIComponent(ts)}` } : {}) });
                  }}
                  className="hidden sm:inline text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Draft board")} →
                </button>
              </>
            )}
            {(settings.followedTeams.length > 0 || settings.followedPlayers.length > 0) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (settings.followedTeams.length > 0) {
                      const a = teamSlug(pickTeamByCode(catalog.teams || [], settings.followedTeams[0])?.name, settings.followedTeams[0]);
                      const b = settings.followedTeams[1]
                        ? teamSlug(pickTeamByCode(catalog.teams || [], settings.followedTeams[1])?.name, settings.followedTeams[1])
                        : undefined;
                      navigateHub({ kind: "compare", mode: "team", a, ...(b && b !== a ? { b } : {}) });
                    } else {
                      const a = playerSlug(settings.followedPlayers[0]);
                      const b = settings.followedPlayers[1] ? playerSlug(settings.followedPlayers[1]) : undefined;
                      navigateHub({ kind: "compare", mode: "player", a, ...(b && b !== a ? { b } : {}) });
                    }
                  }}
                  className="hidden sm:inline text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Compare")} →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const lg = settings.followedLeagues.length === 1 ? resolveLeagueSlug(settings.followedLeagues[0]) : "";
                    const tA = settings.followedTeams[0]
                      ? teamSlug(pickTeamByCode(catalog.teams || [], settings.followedTeams[0])?.name, settings.followedTeams[0])
                      : "";
                    const tB = settings.followedTeams[1]
                      ? teamSlug(pickTeamByCode(catalog.teams || [], settings.followedTeams[1])?.name, settings.followedTeams[1])
                      : "";
                    const pA = settings.followedPlayers[0] ? playerSlug(settings.followedPlayers[0]) : "";
                    const pB = settings.followedPlayers[1] ? playerSlug(settings.followedPlayers[1]) : "";
                    const q = new URLSearchParams({
                      ...(tA ? { team: tA } : {}),
                      ...(tB && tB !== tA ? { vs: tB } : {}),
                      ...(pA ? { player: pA } : {}),
                      ...(pB && pB !== pA ? { vsplayer: pB } : {}),
                      ...(lg ? { league: lg } : {}),
                    }).toString();
                    navigateHub({ kind: "finder", ...(q ? { query: q } : {}) });
                  }}
                  className="hidden sm:inline text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Game finder")} →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const lg = settings.followedLeagues.length === 1 ? resolveLeagueSlug(settings.followedLeagues[0]) : "";
                    const tA = settings.followedTeams[0]
                      ? teamSlug(pickTeamByCode(catalog.teams || [], settings.followedTeams[0])?.name, settings.followedTeams[0])
                      : "";
                    const tB = settings.followedTeams[1]
                      ? teamSlug(pickTeamByCode(catalog.teams || [], settings.followedTeams[1])?.name, settings.followedTeams[1])
                      : "";
                    const pA = settings.followedPlayers[0] ? playerSlug(settings.followedPlayers[0]) : "";
                    const pB = settings.followedPlayers[1] ? playerSlug(settings.followedPlayers[1]) : "";
                    const q = new URLSearchParams({
                      ...(tA ? { team: tA } : {}),
                      ...(tB && tB !== tA ? { vs: tB } : {}),
                      ...(pA ? { player: pA } : {}),
                      ...(pB && pB !== pA ? { vsplayer: pB } : {}),
                      ...(lg ? { league: lg } : {}),
                    }).toString();
                    navigateHub({ kind: "items", ...(q ? { query: q } : {}) });
                  }}
                  className="hidden sm:inline text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
                >
                  {tl("Item history")} →
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const lg = settings.followedLeagues.length === 1 ? resolveLeagueSlug(settings.followedLeagues[0]) : "";
                const tq = settings.followedTeams
                  .slice(0, 4)
                  .map((c) => teamSlug(pickTeamByCode(catalog.teams || [], c)?.name, c))
                  .filter(Boolean)
                  .join(",");
                const q = new URLSearchParams({
                  ...(lg ? { league: lg } : {}),
                  ...(tq ? { q: tq } : {}),
                }).toString();
                navigateHub({ kind: "rankings", ...(q ? { query: q } : {}) });
              }}
              className="hidden sm:inline text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Power rankings")} →
            </button>
            <button
              type="button"
              onClick={() => {
                const lg = settings.followedLeagues.length === 1 ? resolveLeagueSlug(settings.followedLeagues[0]) : "";
                navigateHub({ kind: "tiers", ...(lg ? { query: `scope=${encodeURIComponent(lg)}&league=${encodeURIComponent(lg)}` } : {}) });
              }}
              className="hidden sm:inline text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Pro tier list")} →
            </button>
            <button
              type="button"
              onClick={() => {
                const lg = settings.followedLeagues.length === 1 ? resolveLeagueSlug(settings.followedLeagues[0]) : "";
                const lq = [
                  ...settings.followedPlayers.slice(0, 4).map((n) => playerSlug(n)),
                  ...settings.followedTeams.slice(0, 4).map((c) => teamSlug(pickTeamByCode(catalog.teams || [], c)?.name, c)),
                ]
                  .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
                  .join(",");
                const q = new URLSearchParams({
                  ...(lg ? { league: lg } : {}),
                  ...(lq ? { q: lq } : {}),
                }).toString();
                navigateHub({ kind: "leaders", ...(q ? { query: q } : {}) });
              }}
              className="hidden sm:inline text-[11px] text-rw-sub hover:text-rw-accent hover:underline"
            >
              {tl("Player leaderboards")} →
            </button>
            {onRefreshCatalog && (
              <button
                onClick={onRefreshCatalog}
                disabled={isRefreshingCatalog}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors"
                title={tl("Check Riot API for roster transfers, trades, and new leagues")}
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingCatalog ? "animate-spin text-rw-accent" : ""}`} />
                <span>{isRefreshingCatalog ? tl("Syncing directory…") : tl("Check roster updates")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick-remove chips */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {teamChips.map((code) => {
            const teamObj = pickTeamByCode(catalog.teams || [], code);
            const teamDisplay = teamObj?.name || code;
            const tChipSlug = teamSlug(teamDisplay, code);
            const rivalCode = teamChips.find((c) => c !== code);
            const rivalObj = rivalCode ? pickTeamByCode(catalog.teams || [], rivalCode) : undefined;
            const rivalSlug = rivalCode ? teamSlug(rivalObj?.name || rivalCode, rivalCode) : "";
            return (
              <span
                key={`chip-t-${code}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-accent/40 text-rw-accent font-semibold text-[10px]"
              >
                <button
                  type="button"
                  onClick={() =>
                    navigateHub({
                      kind: "team",
                      slug: tChipSlug,
                      ...(rivalSlug && rivalSlug !== tChipSlug ? { query: `q=${encodeURIComponent(rivalSlug)}` } : {}),
                    })
                  }
                  className="inline-flex items-center gap-1 hover:underline"
                  title={teamDisplay}
                >
                  <TeamLogo name={teamDisplay} code={code} src={teamObj?.image} size={12} />
                  <span>{code}</span>
                </button>
                <button
                  onClick={() => toggleTeam(code)}
                  className="hover:text-white"
                  title={tl("Remove from watchlist")}
                  aria-label={tl("Stop following {name}", { name: code })}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {playerChips.map((name) => {
            const pChipSlug = playerSlug(name);
            const pEntry = (catalog.players || []).find((pl) => pl.name === name);
            const pTeamSlug = pEntry ? teamSlug(pEntry.teamName, pEntry.teamCode) : "";
            const pRole = pEntry ? normalizeRole(pEntry.role) : "";
            const rivalName = playerChips.find((n) => n !== name);
            const rivalPSlug = rivalName ? playerSlug(rivalName) : "";
            const pChipQ = new URLSearchParams({
              ...(pTeamSlug ? { team: pTeamSlug } : {}),
              ...(pRole ? { role: pRole } : {}),
              ...(rivalPSlug && rivalPSlug !== pChipSlug ? { q: rivalPSlug } : {}),
            }).toString();
            return (
              <span
                key={`chip-p-${name}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-teal/40 text-rw-teal font-semibold text-[10px]"
              >
                <button
                  type="button"
                  onClick={() => navigateHub({ kind: "player", slug: pChipSlug, ...(pChipQ ? { query: pChipQ } : {}) })}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <PlayerPhoto name={name} slug={pChipSlug} size={13} linkFallback={false} />
                  <span>{name}</span>
                </button>
                <button
                  onClick={() => togglePlayer(name)}
                  className="hover:text-white"
                  title={tl("Remove from watchlist")}
                  aria-label={tl("Stop following {name}", { name })}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {chipTotal > CHIP_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllChips((v) => !v)}
              className="inline-flex items-center px-2 py-0.5 rounded border border-rw-border text-rw-accent hover:border-rw-accent/60 text-[10px] font-semibold"
            >
              {showAllChips ? tl("Show fewer") : tl("Show all {n}", { n: chipTotal })}
            </button>
          )}

          {settings.followedRegions.length > 0 && (
            <button
              type="button"
              onClick={() => setTab("regions")}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-muted/40 text-rw-text hover:border-rw-accent text-[10px] transition-colors"
            >
              <span>🌐 {tl("{n} Regions", { n: settings.followedRegions.length })}</span>
            </button>
          )}
          {settings.followedLeagues.length > 0 && (
            <button
              type="button"
              onClick={() => setTab("leagues")}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-muted/40 text-rw-text hover:border-rw-accent text-[10px] transition-colors"
            >
              <span>🏆 {tl("Leagues ({n})", { n: settings.followedLeagues.length })}</span>
            </button>
          )}
        </div>
      </div>

      {IS_WEB && <PushAlertsBanner settings={settings} />}
      <CalendarFeed settings={settings} onOpenUrl={IS_WEB ? undefined : onOpenUrl} />
      {IS_WEB && <DiscordFeed />}

      {/* Sub-tab Navigation & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-rw-border">
        <div className="grid grid-cols-4 sm:flex items-center gap-1 bg-rw-deep p-1 rounded-lg border border-rw-border">
          <button
            onClick={() => setTab("teams")}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded transition-all ${
              tab === "teams" ? "bg-rw-accent text-rw-bg" : "text-rw-muted hover:text-rw-text"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{tl("Teams ({n})", { n: settings.followedTeams.length })}</span>
          </button>

          <button
            onClick={() => setTab("players")}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded transition-all ${
              tab === "players" ? "bg-rw-accent text-rw-bg" : "text-rw-muted hover:text-rw-text"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{tl("Players ({n})", { n: settings.followedPlayers.length })}</span>
          </button>

          <button
            onClick={() => setTab("regions")}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded transition-all ${
              tab === "regions" ? "bg-rw-accent text-rw-bg" : "text-rw-muted hover:text-rw-text"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{tl("Regions ({n})", { n: settings.followedRegions.length })}</span>
          </button>

          <button
            onClick={() => setTab("leagues")}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded transition-all ${
              tab === "leagues" ? "bg-rw-accent text-rw-bg" : "text-rw-muted hover:text-rw-text"
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>{tl("Leagues ({n})", { n: settings.followedLeagues.length })}</span>
          </button>
        </div>

        {/* Dynamic Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-rw-muted" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-rw-surface border border-rw-border rounded-lg pl-8 pr-3 py-1 text-xs text-rw-text focus:outline-none focus:border-rw-accent"
          />
        </div>
      </div>

      {/* 1. TEAMS SUB-TAB */}
      {tab === "teams" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-rw-muted">
            <span>
              {!q
                ? tl("Showing major pro teams ({shown} of {total}) · type above to search all teams", { shown: filteredTeams.length, total: catalog.teams.length })
                : tl('Found {n} teams matching "{q}"', { n: filteredTeams.length, q }) + (filteredTeams.length === 0 && isNonLatin(search) ? " · " + tl("Names here use English letters. Try the in-game name, like Faker or T1.") : "")}
            </span>
            {q && filteredTeams.length === 1 && (() => {
              const a = teamSlug(filteredTeams[0].name, filteredTeams[0].code);
              const lg = filteredTeams[0].league ? resolveLeagueSlug(filteredTeams[0].league) : "";
              return (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "prep", a })}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "draft", query: `teams=${encodeURIComponent(a)}` })}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "compare", mode: "team", a })}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "finder",
                        query: new URLSearchParams({
                          team: a,
                          ...(lg ? { league: lg } : {}),
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "items",
                        query: new URLSearchParams({
                          team: a,
                          ...(lg ? { league: lg } : {}),
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "rankings",
                        query: new URLSearchParams({
                          ...(lg ? { league: lg } : {}),
                          q: a,
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </button>
                  {lg && (
                    <button
                      type="button"
                      onClick={() => navigateHub({ kind: "tiers", query: `scope=${encodeURIComponent(lg)}&league=${encodeURIComponent(lg)}` })}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(lg ? { league: lg } : {}),
                          q: a,
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </button>
                </span>
              );
            })()}
            {(q ? filteredTeams.length >= 2 : settings.followedTeams.length >= 2 && filteredTeams.length >= 2) && (() => {
              const a = teamSlug(filteredTeams[0].name, filteredTeams[0].code);
              const b = teamSlug(filteredTeams[1].name, filteredTeams[1].code);
              if (a === b) return null;
              const lg0 = filteredTeams[0].league ? resolveLeagueSlug(filteredTeams[0].league) : "";
              const sameLg =
                lg0 && filteredTeams.every((t) => (t.league ? resolveLeagueSlug(t.league) : "") === lg0) ? lg0 : "";
              return (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "prep", a, b })}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Match prep")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "draft", query: `teams=${encodeURIComponent(a)},${encodeURIComponent(b)}` })}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Draft board")} →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "compare", mode: "team", a, b })}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "finder",
                        query: new URLSearchParams({
                          team: a,
                          vs: b,
                          ...(sameLg ? { league: sameLg } : {}),
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "items",
                        query: new URLSearchParams({
                          team: a,
                          vs: b,
                          ...(sameLg ? { league: sameLg } : {}),
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "rankings",
                        query: new URLSearchParams({
                          ...(sameLg ? { league: sameLg } : {}),
                          q: `${a},${b}`,
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Power rankings")} →
                  </button>
                  {sameLg && (
                    <button
                      type="button"
                      onClick={() => navigateHub({ kind: "tiers", query: `scope=${encodeURIComponent(sameLg)}&league=${encodeURIComponent(sameLg)}` })}
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(sameLg ? { league: sameLg } : {}),
                          q: `${a},${b}`,
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </button>
                </span>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredTeams.map((team) => {
              const isFollowed = settings.followedTeams.includes(team.code);
              const isExpanded = expandedTeamSlug === team.slug;
              // By slug: a team and its academy can share a code (LYON, Lyon Academy)
              const roster = (catalog.players || []).filter((p) =>
                p.teamSlug ? p.teamSlug === team.slug : p.teamCode === team.code
              );

              const tSlug = teamSlug(team.name, team.code);
              const vsTeamObj = filteredTeams.find((x) => x.slug !== team.slug);
              const vsSlug = vsTeamObj ? teamSlug(vsTeamObj.name, vsTeamObj.code) : "";
              const useVs = Boolean(vsSlug && vsSlug !== tSlug && (filteredTeams.length === 2 || isFollowed));
              const rPlayers = roster
                .slice(0, 2)
                .map((p) => playerSlug(p.name))
                .filter(Boolean);
              const tQuery = useVs ? `q=${encodeURIComponent(vsSlug)}` : undefined;
              return (
                <div
                  key={team.slug}
                  className={`rounded-lg border p-3 transition-all ${
                    isFollowed
                      ? "bg-rw-surface border-rw-accent text-rw-text"
                      : "bg-rw-bg border-rw-border text-rw-muted hover:border-rw-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => navigateHub({ kind: "team", slug: tSlug, ...(tQuery ? { query: tQuery } : {}) })}
                        className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent transition-all"
                        title={team.name}
                      >
                        {team.image && !brokenImgs[team.slug] ? (
                          <img
                            {...riotImg(team.image, 96)}
                            alt={team.code}
                            onError={() => setBrokenImgs((b) => ({ ...b, [team.slug]: true }))}
                            className="w-9 h-9 object-contain rounded bg-rw-deep p-0.5"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-rw-deep border border-rw-border flex items-center justify-center font-bold font-mono text-xs text-rw-accent">
                            {team.code.slice(0, 3)}
                          </div>
                        )}
                      </button>
                      <div>
                        <button
                          type="button"
                          onClick={() => navigateHub({ kind: "team", slug: tSlug, ...(tQuery ? { query: tQuery } : {}) })}
                          className="font-bold text-xs text-rw-text hover:text-rw-accent hover:underline text-left transition-colors"
                        >
                          {team.name}
                        </button>
                        <div className="text-[11px] text-rw-muted">
                          {team.league ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  navigateHub({
                                    kind: "league",
                                    slug: resolveLeagueSlug(team.league),
                                    query: `q=${encodeURIComponent(useVs ? `${tSlug},${vsSlug}` : tSlug)}`,
                                  })
                                }
                                className="hover:text-rw-accent hover:underline"
                              >
                                {team.league}
                              </button>
                              {" · "}
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => navigateHub({ kind: "team", slug: tSlug, ...(tQuery ? { query: tQuery } : {}) })}
                            className="hover:text-rw-accent hover:underline"
                          >
                            {team.code}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => navigateHub({ kind: "prep", a: tSlug, ...(useVs ? { b: vsSlug } : {}) })}
                        className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors"
                      >
                        {tl("Match prep")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigateHub({
                            kind: "draft",
                            query: `teams=${encodeURIComponent(useVs ? `${tSlug},${vsSlug}` : tSlug)}`,
                          })
                        }
                        className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden sm:inline-block"
                      >
                        {tl("Draft board")}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateHub({ kind: "compare", mode: "team", a: tSlug, ...(useVs ? { b: vsSlug } : {}) })}
                        className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors"
                      >
                        {tl("Compare")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const lg = team.league ? resolveLeagueSlug(team.league) : "";
                          navigateHub({
                            kind: "finder",
                            query: new URLSearchParams({
                              team: tSlug,
                              ...(useVs ? { vs: vsSlug } : {}),
                              ...(rPlayers[0] ? { player: rPlayers[0] } : {}),
                              ...(rPlayers[1] ? { vsplayer: rPlayers[1] } : {}),
                              ...(lg ? { league: lg } : {}),
                            }).toString(),
                          });
                        }}
                        className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden sm:inline-block"
                      >
                        {tl("Game finder")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const lg = team.league ? resolveLeagueSlug(team.league) : "";
                          navigateHub({
                            kind: "items",
                            query: new URLSearchParams({
                              team: tSlug,
                              ...(useVs ? { vs: vsSlug } : {}),
                              ...(rPlayers[0] ? { player: rPlayers[0] } : {}),
                              ...(rPlayers[1] ? { vsplayer: rPlayers[1] } : {}),
                              ...(lg ? { league: lg } : {}),
                            }).toString(),
                          });
                        }}
                        className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden md:inline-block"
                      >
                        {tl("Item history")}
                      </button>
                      {roster.length > 0 && (
                        <button
                          onClick={() => setExpandedTeamSlug(isExpanded ? null : team.slug)}
                          className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-text"
                        >
                          {(isExpanded ? "▲ " : "▼ ") + tl("Roster ({n})", { n: roster.length })}
                        </button>
                      )}

                      <button
                        onClick={() => toggleTeam(team.code)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                          isFollowed
                            ? "bg-rw-accent text-rw-bg"
                            : "bg-rw-deep border border-rw-border text-rw-muted hover:text-rw-text"
                        }`}
                      >
                        {isFollowed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        <span>{isFollowed ? tl("Following") : tl("Follow")}</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Registered Roster */}
                  {isExpanded && roster.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-rw-border space-y-1">
                      <button
                        type="button"
                        onClick={() => navigateHub({ kind: "team", slug: tSlug, tab: "history" })}
                        className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline mb-1 block text-left"
                      >
                        {tn("Active roster ({n} player)", "Active roster ({n} players)", roster.length)}
                      </button>
                      {roster.map((p) => {
                        const isPlayerFollowed = settings.followedPlayers.includes(p.name);
                        const pSlug = playerSlug(p.name);
                        const pRole = normalizeRole(p.role);
                        const vsRosterP = roster.find((x) => x.name !== p.name);
                        const vsRosterSlug = vsRosterP ? playerSlug(vsRosterP.name) : "";
                        const pQuery = new URLSearchParams({
                          team: tSlug,
                          ...(pRole ? { role: pRole } : {}),
                          ...(vsRosterSlug && vsRosterSlug !== pSlug ? { q: vsRosterSlug } : {}),
                        }).toString();
                        return (
                          <div key={`${p.teamSlug || p.teamCode}-${p.name}`} className="flex items-center justify-between text-[11px] py-0.5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const lg = team.league ? resolveLeagueSlug(team.league) : "";
                                  navigateHub({
                                    kind: "leaders",
                                    query: new URLSearchParams({
                                      ...(lg ? { league: lg } : {}),
                                      ...(pRole ? { role: pRole } : {}),
                                      q: [pSlug, vsRosterSlug, tSlug].filter(Boolean).join(","),
                                    }).toString(),
                                  });
                                }}
                                className="text-[10px] font-mono px-1.5 rounded bg-rw-deep text-rw-teal hover:text-rw-accent min-w-12 text-center whitespace-nowrap shrink-0"
                                title={tl("Player leaderboards")}
                              >
                                {roleName(pRole || p.role)}
                              </button>
                              <button
                                type="button"
                                onClick={() => navigateHub({ kind: "player", slug: pSlug, ...(pQuery ? { query: pQuery } : {}) })}
                                className="inline-flex items-center gap-2 text-rw-text font-semibold hover:text-rw-accent hover:underline text-left transition-colors"
                              >
                                <PlayerPhoto name={p.name} team={team.name} img={p.image} size={18} linkFallback={false} />
                                <span>{p.name}</span>
                              </button>
                              {p.realName && <span className="text-rw-muted">({p.realName})</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  navigateHub({
                                    kind: "compare",
                                    mode: "player",
                                    a: pSlug,
                                    ...(vsRosterSlug && vsRosterSlug !== pSlug ? { b: vsRosterSlug } : {}),
                                  })
                                }
                                className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline"
                              >
                                {tl("Compare")}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const lg = team.league ? resolveLeagueSlug(team.league) : "";
                                  navigateHub({
                                    kind: "finder",
                                    query: new URLSearchParams({
                                      player: pSlug,
                                      ...(vsRosterSlug && vsRosterSlug !== pSlug ? { vsplayer: vsRosterSlug } : {}),
                                      team: tSlug,
                                      ...(pRole ? { role: pRole } : {}),
                                      ...(lg ? { league: lg } : {}),
                                    }).toString(),
                                  });
                                }}
                                className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline hidden sm:inline"
                              >
                                {tl("Game finder")}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const lg = team.league ? resolveLeagueSlug(team.league) : "";
                                  navigateHub({
                                    kind: "items",
                                    query: new URLSearchParams({
                                      player: pSlug,
                                      ...(vsRosterSlug && vsRosterSlug !== pSlug ? { vsplayer: vsRosterSlug } : {}),
                                      team: tSlug,
                                      ...(pRole ? { role: pRole } : {}),
                                      ...(lg ? { league: lg } : {}),
                                    }).toString(),
                                  });
                                }}
                                className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline hidden sm:inline"
                              >
                                {tl("Item history")}
                              </button>
                              <button
                                onClick={() => togglePlayer(p.name)}
                                className={`text-[10px] font-semibold ${
                                  isPlayerFollowed ? "text-rw-teal" : "text-rw-muted hover:text-rw-accent"
                                }`}
                              >
                                {isPlayerFollowed ? "★ " + tl("Following") : "☆ " + tl("Follow")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. PLAYERS SUB-TAB */}
      {tab === "players" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-rw-muted">
            <span>
              {!q
                ? tl("Showing top pro players ({shown} of {total}) · type above to search all registered pros", { shown: filteredPlayers.length, total: catalog.players.length })
                : tl('Found {n} players matching "{q}"', { n: filteredPlayers.length, q }) + (filteredPlayers.length === 0 && isNonLatin(search) ? " · " + tl("Names here use English letters. Try the in-game name, like Faker or T1.") : "")}
            </span>
            {q && filteredPlayers.length === 1 && (() => {
              const a = playerSlug(filteredPlayers[0].name);
              const tA = teamSlug(filteredPlayers[0].teamName, filteredPlayers[0].teamCode);
              const r0 = normalizeRole(filteredPlayers[0]?.role) || "";
              const teamObj = catalog.teams?.find(
                (t) =>
                  (filteredPlayers[0].teamSlug && t.slug === filteredPlayers[0].teamSlug) ||
                  t.code.toUpperCase() === filteredPlayers[0].teamCode.toUpperCase(),
              );
              const lg0 = teamObj?.league ? resolveLeagueSlug(teamObj.league) : "";
              return (
                <span className="flex items-center gap-2">
                  {tA && (
                    <>
                      <button
                        type="button"
                        onClick={() => navigateHub({ kind: "prep", a: tA })}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Match prep")} →
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigateHub({
                            kind: "draft",
                            query: new URLSearchParams({
                              teams: tA,
                              ...(r0 ? { role: r0 } : {}),
                            }).toString(),
                          })
                        }
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Draft board")} →
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "compare", mode: "player", a })}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "items",
                        query: new URLSearchParams({
                          player: a,
                          ...(tA ? { team: tA } : {}),
                          ...(r0 ? { role: r0 } : {}),
                          ...(lg0 ? { league: lg0 } : {}),
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "finder",
                        query: new URLSearchParams({
                          player: a,
                          ...(tA ? { team: tA } : {}),
                          ...(r0 ? { role: r0 } : {}),
                          ...(lg0 ? { league: lg0 } : {}),
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </button>
                  {(r0 || lg0) && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateHub({
                          kind: "tiers",
                          query: new URLSearchParams({
                            ...(lg0 ? { scope: lg0, league: lg0 } : {}),
                            ...(r0 ? { role: r0 } : {}),
                          }).toString(),
                        })
                      }
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      navigateHub({
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(lg0 ? { league: lg0 } : {}),
                          ...(r0 ? { role: r0 } : {}),
                          q: [a, tA].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx).join(","),
                        }).toString(),
                      });
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </button>
                </span>
              );
            })()}
            {(q ? filteredPlayers.length >= 2 : settings.followedPlayers.length >= 2 && filteredPlayers.length >= 2) && (() => {
              const a = playerSlug(filteredPlayers[0].name);
              const b = playerSlug(filteredPlayers[1].name);
              if (a === b) return null;
              const tA = teamSlug(filteredPlayers[0].teamName, filteredPlayers[0].teamCode);
              const tB = teamSlug(filteredPlayers[1].teamName, filteredPlayers[1].teamCode);
              const r0 = normalizeRole(filteredPlayers[0]?.role);
              const sameRole = r0 && filteredPlayers.every((p) => normalizeRole(p.role) === r0) ? r0 : "";
              const playerLeague = (p: PlayerEntry) => {
                const t = catalog.teams?.find(
                  (tm) => (p.teamSlug && tm.slug === p.teamSlug) || tm.code.toUpperCase() === p.teamCode.toUpperCase(),
                );
                return t?.league ? resolveLeagueSlug(t.league) : "";
              };
              const lg0 = playerLeague(filteredPlayers[0]);
              const sameLg = lg0 && filteredPlayers.every((p) => playerLeague(p) === lg0) ? lg0 : "";
              return (
                <span className="flex items-center gap-2">
                  {tA && tB && tA !== tB && (
                    <>
                      <button
                        type="button"
                        onClick={() => navigateHub({ kind: "prep", a: tA, b: tB })}
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Match prep")} →
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigateHub({
                            kind: "draft",
                            query: `teams=${encodeURIComponent(tA)},${encodeURIComponent(tB)}${sameRole ? `&role=${encodeURIComponent(sameRole)}` : ""}`,
                          })
                        }
                        className="text-rw-sub hover:text-rw-accent hover:underline"
                      >
                        {tl("Draft board")} →
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => navigateHub({ kind: "compare", mode: "player", a, b })}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Compare")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "items",
                        query: new URLSearchParams({
                          player: a,
                          vsplayer: b,
                          ...(tA ? { team: tA } : {}),
                          ...(tB && tB !== tA ? { vs: tB } : {}),
                          ...(sameRole ? { role: sameRole } : {}),
                          ...(sameLg ? { league: sameLg } : {}),
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Item history")} →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateHub({
                        kind: "finder",
                        query: new URLSearchParams({
                          player: a,
                          vsplayer: b,
                          ...(tA ? { team: tA } : {}),
                          ...(tB && tB !== tA ? { vs: tB } : {}),
                          ...(sameRole ? { role: sameRole } : {}),
                          ...(sameLg ? { league: sameLg } : {}),
                        }).toString(),
                      })
                    }
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Game finder")} →
                  </button>
                  {(sameRole || sameLg) && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateHub({
                          kind: "tiers",
                          query: new URLSearchParams({
                            ...(sameLg ? { scope: sameLg, league: sameLg } : {}),
                            ...(sameRole ? { role: sameRole } : {}),
                          }).toString(),
                        })
                      }
                      className="text-rw-sub hover:text-rw-accent hover:underline"
                    >
                      {tl("Pro tier list")} →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      navigateHub({
                        kind: "leaders",
                        query: new URLSearchParams({
                          ...(sameLg ? { league: sameLg } : {}),
                          ...(sameRole ? { role: sameRole } : {}),
                          q: [a, b, tA, tB].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx).join(","),
                        }).toString(),
                      });
                    }}
                    className="text-rw-sub hover:text-rw-accent hover:underline"
                  >
                    {tl("Player leaderboards")} →
                  </button>
                </span>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredPlayers.map((player) => {
              const isFollowed = settings.followedPlayers.includes(player.name);
              const pSlug = playerSlug(player.name);
              const tSlug = teamSlug(player.teamName, player.teamCode);
              const pRole = normalizeRole(player.role) || player.role;
              const vsPlayerObj =
                filteredPlayers.find((x) => x.name !== player.name && (normalizeRole(x.role) || x.role) === pRole) ||
                filteredPlayers.find((x) => x.name !== player.name);
              const vsPSlug = vsPlayerObj ? playerSlug(vsPlayerObj.name) : "";
              const vsTSlug = vsPlayerObj ? teamSlug(vsPlayerObj.teamName, vsPlayerObj.teamCode) : "";
              const useVsP = Boolean(vsPSlug && vsPSlug !== pSlug && (filteredPlayers.length === 2 || isFollowed));
              const pCardQuery = new URLSearchParams({
                ...(tSlug ? { team: tSlug } : {}),
                ...(pRole ? { role: pRole } : {}),
                ...(useVsP ? { q: vsPSlug } : {}),
              }).toString();

              return (
                <div
                  key={`${player.teamSlug || player.teamCode}-${player.name}`}
                  onClick={() => togglePlayer(player.name)}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                    isFollowed
                      ? "bg-rw-surface border-rw-teal text-rw-text"
                      : "bg-rw-bg border-rw-border text-rw-muted hover:border-rw-muted"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateHub({ kind: "player", slug: pSlug, ...(pCardQuery ? { query: pCardQuery } : {}) });
                      }}
                      className="shrink-0 rounded-full hover:ring-1 hover:ring-rw-accent transition-all"
                      title={player.name}
                    >
                      <PlayerPhoto name={player.name} team={player.teamName} img={player.image} size={32} linkFallback={false} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearch((prev) => (prev.toLowerCase() === pRole.toLowerCase() ? "" : pRole));
                      }}
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rw-deep border border-rw-border text-rw-teal hover:border-rw-accent min-w-14 text-center whitespace-nowrap shrink-0"
                    >
                      {roleName(pRole)}
                    </button>
                    <div>
                      <div className="font-bold text-xs text-rw-text flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateHub({ kind: "player", slug: pSlug, ...(pCardQuery ? { query: pCardQuery } : {}) });
                          }}
                          className="hover:text-rw-accent hover:underline text-left transition-colors"
                        >
                          {player.name}
                        </button>
                        {player.realName && (
                          <span className="text-[10px] font-normal text-rw-muted">
                            · {player.realName}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-rw-muted flex items-center gap-1 mt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateHub({
                              kind: "team",
                              slug: tSlug,
                              ...(useVsP && vsTSlug && vsTSlug !== tSlug ? { query: `q=${encodeURIComponent(vsTSlug)}` } : {}),
                            });
                          }}
                          className="inline-flex items-center gap-1 hover:text-rw-accent hover:underline text-left transition-colors"
                        >
                          <TeamLogo name={player.teamName || player.teamCode} code={player.teamCode} size={13} />
                          <span>{player.teamName} ({player.teamCode})</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateHub({ kind: "compare", mode: "player", a: pSlug, ...(useVsP ? { b: vsPSlug } : {}) });
                      }}
                      className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors"
                    >
                      {tl("Compare")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rNorm = normalizeRole(player.role);
                        const tm = catalog.teams?.find(
                          (t) => (player.teamSlug && t.slug === player.teamSlug) || t.code.toUpperCase() === player.teamCode.toUpperCase(),
                        );
                        const lg = tm?.league ? resolveLeagueSlug(tm.league) : "";
                        navigateHub({
                          kind: "finder",
                          query: new URLSearchParams({
                            player: pSlug,
                            ...(useVsP ? { vsplayer: vsPSlug } : {}),
                            ...(tSlug ? { team: tSlug } : {}),
                            ...(useVsP && vsTSlug && vsTSlug !== tSlug ? { vs: vsTSlug } : {}),
                            ...(rNorm ? { role: rNorm } : {}),
                            ...(lg ? { league: lg } : {}),
                          }).toString(),
                        });
                      }}
                      className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden sm:inline-block"
                    >
                      {tl("Game finder")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rNorm = normalizeRole(player.role);
                        const tm = catalog.teams?.find(
                          (t) => (player.teamSlug && t.slug === player.teamSlug) || t.code.toUpperCase() === player.teamCode.toUpperCase(),
                        );
                        const lg = tm?.league ? resolveLeagueSlug(tm.league) : "";
                        navigateHub({
                          kind: "items",
                          query: new URLSearchParams({
                            player: pSlug,
                            ...(useVsP ? { vsplayer: vsPSlug } : {}),
                            ...(tSlug ? { team: tSlug } : {}),
                            ...(useVsP && vsTSlug && vsTSlug !== tSlug ? { vs: vsTSlug } : {}),
                            ...(rNorm ? { role: rNorm } : {}),
                            ...(lg ? { league: lg } : {}),
                          }).toString(),
                        });
                      }}
                      className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden md:inline-block"
                    >
                      {tl("Item history")}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlayer(player.name);
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        isFollowed
                          ? "bg-rw-teal text-rw-bg"
                          : "bg-rw-deep border border-rw-border text-rw-muted hover:text-rw-text"
                      }`}
                    >
                      {isFollowed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{isFollowed ? tl("Following") : tl("Follow")}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. REGIONS SUB-TAB */}
      {tab === "regions" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-rw-muted">
              {tl("Following a region follows every league in it. All {n} regions are followed by default; unfollow the ones you don't care about to tighten \"Followed only\" and your match alerts.", { n: MAJOR_REGIONS.length })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={followAllRegions}
                className="px-2.5 py-1 rounded bg-rw-panel border border-rw-accent text-rw-accent hover:bg-rw-accent hover:text-rw-bg font-semibold text-[11px] transition-colors"
              >
                {tl("★ Follow All")}
              </button>
              <button
                onClick={unfollowAllRegions}
                className="px-2.5 py-1 rounded bg-rw-panel border border-rw-border text-rw-muted hover:text-rw-red font-semibold text-[11px] transition-colors"
              >
                {tl("Unfollow All")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredRegions.map((region) => {
              const isFollowed = settings.followedRegions.includes(region.code);

              return (
                <div
                  key={region.code}
                  onClick={() => toggleRegion(region.code)}
                  className={`flex items-center justify-between p-3.5 rounded-lg border cursor-pointer transition-all ${
                    isFollowed
                      ? "bg-rw-surface border-rw-accent text-rw-text"
                      : "bg-rw-bg border-rw-border text-rw-muted hover:border-rw-muted"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{region.badge}</span>
                    <div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateHub({ kind: "leagues", query: `q=${encodeURIComponent(region.code)}` });
                        }}
                        className="font-bold text-xs text-rw-text hover:text-rw-accent hover:underline text-left block"
                      >
                        {regionName(region.code, region.name)}
                      </button>
                      <div className="text-[10px] text-rw-muted flex flex-wrap items-center gap-x-1">
                        {region.leagues.map((l, idx) => (
                          <React.Fragment key={l}>
                            {idx > 0 && <span>·</span>}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateHub({ kind: "league", slug: resolveLeagueSlug(l) });
                              }}
                              className="hover:text-rw-accent hover:underline"
                            >
                              {tl(l)}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {region.leagues[0] && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateHub({ kind: "rankings", query: `league=${encodeURIComponent(resolveLeagueSlug(region.leagues[0]))}` });
                          }}
                          className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden sm:inline-block"
                        >
                          {tl("Power rankings")}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const lg = resolveLeagueSlug(region.leagues[0]);
                            navigateHub({ kind: "tiers", query: `scope=${encodeURIComponent(lg)}&league=${encodeURIComponent(lg)}` });
                          }}
                          className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden md:inline-block"
                        >
                          {tl("Pro tier list")}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateHub({ kind: "leaders", query: `league=${encodeURIComponent(resolveLeagueSlug(region.leagues[0]))}` });
                          }}
                          className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden lg:inline-block"
                        >
                          {tl("Player leaderboards")}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateHub({ kind: "finder", query: `league=${encodeURIComponent(resolveLeagueSlug(region.leagues[0]))}` });
                          }}
                          className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden xl:inline-block"
                        >
                          {tl("Game finder")}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateHub({ kind: "items", query: `league=${encodeURIComponent(resolveLeagueSlug(region.leagues[0]))}` });
                          }}
                          className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden xl:inline-block"
                        >
                          {tl("Item history")}
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRegion(region.code);
                      }}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                        isFollowed
                          ? "bg-rw-accent text-rw-bg"
                          : "bg-rw-deep border border-rw-border text-rw-muted hover:text-rw-text"
                      }`}
                    >
                      {isFollowed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{isFollowed ? tl("Following") : tl("Follow")}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. LEAGUES SUB-TAB */}
      {tab === "leagues" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-rw-muted">
              {tl("Tracking all {n} global Riot leagues. Followed leagues appear in filtered schedules and live notifications.", { n: catalog.leagues.length || 51 })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={followAllLeagues}
                className="px-2.5 py-1 rounded bg-rw-panel border border-rw-accent text-rw-accent hover:bg-rw-accent hover:text-rw-bg font-semibold text-[11px] transition-colors"
              >
                {tl("Follow all ({n})", { n: catalog.leagues.length || 51 })}
              </button>
              <button
                onClick={unfollowAllLeagues}
                className="px-2.5 py-1 rounded bg-rw-panel border border-rw-border text-rw-muted hover:text-rw-red font-semibold text-[11px] transition-colors"
              >
                {tl("Unfollow All")}
              </button>
              <button
                onClick={followInternationalEvents}
                className="px-2.5 py-1 rounded bg-rw-panel border border-rw-teal text-rw-teal hover:bg-rw-teal hover:text-rw-bg font-semibold text-[11px] transition-colors"
              >
                {tl("★ International Events")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredLeagues.map((league) => {
              const isFollowed = settings.followedLeagues.includes(league.slug);

              return (
                <div
                  key={league.slug}
                  onClick={() => toggleLeague(league.slug)}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                    isFollowed
                      ? "bg-rw-surface border-rw-accent text-rw-text"
                      : "bg-rw-bg border-rw-border text-rw-muted hover:border-rw-muted"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateHub({ kind: "league", slug: resolveLeagueSlug(league.slug) });
                      }}
                      className="shrink-0 rounded hover:ring-1 hover:ring-rw-accent transition-all"
                      title={league.name}
                    >
                      {league.image && !brokenImgs[league.slug] ? (
                        <img
                          {...riotImg(league.image, 96)}
                          alt={league.name}
                          onError={() => setBrokenImgs((b) => ({ ...b, [league.slug]: true }))}
                          className="w-8 h-8 object-contain rounded bg-rw-deep p-0.5"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-rw-deep border border-rw-border flex items-center justify-center font-bold text-xs text-rw-teal">
                          <Trophy className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                    <div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateHub({ kind: "league", slug: resolveLeagueSlug(league.slug) });
                        }}
                        className="font-semibold text-xs text-rw-text hover:text-rw-accent hover:underline text-left transition-colors"
                      >
                        {league.name}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateHub({ kind: "leagues", ...(league.region ? { query: `q=${encodeURIComponent(league.region)}` } : {}) });
                        }}
                        className="text-[10px] text-rw-muted hover:text-rw-accent hover:underline uppercase block text-left"
                      >
                        {league.region ? regionName(league.region) : tl("Global")}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const lg = resolveLeagueSlug(league.slug);
                      const lgTeams = (catalog.teams || [])
                        .filter((t) => t.league && resolveLeagueSlug(t.league) === lg)
                        .slice(0, 2)
                        .map((t) => teamSlug(t.name, t.code))
                        .filter(Boolean);
                      return (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateHub({
                                kind: "rankings",
                                query: new URLSearchParams({
                                  league: lg,
                                  ...(lgTeams.length ? { q: lgTeams.join(",") } : {}),
                                }).toString(),
                              });
                            }}
                            className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden sm:inline-block"
                          >
                            {tl("Power rankings")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateHub({ kind: "tiers", query: `scope=${encodeURIComponent(lg)}&league=${encodeURIComponent(lg)}` });
                            }}
                            className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden md:inline-block"
                          >
                            {tl("Pro tier list")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateHub({
                                kind: "leaders",
                                query: new URLSearchParams({
                                  league: lg,
                                  ...(lgTeams.length ? { q: lgTeams.join(",") } : {}),
                                }).toString(),
                              });
                            }}
                            className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden lg:inline-block"
                          >
                            {tl("Player leaderboards")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateHub({
                                kind: "finder",
                                query: new URLSearchParams({
                                  league: lg,
                                  ...(lgTeams[0] ? { team: lgTeams[0] } : {}),
                                  ...(lgTeams[1] ? { vs: lgTeams[1] } : {}),
                                }).toString(),
                              });
                            }}
                            className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden xl:inline-block"
                          >
                            {tl("Game finder")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateHub({
                                kind: "items",
                                query: new URLSearchParams({
                                  league: lg,
                                  ...(lgTeams[0] ? { team: lgTeams[0] } : {}),
                                  ...(lgTeams[1] ? { vs: lgTeams[1] } : {}),
                                }).toString(),
                              });
                            }}
                            className="px-2 py-1 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-accent transition-colors hidden xl:inline-block"
                          >
                            {tl("Item history")}
                          </button>
                        </>
                      );
                    })()}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLeague(league.slug);
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        isFollowed
                          ? "bg-rw-accent text-rw-bg"
                          : "bg-rw-deep border border-rw-border text-rw-muted hover:text-rw-text"
                      }`}
                    >
                      {isFollowed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{isFollowed ? tl("Following") : tl("Follow")}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
