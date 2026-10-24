import React, { useState, useMemo } from "react";
import { AppSettings, CatalogData, CatalogTeam, PlayerEntry, League } from "../../types";
import { MAJOR_REGIONS, DEFAULT_FOLLOWED_REGIONS, POPULAR_PLAYERS, GLOBAL_LEAGUES } from "../../api";
import { Search, Check, Plus, X, Globe, User, Shield, Trophy, RefreshCw } from "lucide-react";
import { tl, tn, regionName, roleName } from "../../i18n";
import { IS_WEB } from "../../platform";
import { PushAlertsBanner } from "../PushAlerts";
import { CalendarFeed } from "../CalendarFeed";
import { searchAlias, isNonLatin } from "../../searchAliases";
import { mainPlayerEntries } from "../../helpers";
import { riotImg } from "../../riotImage";

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

  const q = search.trim().toLowerCase();
  // 페이커 -> faker, B站 -> bilibili: fans type names the way their community writes them
  const qs = searchAlias(search).trim().toLowerCase();

  // Filtered TEAMS: searches across all catalog.teams (~778 teams)
  const filteredTeams = useMemo(() => {
    const all = catalog.teams || [];
    if (!q) {
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
      .filter(
        (t) =>
          t.code.toLowerCase().includes(qs) ||
          t.name.toLowerCase().includes(qs) ||
          t.league.toLowerCase().includes(qs) ||
          t.region.toLowerCase().includes(qs) ||
          regionName(t.region).toLowerCase().includes(qs)
      )
      .slice(0, 100);
  }, [catalog.teams, settings.followedTeams, qs]);

  // Filtered PLAYERS: searches across all catalog.players (~4,634 players)
  const filteredPlayers = useMemo(() => {
    // A player Riot lists on a main roster and its academy shows once, with the main team
    const all = mainPlayerEntries(catalog.players || [], catalog.teams);
    if (!q) {
      // Show followed players first, then famous popular players
      const followed = all.filter((p) => settings.followedPlayers.includes(p.name));
      const popularNames = POPULAR_PLAYERS.map((p) => p.name.toLowerCase());
      const popular = all.filter((p) => popularNames.includes(p.name.toLowerCase()));
      const combined = [...followed, ...popular.filter((p) => !settings.followedPlayers.includes(p.name))];
      return combined.length > 0 ? combined.slice(0, 40) : all.slice(0, 40);
    }
    return all
      .filter(
        (p) =>
          p.name.toLowerCase().includes(qs) ||
          p.teamCode.toLowerCase().includes(qs) ||
          p.teamName.toLowerCase().includes(qs) ||
          p.role.toLowerCase().includes(qs) ||
          (p.realName && p.realName.toLowerCase().includes(qs))
      )
      .slice(0, 100);
  }, [catalog.players, catalog.teams, settings.followedPlayers, qs]);

  // Filtered REGIONS
  const filteredRegions = useMemo(() => {
    if (!q) return MAJOR_REGIONS;
    return MAJOR_REGIONS.filter(
      (r) =>
        r.name.toLowerCase().includes(qs) ||
        r.code.toLowerCase().includes(qs) ||
        regionName(r.code, r.name).toLowerCase().includes(qs) ||
        r.leagues.some((l) => l.toLowerCase().includes(qs))
    );
  }, [qs]);

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
    return all.filter(
      (l) =>
        l.name.toLowerCase().includes(qs) ||
        l.slug.toLowerCase().includes(qs) ||
        l.region.toLowerCase().includes(qs) ||
        regionName(l.region).toLowerCase().includes(qs)
    );
  }, [catalog.leagues, qs]);

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
      <div className="p-3 rounded-lg bg-rw-surface border border-rw-border space-y-2">
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

          {onRefreshCatalog && (
            <button
              onClick={onRefreshCatalog}
              disabled={isRefreshingCatalog}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-border text-[10px] text-rw-muted hover:text-rw-teal transition-colors"
              title={tl("Check Riot API for roster transfers, trades, and new leagues")}
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingCatalog ? "animate-spin text-rw-teal" : ""}`} />
              <span>{isRefreshingCatalog ? tl("Syncing directory…") : tl("Check roster updates")}</span>
            </button>
          )}
        </div>

        {/* Quick-remove chips */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {teamChips.map((code) => (
            <span
              key={`chip-t-${code}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-accent/40 text-rw-accent font-semibold text-[10px]"
            >
              <span>{code}</span>
              <button
                onClick={() => toggleTeam(code)}
                className="hover:text-white"
                title={tl("Remove from watchlist")}
                aria-label={tl("Stop following {name}", { name: code })}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {playerChips.map((name) => (
            <span
              key={`chip-p-${name}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-teal/40 text-rw-teal font-semibold text-[10px]"
            >
              <span>{name}</span>
              <button
                onClick={() => togglePlayer(name)}
                className="hover:text-white"
                title={tl("Remove from watchlist")}
                aria-label={tl("Stop following {name}", { name })}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {chipTotal > CHIP_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllChips((v) => !v)}
              className="inline-flex items-center px-2 py-0.5 rounded border border-rw-border text-rw-teal hover:border-rw-teal/60 text-[10px] font-semibold"
            >
              {showAllChips ? tl("Show fewer") : tl("Show all {n}", { n: chipTotal })}
            </button>
          )}

          {settings.followedRegions.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rw-bg border border-rw-muted/40 text-rw-text text-[10px]">
              <span>🌐 {tl("{n} Regions", { n: settings.followedRegions.length })}</span>
            </span>
          )}
        </div>
      </div>

      {IS_WEB && <PushAlertsBanner settings={settings} />}
      <CalendarFeed settings={settings} onOpenUrl={IS_WEB ? undefined : onOpenUrl} />

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
          <div className="flex items-center justify-between text-[11px] text-rw-muted">
            <span>
              {!q
                ? tl("Showing major pro teams ({shown} of {total}) · type above to search all teams", { shown: filteredTeams.length, total: catalog.teams.length })
                : tl('Found {n} teams matching "{q}"', { n: filteredTeams.length, q }) + (filteredTeams.length === 0 && isNonLatin(search) ? " · " + tl("Names here use English letters. Try the in-game name, like Faker or T1.") : "")}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredTeams.map((team) => {
              const isFollowed = settings.followedTeams.includes(team.code);
              const isExpanded = expandedTeamSlug === team.slug;
              // By slug: a team and its academy can share a code (LYON, Lyon Academy)
              const roster = (catalog.players || []).filter((p) =>
                p.teamSlug ? p.teamSlug === team.slug : p.teamCode === team.code
              );

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
                      {team.image ? (
                        <img
                          {...riotImg(team.image, 96)}
                          alt={team.code}
                          className="w-9 h-9 object-contain rounded bg-rw-deep p-0.5"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-rw-deep border border-rw-border flex items-center justify-center font-bold font-mono text-xs text-rw-accent">
                          {team.code.slice(0, 3)}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-xs text-rw-text">{team.name}</div>
                        <div className="text-[11px] text-rw-muted">
                          {team.league ? `${team.league} · ` : ""}
                          {team.code}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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
                      <div className="text-[10px] text-rw-muted mb-1">
                        {tn("Active roster ({n} player)", "Active roster ({n} players)", roster.length)}
                      </div>
                      {roster.map((p) => {
                        const isPlayerFollowed = settings.followedPlayers.includes(p.name);
                        return (
                          <div key={`${p.teamSlug || p.teamCode}-${p.name}`} className="flex items-center justify-between text-[11px] py-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono px-1.5 rounded bg-rw-deep text-rw-teal min-w-12 text-center whitespace-nowrap shrink-0">
                                {roleName(p.role)}
                              </span>
                              <span className="text-rw-text font-semibold">{p.name}</span>
                              {p.realName && <span className="text-rw-muted">({p.realName})</span>}
                            </div>
                            <button
                              onClick={() => togglePlayer(p.name)}
                              className={`text-[10px] font-semibold ${
                                isPlayerFollowed ? "text-rw-teal" : "text-rw-muted hover:text-rw-accent"
                              }`}
                            >
                              {isPlayerFollowed ? "★ " + tl("Following") : "☆ " + tl("Follow")}
                            </button>
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
          <div className="flex items-center justify-between text-[11px] text-rw-muted">
            <span>
              {!q
                ? tl("Showing top pro players ({shown} of {total}) · type above to search all registered pros", { shown: filteredPlayers.length, total: catalog.players.length })
                : tl('Found {n} players matching "{q}"', { n: filteredPlayers.length, q }) + (filteredPlayers.length === 0 && isNonLatin(search) ? " · " + tl("Names here use English letters. Try the in-game name, like Faker or T1.") : "")}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredPlayers.map((player) => {
              const isFollowed = settings.followedPlayers.includes(player.name);

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
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rw-deep border border-rw-border text-rw-teal min-w-14 text-center whitespace-nowrap shrink-0">
                      {roleName(player.role)}
                    </span>
                    <div>
                      <div className="font-bold text-xs text-rw-text flex items-center gap-1.5">
                        <span>{player.name}</span>
                        {player.realName && (
                          <span className="text-[10px] font-normal text-rw-muted">
                            · {player.realName}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-rw-muted">
                        {player.teamName} ({player.teamCode})
                      </div>
                    </div>
                  </div>

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
                className="px-2.5 py-1 rounded bg-rw-surface border border-rw-accent text-rw-accent hover:bg-rw-accent hover:text-rw-bg font-semibold text-[11px] transition-colors"
              >
                {tl("★ Follow All")}
              </button>
              <button
                onClick={unfollowAllRegions}
                className="px-2.5 py-1 rounded bg-rw-surface border border-rw-border text-rw-muted hover:text-rw-red font-semibold text-[11px] transition-colors"
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
                      <div className="font-bold text-xs text-rw-text">{regionName(region.code, region.name)}</div>
                      <div className="text-[10px] text-rw-muted">
                        {region.leagues.map((l) => tl(l)).join(" · ")}
                      </div>
                    </div>
                  </div>

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
                className="px-2.5 py-1 rounded bg-rw-surface border border-rw-accent text-rw-accent hover:bg-rw-accent hover:text-rw-bg font-semibold text-[11px] transition-colors"
              >
                {tl("Follow all ({n})", { n: catalog.leagues.length || 51 })}
              </button>
              <button
                onClick={unfollowAllLeagues}
                className="px-2.5 py-1 rounded bg-rw-surface border border-rw-border text-rw-muted hover:text-rw-red font-semibold text-[11px] transition-colors"
              >
                {tl("Unfollow All")}
              </button>
              <button
                onClick={followInternationalEvents}
                className="px-2.5 py-1 rounded bg-rw-surface border border-rw-teal text-rw-teal hover:bg-rw-teal hover:text-rw-bg font-semibold text-[11px] transition-colors"
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
                    {league.image ? (
                      <img
                        {...riotImg(league.image, 96)}
                        alt={league.name}
                        className="w-8 h-8 object-contain rounded bg-rw-deep p-0.5"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-rw-deep border border-rw-border flex items-center justify-center font-bold text-xs text-rw-teal">
                        <Trophy className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-xs text-rw-text">{league.name}</div>
                      <div className="text-[10px] text-rw-muted uppercase">{league.region ? regionName(league.region) : tl("Global")}</div>
                    </div>
                  </div>

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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
