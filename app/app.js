(function () {
  "use strict";

  var COLS = 7;
  var ROWS = 3;
  var PAGE_SIZE = COLS * ROWS;
  var MAX_FAVORITES = 9;
  var FAVORITES_KEY = "cleantvhome.favorites.v1";
  var FIRST_RUN_KEY = "cleantvhome.initialized.v1";

  var favoritesEl = document.getElementById("favorites");
  var gridEl = document.getElementById("grid");
  var focusedNameEl = document.getElementById("focusedName");
  var focusedMetaEl = document.getElementById("focusedMeta");
  var favoriteCountEl = document.getElementById("favoriteCount");
  var pageInfoEl = document.getElementById("pageInfo");
  var toastEl = document.getElementById("toast");
  var diagEl = document.getElementById("diag");
  var diagBodyEl = document.getElementById("diagBody");

  var allApps = [];
  var favoriteIds = [];
  var favoriteApps = [];
  var pageApps = [];
  var section = "favorites";
  var focusIndex = 0;
  var page = 0;
  var lastFocusedTile = null;
  var toastTimer = null;
  var loading = false;

  /* Preferred order for this household: streaming apps first. Matching is
     intentionally loose because Samsung app names vary by region. */
  var preferredNames = [
    "netflix",
    "youtube tv",
    "youtube",
    "prime video",
    "peacock",
    "internet",
    "browser",
    "plex",
    "jellyfin"
  ];

  function safeText(v) { return v == null ? "" : String(v); }
  function lower(v) { return safeText(v).toLowerCase(); }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.className = "show";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ""; }, 2600);
  }

  function showDiag(message) {
    diagEl.hidden = false;
    diagBodyEl.textContent = message;
  }

  function hideDiag() { diagEl.hidden = true; }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function updateClock() {
    var d = new Date();
    var hh = ("0" + d.getHours()).slice(-2);
    var mm = ("0" + d.getMinutes()).slice(-2);
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    document.getElementById("clock").textContent = hh + ":" + mm;
    document.getElementById("date").textContent = days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();
  }

  function tizenContexts() {
    var contexts = [];
    try {
      if (typeof tizen !== "undefined" && tizen.application) {
        contexts.push({ name: "window", api: tizen.application });
      }
    } catch (e) {}
    try {
      if (window.parent && window.parent !== window &&
          window.parent.tizen && window.parent.tizen.application) {
        contexts.push({ name: "parent", api: window.parent.tizen.application });
      }
    } catch (e) {}
    try {
      if (window.top && window.top !== window &&
          window.top.tizen && window.top.tizen.application) {
        contexts.push({ name: "top", api: window.top.tizen.application });
      }
    } catch (e) {}
    return contexts;
  }

  function tizenApi() {
    var contexts = tizenContexts();
    for (var i = 0; i < contexts.length; i++) {
      if (typeof contexts[i].api.getAppsInfo === "function" &&
          typeof contexts[i].api.launch === "function") {
        return contexts[i].api;
      }
    }
    return null;
  }

  function apiReport() {
    var lines = [];
    lines.push("URL: " + safeText(location.href).slice(0, 120));
    lines.push("UA: " + safeText(navigator.userAgent).slice(0, 120));
    function probe(label, obj) {
      try {
        if (typeof obj === "undefined") return label + ": missing";
        var app = obj.application ? "app:" + (typeof obj.application.getAppsInfo === "function" ? "list-ok" : "no-list") +
          "/launch:" + (typeof obj.application.launch === "function" ? "ok" : "no-launch") : "no-application";
        return label + ": present, " + app;
      } catch (e) {
        return label + ": blocked (" + (e && e.message ? e.message : e) + ")";
      }
    }
    var parentTizen = null, topTizen = null;
    try { parentTizen = window.parent !== window ? window.parent.tizen : undefined; } catch (e) { parentTizen = "blocked"; }
    try { topTizen = window.top !== window ? window.top.tizen : undefined; } catch (e) { topTizen = "blocked"; }
    lines.push(probe("window.tizen", typeof tizen !== "undefined" ? tizen : undefined));
    lines.push(probe("parent.tizen", parentTizen === "blocked" ? undefined : parentTizen));
    lines.push(probe("top.tizen", topTizen === "blocked" ? undefined : topTizen));
    return lines.join("\n");
  }

  function initials(name) {
    var clean = safeText(name).replace(/[^a-zA-Z0-9 ]/g, " ");
    var parts = clean.split(/\s+/).filter(Boolean);
    var result = "";
    for (var i = 0; i < parts.length && result.length < 3; i++) {
      result += parts[i].charAt(0).toUpperCase();
    }
    return result || "APP";
  }

  function hasFavorite(id) { return favoriteIds.indexOf(id) !== -1; }

  function appendInitials(parent, name) {
    var fallback = document.createElement("div");
    fallback.className = "initials";
    fallback.textContent = initials(name);
    parent.appendChild(fallback);
  }

  function makeTile(info) {
    var tile = document.createElement("div");
    tile.className = "tile" + (hasFavorite(info.id) ? " favoriteMark" : "");
    tile.setAttribute("data-app-id", info.id);
    var iconWrap = document.createElement("div");
    iconWrap.className = "iconWrap";
    if (info.iconPath) {
      var img = document.createElement("img");
      img.alt = "";
      img.src = info.iconPath;
      img.onerror = function () {
        if (img.parentNode) img.parentNode.removeChild(img);
        appendInitials(iconWrap, info.name);
      };
      iconWrap.appendChild(img);
    } else {
      appendInitials(iconWrap, info.name);
    }
    var label = document.createElement("div");
    label.className = "label";
    label.textContent = info.name;
    tile.appendChild(iconWrap);
    tile.appendChild(label);
    return tile;
  }

  function currentApp() {
    if (section === "favorites") return favoriteApps[focusIndex] || null;
    return pageApps[focusIndex] || null;
  }

  function currentTiles() {
    return section === "favorites" ? favoritesEl.children : gridEl.children;
  }

  function renderFavorites() {
    favoritesEl.innerHTML = "";
    favoriteApps = [];
    var i, j;
    for (i = 0; i < favoriteIds.length; i++) {
      for (j = 0; j < allApps.length; j++) {
        if (allApps[j].id === favoriteIds[i]) { favoriteApps.push(allApps[j]); break; }
      }
    }
    if (favoriteApps.length !== favoriteIds.length) {
      favoriteIds = favoriteApps.map(function (a) { return a.id; });
      writeJson(FAVORITES_KEY, favoriteIds);
    }
    if (!favoriteApps.length) {
      var empty = document.createElement("div");
      empty.className = "emptyFavorites";
      empty.textContent = "Pick an app below, then press the GREEN button to pin it here";
      favoritesEl.appendChild(empty);
    } else {
      for (i = 0; i < favoriteApps.length; i++) favoritesEl.appendChild(makeTile(favoriteApps[i]));
    }
    favoriteCountEl.textContent = favoriteApps.length + "/" + MAX_FAVORITES;
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    var count = Math.max(1, Math.ceil(allApps.length / PAGE_SIZE));
    if (page >= count) page = count - 1;
    if (page < 0) page = 0;
    var start = page * PAGE_SIZE;
    pageApps = allApps.slice(start, start + PAGE_SIZE);
    for (var i = 0; i < pageApps.length; i++) gridEl.appendChild(makeTile(pageApps[i]));
    pageInfoEl.textContent = allApps.length + " apps \u00b7 Page " + (page + 1) + "/" + count;
  }

  function normalizeFocus() {
    var list = section === "favorites" ? favoriteApps : pageApps;
    if (section === "favorites" && !favoriteApps.length) { section = "grid"; focusIndex = 0; list = pageApps; }
    if (!list.length) { focusIndex = 0; return; }
    if (focusIndex < 0) focusIndex = 0;
    if (focusIndex >= list.length) focusIndex = list.length - 1;
  }

  function applyFocus() {
    if (lastFocusedTile) { lastFocusedTile.classList.remove("focused"); lastFocusedTile = null; }
    normalizeFocus();
    var app = currentApp();
    var tiles = currentTiles();
    if (!app) {
      focusedNameEl.textContent = allApps.length ? "Select an app" : "No apps found";
      focusedMetaEl.textContent = "";
      return;
    }
    if (tiles[focusIndex] && tiles[focusIndex].classList.contains("tile")) {
      lastFocusedTile = tiles[focusIndex];
      lastFocusedTile.classList.add("focused");
    }
    focusedNameEl.textContent = app.name;
    focusedMetaEl.textContent = (section === "favorites" ? "Favorite" : "All apps") +
      " \u00b7 " + (hasFavorite(app.id) ? "Pinned" : "Not pinned");
  }

  function renderAll(keepFocusId) {
    renderFavorites();
    renderGrid();
    if (keepFocusId) {
      var list = section === "favorites" ? favoriteApps : pageApps;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === keepFocusId) { focusIndex = i; break; }
      }
    }
    normalizeFocus();
    applyFocus();
  }

  function scoreApp(name) {
    var n = lower(name);
    for (var i = 0; i < preferredNames.length; i++) {
      if (n.indexOf(preferredNames[i]) !== -1) return i;
    }
    return preferredNames.length + 1;
  }

  function defaultFavorites() {
    var ranked = allApps.slice().sort(function (a, b) {
      var sa = scoreApp(a.name), sb = scoreApp(b.name);
      if (sa !== sb) return sa - sb;
      return lower(a.name) < lower(b.name) ? -1 : 1;
    });
    return ranked.slice(0, 5).map(function (a) { return a.id; });
  }

  function ensureFavorites() {
    var initialized = false;
    try { initialized = localStorage.getItem(FIRST_RUN_KEY) === "1"; } catch (e) {}
    if (!initialized) {
      favoriteIds = defaultFavorites();
      writeJson(FAVORITES_KEY, favoriteIds);
      try { localStorage.setItem(FIRST_RUN_KEY, "1"); } catch (e2) {}
    } else {
      favoriteIds = readJson(FAVORITES_KEY, []);
      if (!favoriteIds || typeof favoriteIds.length !== "number") favoriteIds = [];
      favoriteIds = favoriteIds.slice(0, MAX_FAVORITES);
    }
  }

  function toggleFavorite() {
    var app = currentApp();
    if (!app) return;
    if (hasFavorite(app.id)) {
      favoriteIds = favoriteIds.filter(function (id) { return id !== app.id; });
      writeJson(FAVORITES_KEY, favoriteIds);
      toast("Unpinned " + app.name);
      renderAll(section === "favorites" ? null : app.id);
      return;
    }
    if (favoriteIds.length >= MAX_FAVORITES) { toast("Favorites are full (" + MAX_FAVORITES + ")"); return; }
    favoriteIds.push(app.id);
    writeJson(FAVORITES_KEY, favoriteIds);
    toast("Pinned " + app.name);
    renderAll(app.id);
  }

  function launchCurrent() {
    var app = currentApp();
    if (!app) return;
    var api = tizenApi();
    if (api) {
      try {
        api.launch(app.id, function () {}, function () { launchViaRelay(app); });
        return;
      } catch (e) { /* fall through to relay */ }
    }
    launchViaRelay(app);
    if (!api) {
      showDiag("Launch API unavailable.\n" + apiReport() + "\nOpen this module from inside TizenBrew on the TV, not a desktop browser.\nIf you ARE on the TV, press Yellow to retry after the page finishes loading.");
      toast("Cannot open " + app.name + " here");
      return;
    }
    try {
      api.launch(app.id, function () {}, function (err) {
        var detail = err && (err.message || err.name) ? " (" + (err.message || err.name) + ")" : "";
        showDiag("The TV refused to open " + app.name + detail + ".\nApp ID: " + app.id);
        toast("Could not open " + app.name);
      });
    } catch (e) {
      showDiag("Launch threw: " + (e && e.message ? e.message : e) + "\nApp ID: " + app.id);
      toast("Could not open " + app.name);
    }
  }

  function pageCount() { return Math.max(1, Math.ceil(allApps.length / PAGE_SIZE)); }
  function changePage(delta) {
    var next = page + delta;
    if (next < 0 || next >= pageCount()) return;
    page = next;
    section = "grid";
    focusIndex = 0;
    renderGrid();
    applyFocus();
  }

  function moveLeft() {
    if (section === "favorites") { if (focusIndex > 0) focusIndex--; }
    else if (focusIndex % COLS > 0) focusIndex--;
    applyFocus();
  }
  function moveRight() {
    var list = section === "favorites" ? favoriteApps : pageApps;
    if (section === "favorites") { if (focusIndex + 1 < list.length) focusIndex++; }
    else if (focusIndex % COLS < COLS - 1 && focusIndex + 1 < list.length) focusIndex++;
    applyFocus();
  }
  function moveDown() {
    if (section === "favorites") {
      section = "grid";
      focusIndex = Math.min(focusIndex, Math.max(0, pageApps.length - 1));
    } else if (focusIndex + COLS < pageApps.length) focusIndex += COLS;
    applyFocus();
  }
  function moveUp() {
    if (section === "grid") {
      var target = focusIndex - COLS;
      if (target >= 0) focusIndex = target;
      else if (favoriteApps.length) {
        section = "favorites";
        focusIndex = Math.min(focusIndex % COLS, favoriteApps.length - 1);
      }
    }
    applyFocus();
  }

  function goBack() {
    try {
      if (window.history && history.length > 1) { history.back(); return; }
    } catch (e) {}
    try {
      var exitApi = tizenApi();
      if (exitApi) exitApi.getCurrentApplication().exit();
    } catch (e2) {}
  }

  function isLikelyHiddenSystemApp(app) {
    var name = lower(app.name);
    var id = lower(app.id);
    if (!name) return true;
    if (name.indexOf("com.") === 0) return true;
    if ((name.indexOf("service") !== -1 || name.indexOf("daemon") !== -1) &&
        (id.indexOf("service") !== -1 || id.indexOf("daemon") !== -1)) return true;
    return false;
  }

  function normalizeApps(apps) {
    var currentId = "";
    try {
      var currentApi = tizenApi();
      if (currentApi) currentId = currentApi.getCurrentApplication().appInfo.id;
    } catch (e) {}
    var seen = {};
    var out = [];
    for (var i = 0; i < apps.length; i++) {
      var app = apps[i];
      if (!app || !app.id || app.id === currentId) continue;
      if (app.show === false) continue;
      if (seen[app.id]) continue;
      var info = {
        id: String(app.id),
        name: String(app.name || app.id),
        iconPath: app.iconPath ? String(app.iconPath) : "",
        packageId: app.packageId ? String(app.packageId) : ""
      };
      if (isLikelyHiddenSystemApp(info)) continue;
      seen[info.id] = true;
      out.push(info);
    }
    out.sort(function (a, b) {
      var sa = scoreApp(a.name), sb = scoreApp(b.name);
      if (sa !== sb) return sa - sb;
      var aa = lower(a.name), bb = lower(b.name);
      return aa < bb ? -1 : aa > bb ? 1 : 0;
    });
    return out;
  }

  var REAL_APPS = [
  {
    "id": "org.tizen.netflix-app",
    "name": "Netflix"
  },
  {
    "id": "org.tizen.primevideo",
    "name": "Prime Video"
  },
  {
    "id": "MCmYXNxgcu.DisneyPlus",
    "name": "Disney+"
  },
  {
    "id": "LBUAQX1exg.Hulu",
    "name": "Hulu"
  },
  {
    "id": "com.samsung.tv.aria-video",
    "name": "Apple TV"
  },
  {
    "id": "gzcc4LRFBF.Peacock",
    "name": "Peacock TV"
  },
  {
    "id": "ZmmGjO6VKO.slingtv",
    "name": "Sling TV"
  },
  {
    "id": "9Ur5IzDKqV.TizenYouTube",
    "name": "YouTube"
  },
  {
    "id": "com.samsung.tv.gallery",
    "name": "Gallery"
  },
  {
    "id": "org.tizen.browser",
    "name": "Internet"
  },
  {
    "id": "zigzSWa1hy.InstagramAirwave",
    "name": "Instagram"
  },
  {
    "id": "3KA0pm7a7V.TubiTV",
    "name": "Tubi - Free Movies \uff06 TV"
  },
  {
    "id": "niYSnzL6h1.Viaplay",
    "name": "Viaplay"
  },
  {
    "id": "9FhM0cODbY.TikTokTV",
    "name": "TikTok"
  },
  {
    "id": "jAfAs7yVDX.TheSix",
    "name": "Samsung GameBreaks"
  },
  {
    "id": "HupEmjIB4I.Glance",
    "name": "Glance"
  },
  {
    "id": "yL49PNFmjW.PromotionApp",
    "name": "Samsung Promotion"
  },
  {
    "id": "rJeHak5zRg.Spotify",
    "name": "Spotify - Music and Podcasts"
  },
  {
    "id": "OzNoIbpz56.emanual",
    "name": "e-Manual"
  },
  {
    "id": "hUYPDiL96N.HGTV",
    "name": "HGTV GO - Stream Live TV"
  },
  {
    "id": "B4dkfbx22b.SHOWTIME",
    "name": "SHOWTIME"
  },
  {
    "id": "4ovn894vo9.Facebook",
    "name": "Facebook Watch"
  },
  {
    "id": "org.tizen.apple.apple-music",
    "name": "Apple Music"
  },
  {
    "id": "tCyZuSsCVw.Britbox",
    "name": "BritBox by BBC"
  },
  {
    "id": "PvWgqxV3Xa.YouTubeTV",
    "name": "YouTube TV"
  },
  {
    "id": "aaPBCyRqwB.FoxDeltaWebApp",
    "name": "FOX Sports: Watch Games, Shows, Highlights"
  },
  {
    "id": "kk8MbItQ0H.VUDU",
    "name": "Fandango"
  },
  {
    "id": "LImG0QPABV.QXHMarketplace",
    "name": "QVC+ and HSN+"
  },
  {
    "id": "cj37Ni3qXM.HBONow",
    "name": "HBO Max"
  },
  {
    "id": "rJyOSqC6Up.CBSAllAccess",
    "name": "Paramount+"
  },
  {
    "id": "XtU8fQk2gN.ESPN",
    "name": "ESPN"
  }
];

  var RELAY_BASE = "http://10.0.0.58:8799";

  function demoApps() { return REAL_APPS.slice(); }

  function launchViaRelay(app, onDone) {
    var url = RELAY_BASE + "/launch?appid=" + encodeURIComponent(app.id);
    try {
      fetch(url).then(function (res) { return res.json(); }).then(function (data) {
        if (data && data.ok) { hideDiag(); toast("Opening " + app.name); }
        else {
          showDiag("The relay refused to open " + app.name + ".\n" +
            (data && data.error ? data.error : "Unknown relay error.") +
            "\nMake sure relay.py is running on the laptop and Host PC IP is 10.0.0.58.");
          toast("Could not open " + app.name);
        }
        if (onDone) onDone();
      }).catch(function (err) {
        showDiag("Could not reach the laptop relay.\n" +
          "Start relay.py on the laptop, keep the TV and laptop on the same Wi-Fi, " +
          "and set the TV's Host PC IP to 10.0.0.58.\n" +
          "Tried: " + url + "\n" + (err && err.message ? err.message : err));
        toast("Relay unreachable");
        if (onDone) onDone();
      });
    } catch (e) {
      showDiag("Launch failed before contacting the relay: " + (e && e.message ? e.message : e));
      if (onDone) onDone();
    }
  }

  function loadApps(showMessage) {
    if (loading) return;
    loading = true;
    focusedNameEl.textContent = "Reading apps\u2026";
    focusedMetaEl.textContent = "";
    hideDiag();
    allApps = REAL_APPS.slice();
    allApps.sort(function (a, b) {
      var sa = scoreApp(a.name), sb = scoreApp(b.name);
      if (sa !== sb) return sa - sb;
      var aa = lower(a.name), bb = lower(b.name);
      return aa < bb ? -1 : aa > bb ? 1 : 0;
    });
    ensureFavorites();
    if (page >= pageCount()) page = pageCount() - 1;
    renderAll(false);
    loading = false;
    if (showMessage) toast("Refreshed " + allApps.length + " apps");
    focusedMetaEl.textContent = "Your installed apps \u00b7 relay launch";
  }

  function onKey(e) {
    var code = e.keyCode || e.which;
    if (code === 37) moveLeft();
    else if (code === 39) moveRight();
    else if (code === 38) moveUp();
    else if (code === 40) moveDown();
    else if (code === 13) launchCurrent();
    else if (code === 10009 || code === 27) goBack();
    else if (code === 403) changePage(-1);
    else if (code === 404) toggleFavorite();
    else if (code === 405) loadApps(true);
    else if (code === 406) changePage(1);
    else return;
    if (e.preventDefault) e.preventDefault();
  }

  updateClock();
  setInterval(updateClock, 30000);
  document.addEventListener("keydown", onKey, false);
  loadApps(false);
})();
