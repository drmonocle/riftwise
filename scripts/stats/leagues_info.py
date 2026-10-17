"""Short names and histories of pro leagues, for the Leagues page and league pages.

Leaguepedia names each league in full ("League of Legends Championship Series") and treats a renamed or merged
league as a new one, so the short names fans use and the lineage of the big leagues are kept here by hand.
Keys are Leaguepedia league names (lp_tournaments.League).
"""

SHORT = {
    # internationals
    "World Championship": "Worlds",
    "Mid-Season Invitational": "MSI",
    "First Stand": "FST",
    "Esports World Cup": "EWC",
    "Intel Extreme Masters": "IEM",
    # main leagues
    "Tencent LoL Pro League": "LPL",
    "LoL Champions Korea": "LCK",
    "LoL The Champions": "OGN Champions",
    "LoL EMEA Championship": "LEC",
    "Europe League Championship Series": "EU LCS",
    "League of Legends Championship Series": "LCS",
    "North America League Championship Series": "NA LCS",
    "League of Legends Championship of The Americas": "LTA",
    "League of Legends Championship of The Americas North": "LTA North",
    "League of Legends Championship of The Americas South": "LTA South",
    "Circuit Brazilian League of Legends": "CBLOL",
    "League of Legends Championship Pacific": "LCP",
    "Pacific Championship Series": "PCS",
    "LoL Master Series": "LMS",
    "Garena Premier League": "GPL",
    "Vietnam Championship Series": "VCS",
    "Vietnam Championship Series A": "VCSA",
    "LoL Japan League": "LJL",
    "Turkish Championship League": "TCL",
    "Oceanic Pro League": "OPL",
    "LoL Circuit Oceania": "LCO",
    "Liga Latinoamerica": "LLA",
    "Liga Latinoamérica Norte": "LLN",
    "Copa Latinoamérica Sur": "CLS",
    "Copa Latinoamérica Norte": "CLN",
    "LoL Continental League": "LCL",
    # second tier
    "LCK Challengers League": "LCK CL",
    "LoL Development League": "LDL",
    "LoL Secondary Pro League": "LSPL",
    "North American Challengers League": "NACL",
    "EMEA Masters": "EM",
    "La Ligue Française": "LFL",
    "Prime League Pro Division": "Prime League",
    "Liga Española de League of Legends": "LES",
    "Northern League of Legends Championship": "NLC",
    "Esports Balkan League": "EBL",
    "Hellenic Legends League": "HLL",
    "Circuito Desafiante": "CD",
    "Circuit Brazilian League of Legends Academy": "CBLOL Academy",
    "Rift Legends": "RL",
    "TransIP Road Of Legends": "ROL",
    "Hitpoint Masters": "HM",
    "LoL Italian Tournament": "LIT",
}

# How the big leagues were renamed or merged, oldest first: (league, years). A league can appear twice when it
# came back (LCS 2019-2024, LTA North in 2025, LCS again from 2026). Years None = the league's years in the data.
HISTORY = [
    [("North America League Championship Series", "2013–2018"),
     ("League of Legends Championship Series", "2019–2024"),
     ("League of Legends Championship of The Americas North", "2025"),
     ("League of Legends Championship Series", "2026–")],
    [("Circuit Brazilian League of Legends", "2012–2024"),
     ("League of Legends Championship of The Americas South", "2025"),
     ("Circuit Brazilian League of Legends", "2026–")],
    [("Copa Latinoamérica Norte", None),
     ("Liga Latinoamérica Norte", None),
     ("Copa Latinoamérica Sur", None),
     ("Liga Latinoamerica", "2019–2024"),
     ("League of Legends Championship of The Americas", "2025")],
    [("Europe League Championship Series", "2013–2018"),
     ("LoL EMEA Championship", "2019–")],
    [("LoL The Champions", "2012–2015"),
     ("LoL Champions Korea", "2015–")],
    [("Garena Premier League", "2012–2018"),
     ("LoL Master Series", "2014–2019"),
     ("Pacific Championship Series", "2020–2024"),
     ("League of Legends Championship Pacific", "2025–")],
    [("Oceanic Pro League", "2015–2020"),
     ("LoL Circuit Oceania", "2021–2024")],
]


def history_of(league):
    """The lineage this league belongs to, or None."""
    for chain in HISTORY:
        if any(name == league for name, _ in chain):
            return chain
    return None
