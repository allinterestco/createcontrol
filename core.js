/*
 * CreateControl core logic: pure functions only (no DOM), so it can be tested in Node.
 * Loaded in the browser as window.CC, and in Node via require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Every video moves through these stages in order.
  var STAGES = [
    { id: 'idea',    name: 'Idea & hook',            tools: ['notes', 'claude', 'chatgpt'],
      tip: 'Pick the idea and write the first line viewers will hear.' },
    { id: 'script',  name: 'Script',                 tools: ['claude', 'chatgpt', 'notes'],
      tip: 'Short spoken sentences. One point per beat.' },
    { id: 'voice',   name: 'Voiceover',              tools: ['elevenlabs'],
      tip: 'Generate or record the narration, then export the audio.' },
    { id: 'visuals', name: 'Visuals',                tools: ['midjourney', 'canva'],
      tip: 'Make the images and graphics the edit will need.' },
    { id: 'edit',    name: 'Edit',                   tools: ['capcut'],
      tip: 'Assemble the video on your phone and export.' },
    { id: 'package', name: 'Thumbnail, title & caption', tools: ['canva', 'claude'],
      tip: 'Thumbnail, title, description and hashtags.' },
    { id: 'upload',  name: 'Upload & schedule',      tools: ['ytstudio', 'tiktok'],
      tip: 'Upload and set the publish time.' }
  ];

  // Default links. Every one can be changed in Setup.
  var TOOLS = {
    notes:      { name: 'Notes',          url: 'mobilenotes://', hint: 'Opens Apple Notes on iPhone' },
    claude:     { name: 'Claude',         url: 'https://claude.ai/' },
    chatgpt:    { name: 'ChatGPT',        url: 'https://chatgpt.com/' },
    elevenlabs: { name: 'ElevenLabs',     url: 'https://elevenlabs.io/app' },
    midjourney: { name: 'Midjourney',     url: 'https://www.midjourney.com/' },
    canva:      { name: 'Canva',          url: 'https://www.canva.com/' },
    capcut:     { name: 'CapCut',         url: 'https://www.capcut.com/', hint: 'Edit in the CapCut app on your phone' },
    ytstudio:   { name: 'YouTube Studio', url: 'https://studio.youtube.com/' },
    tiktok:     { name: 'TikTok Studio',  url: 'https://www.tiktok.com/tiktokstudio' },
    youtube:    { name: 'YouTube',        url: 'https://www.youtube.com/' },
    github:     { name: 'GitHub',         url: 'https://github.com/' }
  };

  // Minutes per stage. 0 skips the stage.
  var DEFAULT_STAGE_MINS = {
    long:  { idea: 20, script: 45, voice: 20, visuals: 40, edit: 90, package: 25, upload: 15 },
    short: { idea: 10, script: 15, voice: 10, visuals: 15, edit: 40, package: 10, upload: 10 }
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  // Local calendar date as YYYY-MM-DD. Never use toISOString() for this: it shifts to UTC.
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

  function fmtMin(m) {
    m = Math.round(m);
    var h = Math.floor(m / 60), r = m % 60;
    if (h && r) return h + 'h ' + r + 'm';
    if (h) return h + 'h';
    return r + 'm';
  }

  function parseClock(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    if (!m) return 19 * 60;
    return Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]);
  }

  function fmtClock(total) {
    var h = Math.floor(total / 60) % 24, m = total % 60;
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + pad(m) + ' ' + ap;
  }

  function defaultState() {
    // Capacity is minutes of focused work per weekday (0 = day off). Index 0 = Sunday.
    var days = [
      { min: 120, publish: true  }, // Sun
      { min: 0,   publish: false }, // Mon
      { min: 60,  publish: false }, // Tue
      { min: 0,   publish: false }, // Wed
      { min: 60,  publish: false }, // Thu
      { min: 0,   publish: false }, // Fri
      { min: 120, publish: false }  // Sat
    ];
    return {
      v: 1,
      settings: {
        days: days,
        leadDays: 5,
        startTime: '19:00',
        stageMins: JSON.parse(JSON.stringify(DEFAULT_STAGE_MINS)),
        toolUrls: {}
      },
      queue: [
        { id: 'v1', title: 'Sample video 1 (rename me)', format: 'long',  done: {}, published: false },
        { id: 'v2', title: 'Sample video 2 (rename me)', format: 'long',  done: {}, published: false },
        { id: 'v3', title: 'Sample short (rename me)',   format: 'short', done: {}, published: false }
      ],
      nextId: 4
    };
  }

  function stageMinutes(state, video, stageId) {
    var m = state.settings.stageMins[video.format] || {};
    return Math.max(0, Number(m[stageId]) || 0);
  }

  function videoMinutes(state, video) {
    return STAGES.reduce(function (a, s) { return a + stageMinutes(state, video, s.id); }, 0);
  }

  /*
   * Build the production schedule.
   *
   * Videos are taken in queue order. Video k is aimed at the k-th publish day from today.
   * Its work may start `leadDays` before that publish day (never before today). Each stage
   * that is not yet done goes on the earliest work day, at or after the previous stage,
   * that still has room. A video publishes on the first publish day on or after its last
   * stage, never earlier than its own slot and always after the previous video.
   * If that is later than its slot, the video is marked late.
   */
  function buildPlan(state, todayIn) {
    var today = startOfDay(todayIn);
    var S = state.settings;
    var capOf = function (d) { return Math.max(0, Number(S.days[d.getDay()].min) || 0); };
    var totalCap = S.days.reduce(function (a, x) { return a + (Number(x.min) || 0); }, 0);
    var hasPub = S.days.some(function (x) { return x.publish; });
    var queue = state.queue.filter(function (v) { return !v.published; });
    var empty = { error: null, videos: [], blocks: [], slots: [] };

    if (!hasPub) return Object.assign(empty, { error: 'no-publish-day' });
    if (totalCap === 0) return Object.assign(empty, { error: 'no-time' });

    var slots = [];
    for (var i = 0; i < 730; i++) {
      var d = addDays(today, i);
      if (S.days[d.getDay()].publish) slots.push(d);
    }

    var used = {};
    var MIN_CHUNK = 15; // never leave a sliver smaller than this on a day
    // Fill a stage into free time from `from` onward. A stage can split across days.
    // Returns a list of {date, minutes} parts, or null if it cannot be placed.
    function place(minutes, from) {
      var parts = [], remaining = minutes;
      for (var n = 0; n < 1000 && remaining > 0; n++) {
        var day = addDays(from, n);
        var cap = capOf(day);
        if (cap <= 0) continue;
        var key = ymd(day);
        var free = cap - (used[key] || 0);
        if (free >= Math.min(MIN_CHUNK, remaining)) {
          var take = Math.min(free, remaining);
          used[key] = (used[key] || 0) + take;
          parts.push({ date: day, minutes: take });
          remaining -= take;
        }
      }
      return remaining > 0 ? null : parts;
    }

    var lead = Math.max(0, Number(S.leadDays) || 0);
    var prevP = -1, seq = 0;
    var out = [], all = [];

    queue.forEach(function (v, k) {
      // The earliest slot this video can take: its own, or the one after the previous video.
      var avail = Math.max(k, prevP + 1);
      var slot = slots[Math.min(avail, slots.length - 1)];
      var cursor = addDays(slot, -lead);
      if (cursor < today) cursor = today;
      var blocks = [], finish = today, failed = false, remaining = 0, total = 0, doneCount = 0, stageCount = 0;

      STAGES.forEach(function (st) {
        var m = stageMinutes(state, v, st.id);
        if (!m) return;
        stageCount++; total += m;
        if (v.done[st.id]) { doneCount++; return; }
        remaining += m;
        if (failed) return;
        var parts = place(m, cursor);
        if (!parts) { failed = true; return; }
        parts.forEach(function (p, i) {
          blocks.push({ seq: seq++, videoId: v.id, stage: st.id, date: p.date, minutes: p.minutes,
                        part: i + 1, parts: parts.length, stageMinutes: m });
        });
        cursor = parts[parts.length - 1].date;
        finish = cursor;
      });

      var idx = -1;
      for (var s = 0; s < slots.length; s++) { if (slots[s].getTime() >= finish.getTime()) { idx = s; break; } }
      var p = Math.max(avail, idx < 0 ? slots.length : idx);
      var publishDate = failed || p >= slots.length ? null : slots[p];
      prevP = p;
      var target = slot;

      out.push({
        video: v, blocks: blocks, finish: finish, publishDate: publishDate, targetDate: target,
        late: !!publishDate && p > avail, unscheduled: !publishDate,
        totalMin: total, remainingMin: remaining, doneCount: doneCount, stageCount: stageCount
      });
      all = all.concat(blocks);
    });

    all.sort(function (a, b) { return a.date - b.date || a.seq - b.seq; });
    return { error: null, videos: out, blocks: all, slots: slots };
  }

  // Compare weekly time against what the publish cadence needs.
  function capacityInfo(state) {
    var S = state.settings;
    var weeklyMin = S.days.reduce(function (a, x) { return a + (Number(x.min) || 0); }, 0);
    var target = S.days.filter(function (x) { return x.publish; }).length;
    var sample = state.queue.filter(function (v) { return !v.published; }).slice(0, 6);
    var perVideo = sample.length
      ? sample.reduce(function (a, v) { return a + videoMinutes(state, v); }, 0) / sample.length
      : videoMinutes(state, { format: 'long' });
    var supported = perVideo > 0 ? weeklyMin / perVideo : 0;
    return { weeklyMin: weeklyMin, perVideoMin: perVideo, supported: supported, target: target,
             ok: supported + 0.001 >= target };
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsLocal(d, minutes) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' +
      pad(Math.floor(minutes / 60) % 24) + pad(minutes % 60) + '00';
  }
  function icsDate(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }

  // Calendar file. Times are "floating" (no time zone) so they land at the same clock time wherever you are.
  function makeICS(plan, state, now) {
    var stamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    var titleOf = {};
    state.queue.forEach(function (v) { titleOf[v.id] = v.title; });
    var stageOf = {};
    STAGES.forEach(function (s) { stageOf[s.id] = s; });
    var startMin = parseClock(state.settings.startTime);
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CreateControl//allinterestco.com//EN', 'CALSCALE:GREGORIAN'];

    var offset = {};
    plan.blocks.forEach(function (b) {
      var key = ymd(b.date);
      var begin = startMin + (offset[key] || 0);
      offset[key] = (offset[key] || 0) + b.minutes;
      var st = stageOf[b.stage];
      var tools = st.tools.map(function (t) { return TOOLS[t].name; }).join(', ');
      lines.push('BEGIN:VEVENT',
        'UID:' + b.videoId + '-' + b.stage + '-' + key + '@createcontrol.allinterestco.com',
        'DTSTAMP:' + stamp,
        'DTSTART:' + icsLocal(b.date, begin),
        'DTEND:' + icsLocal(b.date, begin + b.minutes),
        'SUMMARY:' + icsEscape(st.name + (b.parts > 1 ? ' (part ' + b.part + ' of ' + b.parts + ')' : '') + ': ' + (titleOf[b.videoId] || 'Video')),
        'DESCRIPTION:' + icsEscape(st.tip + ' Tools: ' + tools),
        'END:VEVENT');
    });

    plan.videos.forEach(function (pv) {
      if (!pv.publishDate) return;
      lines.push('BEGIN:VEVENT',
        'UID:' + pv.video.id + '-publish-' + ymd(pv.publishDate) + '@createcontrol.allinterestco.com',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + icsDate(pv.publishDate),
        'DTEND;VALUE=DATE:' + icsDate(addDays(pv.publishDate, 1)),
        'SUMMARY:' + icsEscape('Publish: ' + pv.video.title),
        'END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  return {
    DAY_NAMES: DAY_NAMES, STAGES: STAGES, TOOLS: TOOLS, DEFAULT_STAGE_MINS: DEFAULT_STAGE_MINS,
    ymd: ymd, parseYmd: parseYmd, addDays: addDays, startOfDay: startOfDay,
    fmtMin: fmtMin, fmtClock: fmtClock, parseClock: parseClock,
    defaultState: defaultState, stageMinutes: stageMinutes, videoMinutes: videoMinutes,
    buildPlan: buildPlan, capacityInfo: capacityInfo, makeICS: makeICS
  };
});
