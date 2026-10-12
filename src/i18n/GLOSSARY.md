# RiftWatch translations

Each language is one file in `locales/` (`es.json`, `ko.json`, ...). The left side is the English text
in the app, the right side is what that language shows. To fix a translation, change the right side only.

- Keep every `{placeholder}` exactly as written (`{team}`, `{n}`, `{time}`...). The app fills them in.
- `"one|other"` keys are plurals: write the singular, a `|`, then the plural. Languages without plurals
  (Korean, Chinese, Japanese, Vietnamese, Turkish) write one form with no `|`.
- `context::English` keys are the same English word used in a different place:
  `short tab::` = phone tab labels (must fit about 9 letters or 3 CJK characters), `role::` = player roles,
  `stage::` / `stage day::` = 24/7 schedule stages, `region::` = Riot region codes, `event::` = event names,
  `title winner::` / `title match::` = the winner and the final in the titles table.
- Team, player, league and tournament names come from Riot or Leaguepedia and are never translated.
  Riot sends its own translated stage names (8강, Cuartos de Final...) for the Schedule and Standings.
- `npm test` fails if any language is missing a text, has text the app no longer uses, or loses a
  `{placeholder}`. New English text in the code goes through `tl("...")` and then into every file.

Reports about wrong translations go to kyle.l.hoover@gmail.com (shown next to the language picker).

## Term choices

The goal is how fans and casters in each region actually talk, not dictionary words.

| | Worlds | Game in a series / series | Banger (S-tier classic) | Spoiler mode | Head-to-head | Roles (Top, Jungle, Mid, Bot, Support) |
|---|---|---|---|---|---|---|
| es | Mundial | Partida / Serie | Partidazo | Modo sin spoilers | Cara a cara | Top, Jungla, Mid, ADC, Support |
| pt-BR | Mundial | Partida (Jogo N) / Série | Jogaço | Modo anti-spoiler | Confronto direto | Topo, Caçador, Meio, Atirador, Suporte |
| ko | 롤드컵 | 세트 / 매치 | 명경기 | 스포 방지 모드 | 상대 전적 | 탑, 정글, 미드, 원딜, 서폿 |
| vi | CKTG | Ván / Loạt trận | Trận kinh điển | Chống spoil | Đối đầu | Đường trên, Đi rừng, Đường giữa, Xạ thủ, Hỗ trợ |
| zh-CN | 全球总决赛 (S赛) | 小局 / 大场, BO3 | 名局 | 防剧透模式 | 交手记录 | 上单, 打野, 中单, ADC, 辅助 |
| zh-TW | 世界大賽 | 小局 / 系列賽, BO3 | 名局 | 防雷模式 | 交手紀錄 | 上路, 打野, 中路, 下路, 輔助 |
| ja | Worlds | ゲーム / シリーズ, BO3 | 神試合 | ネタバレ防止モード | 対戦成績 | トップ, ジャングル, ミッド, ADC, サポート |
| fr | Worlds | Partie / Série, BO3 | Match de légende | Mode anti-spoil | Face-à-face | Top, Jungle, Mid, ADC, Support |
| de | Worlds | Spiel / Serie, Bo3 | Banger | Spoiler-Schutz | Direkter Vergleich | Top, Jungle, Mid, ADC, Support |
| tr | Worlds | Oyun / Seri, Bo3 | Efsane maç | Spoiler modu | Karşılaşma geçmişi | Üst, Orman, Orta, Nişancı, Destek |

Other choices worth knowing:

- **ko**: Bo3/Bo5 stay as Bo3/Bo5; Quarterfinals 8강, Semifinals 4강; Presence = 픽밴률; champion pool = 챔프폭;
  polite 해요체 for sentences.
- **zh-CN**: CS = 补刀, gold = 经济, baron = 大龙, dragon = 小龙, presence = BP 率, patch = 版本,
  First Stand = 先锋赛, ticker = 比分条, floating HUD = 悬浮窗.
- **zh-TW**: Taiwan wording, not converted Simplified: CS = 補兵, baron = 巴龍, system tray = 系統匣,
  follow = 追蹤, calendar = 行事曆, standings = 排名, Semifinals = 四強賽, spoilers = 防雷/暴雷.
- **ja**: です/ます for sentences; Presence = P/B率; system tray = タスクトレイ.
- **vi**: Worlds = CKTG; kills = Hạ gục; Presence = Tỉ lệ pick/cấm; Play-in = Vòng khởi động.
- **pt-BR**: kills = Abates; pick = pickado; schedule = Agenda; standings = Classificação; roster = Elenco.
- **es**: kills stay "kills"; pick = pickeado; roster = Plantilla; standings = Clasificación; tú form.
- **fr**: vous form; kills stay "kills"; roster stays "roster"; French spacing before ? ! : ; and inside « ».
- **de**: du form; kills/assists/picks stay English; roster = Kader; standings = Tabelle; system tray = Infobereich.
- **tr**: informal "sen"; text never glues a Turkish case ending onto a team or league name
  (writes "Takip et: {name}" instead of "{name}'i takip et"), so names of any shape read correctly.
- Windows SmartScreen buttons use Windows' own wording in each language (Más información / Ejecutar de todas
  formas, 추가 정보 / 실행, 更多信息 / 仍要运行, 詳細情報 / 実行, Weitere Informationen / Trotzdem ausführen...).
