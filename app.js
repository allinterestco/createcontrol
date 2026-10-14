/* CreateControl UI. Plain JavaScript, no build step. Logic lives in core.js. */
(function () {
  'use strict';

  var KEY = 'createcontrol.v1';

  // Paste your donation page link here (for example a Ko-fi page). Leave empty to show the card without a button.
  var DONATION_URL = '';
  var DONATION_LABEL = 'Suggested: $12 CAD once a year';

  var STAGES = CC.STAGES, TOOLS = CC.TOOLS;
  var state = load();
  var ui = { tab: 'plan', days: 14, confirm: null };
  var toastTimer = null, lastUndo = null;

  /* ---------- storage ---------- */
  function load() {
    var d = CC.defaultState();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return d;
      return normalize(JSON.parse(raw), d);
    } catch (e) { return d; }
  }
  function normalize(s, d) {
    if (!s || s.v !== 1 || !s.settings || !Array.isArray(s.queue)) return d;
    var st = s.settings;
    st.days = Array.isArray(st.days) && st.days.length === 7 ? st.days : d.settings.days;
    st.leadDays = Number.isFinite(Number(st.leadDays)) ? Number(st.leadDays) : d.settings.leadDays;
    st.startTime = st.startTime || d.settings.startTime;
    st.stageMins = {
      long: Object.assign({}, d.settings.stageMins.long, (st.stageMins || {}).long),
      short: Object.assign({}, d.settings.stageMins.short, (st.stageMins || {}).short)
    };
    st.toolUrls = st.toolUrls || {};
    s.queue.forEach(function (v) {
      v.done = v.done || {};
      v.format = v.format === 'short' ? 'short' : 'long';
      v.title = String(v.title || 'Untitled video');
    });
    s.nextId = Number(s.nextId) || s.queue.length + 1;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() { return CC.startOfDay(new Date()); }
  function dayLabel(d) {
    var t = today(), diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function shortDate(d) { return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }); }
  function toolUrl(id) { return (state.settings.toolUrls[id] || '').trim() || TOOLS[id].url; }
  function stageById(id) { return STAGES.filter(function (s) { return s.id === id; })[0]; }
  function videoById(id) { return state.queue.filter(function (v) { return v.id === id; })[0]; }
  function toolChips(ids) {
    return ids.map(function (t) {
      var hint = TOOLS[t].hint ? ' title="' + esc(TOOLS[t].hint) + '"' : '';
      return '<a class="chip" href="' + esc(toolUrl(t)) + '" target="_blank" rel="noopener"' + hint + '>' + esc(TOOLS[t].name) + '</a>';
    }).join('');
  }
  function changed() { save(); render(); }

  function toast(msg, undo) {
    var host = document.getElementById('toast-host');
    clearTimeout(toastTimer);
    lastUndo = undo || null;
    host.innerHTML = '<div class="toast" role="status"><span>' + esc(msg) + '</span>' +
      (undo ? '<button type="button" data-act="undo">Undo</button>' : '') + '</div>';
    toastTimer = setTimeout(function () { host.innerHTML = ''; lastUndo = null; }, 5000);
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? 'Copied' : 'Press and hold the text to copy it');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, fallback);
    } else fallback();
  }

  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- views ---------- */
  var ICONS = {
    plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    videos: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/></svg>',
    tools: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    setup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="17" r="2" fill="var(--surface)"/></svg>'
  };
  var TABS = [['plan', 'Plan'], ['videos', 'Videos'], ['tools', 'Tools'], ['setup', 'Setup']];

  function renderNav() {
    document.getElementById('nav').innerHTML = TABS.map(function (t) {
      return '<button type="button" data-act="tab" data-tab="' + t[0] + '"' + (ui.tab === t[0] ? ' aria-current="page"' : '') + '>' + ICONS[t[0]] + t[1] + '</button>';
    }).join('');
  }

  function readouts(plan) {
    var t = today(), weekEnd = CC.addDays(t, 7);
    var weekMin = plan.blocks.filter(function (b) { return b.date < weekEnd; })
      .reduce(function (a, b) { return a + b.minutes; }, 0);
    var next = plan.videos.filter(function (v) { return v.publishDate; })[0];
    var late = plan.videos.filter(function (v) { return v.late || v.unscheduled; }).length;
    return '<div class="readouts">' +
      '<div class="readout"><div class="k">Work, next 7 days</div><div class="v mono">' + CC.fmtMin(weekMin) + '</div></div>' +
      '<div class="readout"><div class="k">Next publish</div><div class="v">' + (next ? esc(dayLabel(next.publishDate)) : 'None') + '</div>' +
        '<div class="s">' + (next ? esc(next.video.title) : 'Add a video') + '</div></div>' +
      '<div class="readout ' + (late ? 'late' : 'good') + '"><div class="k">Schedule</div><div class="v">' + (late ? late + ' late' : 'On track') + '</div></div>' +
      '</div>';
  }

  function capacityNote() {
    var c = CC.capacityInfo(state);
    var per = CC.fmtMin(c.perVideoMin), wk = CC.fmtMin(c.weeklyMin);
    var n = Math.round(c.supported * 10) / 10;
    if (c.ok) {
      return '<div class="note"><strong>Your hours cover your goal.</strong> You have ' + wk + ' a week and a video takes about ' + per +
        '. That supports roughly ' + n + ' video' + (n === 1 ? '' : 's') + ' a week, and you aim for ' + c.target + '.</div>';
    }
    return '<div class="note warn"><strong>Your goal is bigger than your hours.</strong> You have ' + wk + ' a week and a video takes about ' + per +
      '. That supports roughly ' + n + ' a week, but you aim for ' + c.target + '. Add time in Setup, shorten stages, or publish less often. Until then, some videos will show as late.</div>';
  }

  function renderPlan() {
    var plan = CC.buildPlan(state, new Date());
    var html = '';
    if (plan.error === 'no-publish-day') {
      return '<div class="note warn"><strong>Pick at least one publish day.</strong> Open Setup and tick the days you want a video to go live.</div>';
    }
    if (plan.error === 'no-time') {
      return '<div class="note warn"><strong>Add some work time.</strong> Open Setup and enter how many minutes you can work on each day.</div>';
    }
    html += readouts(plan) + capacityNote();

    if (!plan.videos.length) {
      return html + '<div class="note">No videos in your queue yet. Add one in the Videos tab and the schedule appears here.</div>';
    }

    // group by date
    var titleOf = {};
    state.queue.forEach(function (v) { titleOf[v.id] = v.title; });
    var groups = {}, t = today();
    plan.blocks.forEach(function (b) { var k = CC.ymd(b.date); (groups[k] = groups[k] || { date: b.date, blocks: [], pubs: [] }).blocks.push(b); });
    plan.videos.forEach(function (pv) {
      if (!pv.publishDate) return;
      var k = CC.ymd(pv.publishDate);
      (groups[k] = groups[k] || { date: pv.publishDate, blocks: [], pubs: [] }).pubs.push(pv);
    });
    var limit = CC.addDays(t, ui.days);
    var keys = Object.keys(groups).sort().filter(function (k) { return groups[k].date < limit; });
    var startMin = CC.parseClock(state.settings.startTime);
    var hasMore = Object.keys(groups).some(function (k) { return groups[k].date >= limit; });

    html += '<div class="row"><h2 class="sec-h">Cue sheet</h2></div>';
    if (!keys.length) html += '<div class="note">Nothing scheduled in the next ' + ui.days + ' days.</div>';

    keys.forEach(function (k) {
      var g = groups[k], off = 0;
      var total = g.blocks.reduce(function (a, b) { return a + b.minutes; }, 0);
      var isToday = g.date.getTime() === t.getTime();
      html += '<section class="day' + (isToday ? ' today' : '') + '"><div class="day-h"><h3>' + esc(dayLabel(g.date)) + '</h3>' +
        '<span class="mono">' + (total ? CC.fmtMin(total) + ' planned' : 'publish day') + '</span></div>';
      g.blocks.forEach(function (b) {
        var st = stageById(b.stage);
        var from = startMin + off; off += b.minutes;
        var last = b.part === b.parts;
        html += '<div class="block">' +
          (last
            ? '<button type="button" class="check" data-act="done" data-vid="' + esc(b.videoId) + '" data-stage="' + b.stage + '" aria-label="Mark ' + esc(st.name) + ' done"></button>'
            : '<span class="check partial" title="Tick the last part to finish this stage"></span>') +
          '<div class="b-main"><div class="b-title">' + esc(st.name) + ' <span class="b-vid">' + esc(titleOf[b.videoId] || '') + '</span></div>' +
          '<div class="b-meta"><span class="mono">' + CC.fmtClock(from) + ' to ' + CC.fmtClock(from + b.minutes) + '</span><span class="mono">' + CC.fmtMin(b.minutes) + '</span>' +
          (b.parts > 1 ? '<span class="tag">Part ' + b.part + ' of ' + b.parts + '</span>' : '') + '</div>' +
          '<div class="b-meta">' + toolChips(st.tools) + '</div></div></div>';
      });
      g.pubs.forEach(function (pv) {
        html += '<div class="block pub' + (pv.late ? ' late' : '') + '"><span class="pub-flag">Publish</span><div class="b-main"><div class="b-title">' + esc(pv.video.title) + '</div>' +
          (pv.late ? '<div class="b-meta">Moved from ' + esc(shortDate(pv.targetDate)) + ' because the work will not fit before then.</div>' : '') + '</div></div>';
      });
      html += '</section>';
    });

    if (hasMore) html += '<button type="button" class="btn" data-act="more">Show 14 more days</button>';
    html += '<div class="row"><button type="button" class="btn primary" data-act="ics">Add to my calendar (.ics)</button></div>' +
      '<p class="sec-sub">Downloads a calendar file with every work block at ' + CC.fmtClock(startMin) + ' on its day, plus all-day publish dates. Open it on your phone to add the events. Download it again after you change the plan.</p>';
    return html;
  }

  function renderVideos() {
    var plan = CC.buildPlan(state, new Date());
    var info = {};
    plan.videos.forEach(function (pv) { info[pv.video.id] = pv; });
    var html = '<div class="panel"><h2 class="sec-h">Add a video</h2>' +
      '<div class="row"><input type="text" id="new-title" placeholder="Working title" aria-label="Working title" style="flex:1 1 12rem">' +
      '<select id="new-format" aria-label="Format" style="width:auto"><option value="long">Long video</option><option value="short">Short</option></select>' +
      '<button type="button" class="btn primary" data-act="add">Add</button></div></div>';

    var active = state.queue.filter(function (v) { return !v.published; });
    var published = state.queue.filter(function (v) { return v.published; });
    html += '<h2 class="sec-h">Queue</h2>';
    if (!active.length) html += '<div class="note">Your queue is empty. Add the next idea above.</div>';

    active.forEach(function (v) {
      var pv = info[v.id];
      var total = CC.videoMinutes(state, v);
      var done = STAGES.reduce(function (a, s) { return a + (v.done[s.id] ? CC.stageMinutes(state, v, s.id) : 0); }, 0);
      var pct = total ? Math.round(done / total * 100) : 0;
      var allDone = STAGES.every(function (s) { return !CC.stageMinutes(state, v, s.id) || v.done[s.id]; });
      html += '<article class="panel vcard"><div class="vtop">' +
        '<input type="text" data-field="title" data-vid="' + esc(v.id) + '" value="' + esc(v.title) + '" aria-label="Video title">' +
        '<select data-field="format" data-vid="' + esc(v.id) + '" aria-label="Format" style="width:auto"><option value="long"' + (v.format === 'long' ? ' selected' : '') + '>Long video</option><option value="short"' + (v.format === 'short' ? ' selected' : '') + '>Short</option></select></div>' +
        '<div class="row">' +
        (pv && pv.publishDate ? '<span class="tag ' + (pv.late ? 'late' : 'good') + '">Publishes ' + esc(dayLabel(pv.publishDate)) + (pv.late ? ' (late)' : '') + '</span>' : '<span class="tag late">No date found</span>') +
        '<span class="mono muted" style="font-size:.8rem">' + CC.fmtMin(done) + ' of ' + CC.fmtMin(total) + ' done</span></div>' +
        '<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progress"><span style="width:' + pct + '%"></span></div>' +
        '<div class="stages">' + STAGES.filter(function (s) { return CC.stageMinutes(state, v, s.id); }).map(function (s) {
          return '<button type="button" class="stage-chip" data-act="toggle-stage" data-vid="' + esc(v.id) + '" data-stage="' + s.id + '" aria-pressed="' + (v.done[s.id] ? 'true' : 'false') + '"><span>' + esc(s.name) + '</span><span class="mono">' + CC.fmtMin(CC.stageMinutes(state, v, s.id)) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="row">' +
        '<button type="button" class="btn small' + (allDone ? ' primary' : '') + '" data-act="publish" data-vid="' + esc(v.id) + '">Mark published</button>' +
        '<button type="button" class="btn small danger" data-act="delete" data-vid="' + esc(v.id) + '">' + (ui.confirm === v.id ? 'Tap again to delete' : 'Delete') + '</button></div></article>';
    });

    if (published.length) {
      html += '<h2 class="sec-h">Published</h2><div class="panel">' + published.map(function (v) {
        return '<div class="row" style="justify-content:space-between"><span>' + esc(v.title) + '</span><button type="button" class="btn small" data-act="unpublish" data-vid="' + esc(v.id) + '">Back to queue</button></div>';
      }).join('') + '</div>';
    }
    return html;
  }

  function nextTitle() {
    var v = state.queue.filter(function (x) { return !x.published; })[0];
    return v ? v.title : 'my next video';
  }

  function renderTools() {
    var title = nextTitle();
    var prompts = [
      ['Hook ideas', 'Give me 10 hook lines for a video titled "' + title + '". Keep each under 12 words. Make them direct and friendly.'],
      ['Script outline', 'Turn this idea into a script for "' + title + '". Use a hook, three short beats, and a clear closing line. Write in short spoken sentences.'],
      ['Title and caption', 'Write 5 title options, a 2-line description, and 5 hashtags for a video called "' + title + '".']
    ];
    var html = '<div><h2 class="sec-h">Launch pad</h2><p class="sec-sub">One tap to the app you need for each stage. Change any link in Setup.</p></div>';
    STAGES.forEach(function (s) {
      html += '<section class="panel tool-stage"><h3 class="sec-h" style="font-size:1.05rem">' + esc(s.name) + '</h3><p>' + esc(s.tip) + '</p><div class="row">' + toolChips(s.tools) + '</div></section>';
    });
    html += '<section class="panel tool-stage"><h3 class="sec-h" style="font-size:1.05rem">Research and code</h3><p>Check trends, and open the project that holds this tool.</p><div class="row">' + toolChips(['youtube', 'github']) + '</div></section>';
    html += '<div><h2 class="sec-h">Prompt starters</h2><p class="sec-sub">Written for "' + esc(title) + '". Copy one into Claude or ChatGPT.</p></div>';
    prompts.forEach(function (p, i) {
      html += '<section class="panel prompt"><h3 class="sec-h" style="font-size:1.05rem">' + esc(p[0]) + '</h3><pre id="prompt-' + i + '">' + esc(p[1]) + '</pre>' +
        '<div class="row"><button type="button" class="btn small" data-act="copy" data-i="' + i + '">Copy</button></div></section>';
    });
    return html;
  }

  function renderSetup() {
    var S = state.settings;
    var order = [1, 2, 3, 4, 5, 6, 0]; // Monday first
    var html = '<div class="panel"><h2 class="sec-h">Your week</h2><p class="sec-sub">Enter the minutes you can really give each day. Zero means a day off. Tick the days a video should go live.</p>' +
      '<div class="grid-days"><span class="hd">Day</span><span class="hd">Minutes</span><span class="hd" style="text-align:center">Publish</span>' +
      order.map(function (i) {
        return '<label for="min-' + i + '">' + CC.DAY_NAMES[i] + '</label>' +
          '<input type="number" id="min-' + i + '" inputmode="numeric" min="0" max="720" step="15" value="' + (Number(S.days[i].min) || 0) + '" data-field="day-min" data-day="' + i + '">' +
          '<span class="pubcell"><input type="checkbox" id="pub-' + i + '"' + (S.days[i].publish ? ' checked' : '') + ' data-field="day-pub" data-day="' + i + '" aria-label="Publish on ' + CC.DAY_NAMES[i] + '"></span>';
      }).join('') + '</div></div>';

    html += '<div class="panel"><h2 class="sec-h">Rhythm</h2><div class="two">' +
      '<label class="field">Start each video this many days before it publishes<input type="number" inputmode="numeric" min="0" max="30" value="' + (Number(S.leadDays) || 0) + '" data-field="lead"></label>' +
      '<label class="field">Calendar start time for work blocks<input type="time" value="' + esc(S.startTime) + '" data-field="start"></label></div></div>';

    html += '<div class="panel"><h2 class="sec-h">Stage times</h2><p class="sec-sub">Minutes per stage. Use 0 to skip a stage.</p><div class="grid-stage"><span class="hd">Stage</span><span class="hd">Long</span><span class="hd">Short</span>' +
      STAGES.map(function (s) {
        return '<label for="sm-long-' + s.id + '">' + esc(s.name) + '</label>' +
          '<input type="number" id="sm-long-' + s.id + '" inputmode="numeric" min="0" max="600" step="5" value="' + CC.stageMinutes(state, { format: 'long' }, s.id) + '" data-field="stage-min" data-format="long" data-stage="' + s.id + '">' +
          '<input type="number" id="sm-short-' + s.id + '" inputmode="numeric" min="0" max="600" step="5" value="' + CC.stageMinutes(state, { format: 'short' }, s.id) + '" data-field="stage-min" data-format="short" data-stage="' + s.id + '" aria-label="' + esc(s.name) + ' for a short">';
      }).join('') + '</div></div>';

    html += '<div class="panel"><h2 class="sec-h">Tool links</h2><p class="sec-sub">Leave blank to use the default link.</p>' +
      Object.keys(TOOLS).map(function (id) {
        return '<div class="toolrow"><label for="url-' + id + '">' + esc(TOOLS[id].name) + '</label><input type="url" id="url-' + id + '" placeholder="' + esc(TOOLS[id].url) + '" value="' + esc(S.toolUrls[id] || '') + '" data-field="tool-url" data-tool="' + id + '"></div>';
      }).join('') + '</div>';

    html += '<div class="panel"><h2 class="sec-h">Keep CreateControl running</h2><p>CreateControl is free to use. If it helps you post more steadily, an optional contribution helps keep the site online.</p>' +
      (DONATION_URL
        ? '<div class="row"><a class="btn primary" href="' + esc(DONATION_URL) + '" target="_blank" rel="noopener">Support CreateControl</a><span class="muted" style="font-size:.85rem">' + esc(DONATION_LABEL) + '</span></div>'
        : '<div class="row"><span class="btn" aria-disabled="true">Donation link not set yet</span></div>') + '</div>';

    html += '<div class="panel"><h2 class="sec-h">Backup</h2><p class="sec-sub">Your plan lives in this browser only. Save a copy so a cleared browser does not erase it.</p>' +
      '<div class="row"><button type="button" class="btn small" data-act="export">Save backup</button>' +
      '<label class="btn small" for="import-file" style="cursor:pointer">Restore backup</label><input type="file" id="import-file" accept="application/json,.json" class="sr" data-field="import">' +
      '<button type="button" class="btn small danger" data-act="reset">' + (ui.confirm === 'reset' ? 'Tap again to reset everything' : 'Reset everything') + '</button></div></div>';
    return html;
  }

  function render() {
    renderNav();
    document.getElementById('today-label').textContent = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
    var view = { plan: renderPlan, videos: renderVideos, tools: renderTools, setup: renderSetup }[ui.tab]();
    document.getElementById('app').innerHTML = view;
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act'), vid = el.getAttribute('data-vid'), stage = el.getAttribute('data-stage');
    var v = vid ? videoById(vid) : null;
    if (act !== 'delete' && act !== 'reset') ui.confirm = null;

    if (act === 'tab') {
      ui.tab = el.getAttribute('data-tab');
      try { history.replaceState(null, '', '#' + ui.tab); } catch (err) { /* ignore */ }
      render(); window.scrollTo(0, 0);
    } else if (act === 'more') { ui.days += 14; render(); }
    else if (act === 'done' && v) {
      v.done[stage] = true; save(); render();
      toast(stageById(stage).name + ' done', function () { v.done[stage] = false; changed(); });
    } else if (act === 'toggle-stage' && v) { v.done[stage] = !v.done[stage]; changed(); }
    else if (act === 'add') {
      var inp = document.getElementById('new-title'), fmt = document.getElementById('new-format').value;
      var title = inp.value.trim();
      if (!title) { inp.focus(); toast('Type a working title first'); return; }
      state.queue.push({ id: 'v' + state.nextId++, title: title, format: fmt, done: {}, published: false });
      changed();
    } else if (act === 'publish' && v) {
      v.published = true; changed();
      toast('Marked published', function () { v.published = false; changed(); });
    } else if (act === 'unpublish' && v) { v.published = false; v.done = {}; changed(); }
    else if (act === 'delete' && v) {
      if (ui.confirm === vid) {
        var idx = state.queue.indexOf(v); state.queue.splice(idx, 1); ui.confirm = null; changed();
        toast('Video deleted', function () { state.queue.splice(idx, 0, v); changed(); });
      } else { ui.confirm = vid; render(); }
    } else if (act === 'copy') {
      var pre = document.getElementById('prompt-' + el.getAttribute('data-i'));
      if (pre) copyText(pre.textContent);
    } else if (act === 'ics') {
      var plan = CC.buildPlan(state, new Date());
      if (!plan.blocks.length && !plan.videos.length) { toast('Nothing to export yet'); return; }
      download('createcontrol-schedule.ics', 'text/calendar', CC.makeICS(plan, state, new Date()));
      toast('Calendar file downloaded');
    } else if (act === 'export') {
      download('createcontrol-backup-' + CC.ymd(new Date()) + '.json', 'application/json', JSON.stringify(state, null, 2));
    } else if (act === 'reset') {
      if (ui.confirm === 'reset') { state = CC.defaultState(); ui.confirm = null; changed(); toast('Everything reset'); }
      else { ui.confirm = 'reset'; render(); }
    } else if (act === 'undo') {
      if (lastUndo) { var fn = lastUndo; lastUndo = null; document.getElementById('toast-host').innerHTML = ''; fn(); }
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target, f = el.getAttribute && el.getAttribute('data-field');
    if (!f) return;
    var S = state.settings;
    function num(max) { var n = Math.round(Number(el.value)); return Math.max(0, Math.min(max, Number.isFinite(n) ? n : 0)); }

    if (f === 'title') { var v = videoById(el.getAttribute('data-vid')); if (v) { v.title = el.value.trim() || 'Untitled video'; changed(); } }
    else if (f === 'format') { var w = videoById(el.getAttribute('data-vid')); if (w) { w.format = el.value === 'short' ? 'short' : 'long'; changed(); } }
    else if (f === 'day-min') { S.days[+el.getAttribute('data-day')].min = num(720); changed(); }
    else if (f === 'day-pub') { S.days[+el.getAttribute('data-day')].publish = el.checked; changed(); }
    else if (f === 'lead') { S.leadDays = num(30); changed(); }
    else if (f === 'start') { S.startTime = el.value || '19:00'; changed(); }
    else if (f === 'stage-min') { S.stageMins[el.getAttribute('data-format')][el.getAttribute('data-stage')] = num(600); changed(); }
    else if (f === 'tool-url') {
      var val = el.value.trim();
      if (val && !/^(https?:\/\/|mobilenotes:\/\/)/i.test(val)) { toast('Links must start with https://'); el.value = S.toolUrls[el.getAttribute('data-tool')] || ''; return; }
      S.toolUrls[el.getAttribute('data-tool')] = val; changed();
    } else if (f === 'import') {
      var file = el.files && el.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          if (!parsed || parsed.v !== 1 || !parsed.settings || !Array.isArray(parsed.queue)) throw new Error('bad file');
          state = normalize(parsed, CC.defaultState()); changed(); toast('Backup restored');
        } catch (err) { toast('That file is not a CreateControl backup'); }
      };
      reader.readAsText(file);
    }
  });

  // Enter key adds a video
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'new-title') {
      var btn = document.querySelector('[data-act="add"]'); if (btn) btn.click();
    }
  });

  // Re-render when the tab comes back so "Today" is never stale.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  var h = (location.hash || '').replace('#', '');
  if (['plan', 'videos', 'tools', 'setup'].indexOf(h) >= 0) ui.tab = h;
  render();
})();
