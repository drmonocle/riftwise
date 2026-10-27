// The 404 page's search box starts with the words of the address that wasn't found (/player/fakerr -> "fakerr",
// /ko/team/t1-esport -> "t1 esport"), so one press of Search looks for it. A file of its own because the site's
// Content-Security-Policy allows no inline script; the page still works without it.
(function () {
  var box = document.querySelector('input[name="q"]');
  if (!box) return;
  var parts = location.pathname.split("/").filter(Boolean);
  var langs = { es: 1, "pt-br": 1, ko: 1, vi: 1, "zh-cn": 1, "zh-tw": 1, ja: 1, fr: 1, de: 1, tr: 1 };
  var kinds = { player: 1, team: 1, tournament: 1, match: 1, champion: 1, league: 1, stats: 1, schedule: 1, results: 1 };
  var words = "";
  for (var i = parts.length - 1; i >= 0 && !words; i--) {
    var p = parts[i];
    try {
      p = decodeURIComponent(p);
    } catch (e) {
      /* a broken %-escape: use it as it is */
    }
    p = p.replace(/\.(html?|php|aspx?|json|xml)$/i, "");
    var low = p.toLowerCase();
    if (kinds[low] || (i === 0 && langs[low]) || /^\d{4}$/.test(p)) continue;
    words = p.replace(/[-_+.]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  }
  if (!words) return;
  box.value = words;
  var note = document.getElementById("search-note");
  if (note) {
    note.textContent = "Search for “" + words + "”?";
    note.hidden = false;
  }
})();
