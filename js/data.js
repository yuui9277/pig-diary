/* ===== 小猪日记 · 数据层 =====
 * 所有数据保存在浏览器 localStorage 里，只属于你俩。
 * 对外暴露 window.PigDiary
 */
(function () {
  'use strict';

  var KEY = 'pig_diary_v1';
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var WEATHER = { '晴': '☀️', '多云': '⛅', '雨': '🌧️', '雪': '❄️', '雾': '🌫️', '夜': '🌙' };
  var TYPES = { anniversary: '💍', birthday: '🎂', custom: '🎈' };

  var DEFAULTS = {
    entries: [],      // 点滴 {id,date,title,text,tags,mood,likes,createdAt,updatedAt}
    checkins: {},     // 打卡 {YYYY-MM-DD: {quote,song,weather,mood,note,updatedAt}}
    items: [],        // 小物件 {id,name,desc,date,icon}
    milestones: [],   // 纪念日 {id,title,date,type}
    couple: { she: '小猪', he: '饲养员' },
    theme: 'pink',
    // 小猪窝：养成的状态。days 记录哪天互动过（连续天数用它算），
    // 其它是累计次数，两台手机同步时取较大值（只增不减）
    pen: { hunger: 0, pats: 0, naps: 0, growth: 0, days: {}, updatedAt: 0 },
    tombstones: {}    // 删除记录 "kind:id" -> 删除时间，两台手机同步时用来传播删除
  };

  /* ---------- 小工具 ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function str(v) { return v == null ? '' : String(v); }
  function trimStr(v) { return str(v).trim(); }

  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayKey() { return toKey(new Date()); }

  function parseDate(s) {
    if (!isDate(s)) return null;
    var p = s.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function addDays(date, n) {
    var d = parseDate(date);
    if (!d) return date;
    return toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }

  function dayDiff(a, b) {
    var d1 = parseDate(a), d2 = parseDate(b);
    if (!d1 || !d2) return 0;
    var u1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
    var u2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
    return Math.round((u2 - u1) / 86400000);
  }

  function formatDate(s) {
    var d = parseDate(s);
    if (!d) return str(s);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
  }

  function formatShort(s) {
    var d = parseDate(s);
    if (!d) return str(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function relative(date, today) {
    var n = dayDiff(date, today || todayKey());
    if (n === 0) return '今天';
    if (n === 1) return '昨天';
    if (n === -1) return '明天';
    return n > 0 ? n + ' 天前' : (-n) + ' 天后';
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 连续互动天数：从今天往前数（今天还没互动就从昨天开始数，当天不算断）
  function penStreak(days, today) {
    days = days || {};
    var day = today || todayKey();
    if (!days[day]) day = addDays(day, -1);
    var n = 0;
    while (days[day] && n < 4000) {
      n++;
      day = addDays(day, -1);
    }
    return n;
  }

  // 记下一次删除，同步时把删除也带给对方
  function markDeleted(data, kind, id) {
    var k = kind + ':' + str(id);
    if (id) data.tombstones[k] = Date.now();
  }

  // 把旧数据里带 emoji 的天气（"☀️ 晴"）统一成 "晴"
  function weatherKey(w) {
    var s = trimStr(w);
    if (!s) return '';
    if (WEATHER[s]) return s;
    var found = '';
    Object.keys(WEATHER).forEach(function (k) { if (!found && s.indexOf(k) !== -1) found = k; });
    return found;
  }

  function normTags(tags) {
    var out = [];
    var list = Array.isArray(tags) ? tags : str(tags).split(/[，,、;；\s]+/);
    list.forEach(function (t) {
      var v = trimStr(t).replace(/^#/, '');
      if (v && out.indexOf(v) === -1 && out.length < 8) out.push(v);
    });
    return out;
  }

  /* ---------- 读入与修复 ---------- */
  function normalize(raw) {
    var out = clone(DEFAULTS);
    if (!raw || typeof raw !== 'object') return out;

    var eIds = {};

    (Array.isArray(raw.entries) ? raw.entries : []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var id = str(e.id) || uid();
      if (eIds[id]) id = uid();
      eIds[id] = 1;
      out.entries.push({
        id: id,
        date: isDate(e.date) ? e.date : todayKey(),
        title: trimStr(e.title),
        text: str(e.text),
        mood: trimStr(e.mood),
        tags: normTags(e.tags),
        likes: Math.max(0, parseInt(e.likes, 10) || 0),
        createdAt: Number(e.createdAt) || 0,
        updatedAt: Number(e.updatedAt) || 0
      });
    });

    if (raw.checkins && typeof raw.checkins === 'object') {
      Object.keys(raw.checkins).forEach(function (day) {
        if (!isDate(day)) return;
        var c = raw.checkins[day];
        if (!c || typeof c !== 'object') return;
        var weather = weatherKey(c.weather);
        var check = {
          quote: trimStr(c.quote),
          song: trimStr(c.song),
          weather: weather,
          mood: trimStr(c.mood),
          note: trimStr(c.note),
          updatedAt: Number(c.updatedAt) || 0
        };
        if (check.quote || check.song || check.weather || check.mood || check.note) {
          out.checkins[day] = check;
        }
      });
    }

    var iIds = {};
    (Array.isArray(raw.items) ? raw.items : []).forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var id = str(it.id) || uid();
      if (iIds[id]) id = uid();
      iIds[id] = 1;
      out.items.push({
        id: id,
        name: trimStr(it.name),
        desc: trimStr(it.desc),
        date: isDate(it.date) ? it.date : todayKey(),
        icon: trimStr(it.icon).slice(0, 8) || '🧸',
        createdAt: Number(it.createdAt) || 0,
        updatedAt: Number(it.updatedAt) || 0
      });
    });

    var mIds = {};
    (Array.isArray(raw.milestones) ? raw.milestones : []).forEach(function (m) {
      if (!m || typeof m !== 'object' || !isDate(m.date)) return;
      var id = str(m.id) || uid();
      if (mIds[id]) id = uid();
      mIds[id] = 1;
      out.milestones.push({
        id: id,
        title: trimStr(m.title) || '纪念日',
        date: m.date,
        type: TYPES[m.type] ? m.type : 'custom',
        createdAt: Number(m.createdAt) || 0,
        updatedAt: Number(m.updatedAt) || 0
      });
    });

    if (raw.couple && typeof raw.couple === 'object') {
      out.couple = {
        she: trimStr(raw.couple.she) || '小猪',
        he: trimStr(raw.couple.he) || '饲养员'
      };
    }
    if (typeof raw.theme === 'string' && raw.theme) out.theme = raw.theme;

    if (raw.pen && typeof raw.pen === 'object') {
      var p = raw.pen;
      out.pen.hunger = Math.max(0, parseInt(p.hunger, 10) || 0);
      out.pen.pats = Math.max(0, parseInt(p.pats, 10) || 0);
      out.pen.naps = Math.max(0, parseInt(p.naps, 10) || 0);
      out.pen.growth = Math.max(0, parseInt(p.growth, 10) || 0);
      out.pen.updatedAt = Number(p.updatedAt) || 0;
      if (p.days && typeof p.days === 'object') {
        Object.keys(p.days).forEach(function (d) {
          if (isDate(d)) out.pen.days[d] = 1;
        });
      }
    }

    if (raw.tombstones && typeof raw.tombstones === 'object') {
      Object.keys(raw.tombstones).forEach(function (k) {
        var t = Number(raw.tombstones[k]) || 0;
        if (t > 0 && /^(entries|items|milestones|checkins):/.test(k)) out.tombstones[k] = t;
      });
    }

    return out;
  }

  function cmpEntry(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;   // 新日期在前
    return (b.createdAt || 0) - (a.createdAt || 0);
  }

  /* ---------- 存储读写 ---------- */
  function read() {
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
      if (!raw) return normalize(null);
      return normalize(JSON.parse(raw));
    } catch (e) {
      return normalize(null);
    }
  }

  function persist(data) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* 隐私模式/配额满：静默失败，页面仍可用 */ }
  }

  var store = {
    data: normalize(null),
    save: function () { persist(this.data); },

    reset: function () {
      var keep = this.data.tombstones || {};
      var self = this;
      this.data.entries.forEach(function (e) { keep['entries:' + e.id] = Date.now(); });
      this.data.items.forEach(function (e) { keep['items:' + e.id] = Date.now(); });
      this.data.milestones.forEach(function (e) { keep['milestones:' + e.id] = Date.now(); });
      Object.keys(this.data.checkins).forEach(function (d) { keep['checkins:' + d] = Date.now(); });
      self.data = normalize(null);
      self.data.tombstones = keep;
      persist(self.data);
    },

    sortEntries: function () {
      this.data.entries.sort(cmpEntry);
      return this.data.entries;
    },

    /* ---- 点滴 ---- */
    addEntry: function (e) {
      e = e || {};
      var now = Date.now();
      var entry = {
        id: uid(),
        date: isDate(e.date) ? e.date : todayKey(),
        title: trimStr(e.title),
        text: str(e.text),
        mood: trimStr(e.mood),
        tags: normTags(e.tags),
        likes: 0,
        createdAt: now,
        updatedAt: now
      };
      this.data.entries.push(entry);
      this.sortEntries();
      this.save();
      return entry;
    },
    updateEntry: function (id, patch) {
      var e = this.findEntry(id);
      if (!e) return null;
      patch = patch || {};
      if (patch.date !== undefined && isDate(patch.date)) e.date = patch.date;
      if (patch.title !== undefined) e.title = trimStr(patch.title);
      if (patch.text !== undefined) e.text = str(patch.text);
      if (patch.mood !== undefined) e.mood = trimStr(patch.mood);
      if (patch.tags !== undefined) e.tags = normTags(patch.tags);
      e.updatedAt = Date.now();
      this.sortEntries();
      this.save();
      return e;
    },
    findEntry: function (id) {
      var key = str(id);
      return this.data.entries.filter(function (x) { return x.id === key; })[0] || null;
    },
    delEntry: function (id) {
      var key = str(id);
      markDeleted(this.data, 'entries', key);
      this.data.entries = this.data.entries.filter(function (x) { return x.id !== key; });
      this.save();
    },
    likeEntry: function (id) {
      var e = this.findEntry(id);
      if (e) { e.likes = (e.likes || 0) + 1; this.save(); }
      return e ? e.likes : 0;
    },

    /* ---- 打卡（每天一条） ---- */
    setCheckin: function (day, obj) {
      if (!isDate(day)) return;
      obj = obj || {};
      var weather = weatherKey(obj.weather);
      var check = {
        quote: trimStr(obj.quote),
        song: trimStr(obj.song),
        weather: weather,
        mood: trimStr(obj.mood),
        note: trimStr(obj.note),
        updatedAt: Date.now()
      };
      if (!check.quote && !check.song && !check.weather && !check.mood && !check.note) {
        delete this.data.checkins[day];
      } else {
        this.data.checkins[day] = check;
      }
      this.save();
    },
    getCheckin: function (day) { return this.data.checkins[day] || null; },
    delCheckin: function (day) { markDeleted(this.data, 'checkins', day); delete this.data.checkins[day]; this.save(); },

    /* ---- 小物件 ---- */
    addItem: function (it) {
      it = it || {};
      var now = Date.now();
      var item = {
        id: uid(),
        name: trimStr(it.name),
        desc: trimStr(it.desc),
        date: isDate(it.date) ? it.date : todayKey(),
        icon: trimStr(it.icon).slice(0, 8) || '🧸',
        createdAt: now,
        updatedAt: now
      };
      this.data.items.unshift(item);
      this.save();
      return item;
    },
    delItem: function (id) {
      var key = str(id);
      markDeleted(this.data, 'items', key);
      this.data.items = this.data.items.filter(function (x) { return x.id !== key; });
      this.save();
    },

    /* ---- 纪念日 ---- */
    addMilestone: function (m) {
      m = m || {};
      var item = {
        id: uid(),
        title: trimStr(m.title) || '纪念日',
        date: isDate(m.date) ? m.date : todayKey(),
        type: TYPES[m.type] ? m.type : 'custom',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.data.milestones.push(item);
      this.save();
      return item;
    },
    delMilestone: function (id) {
      var key = str(id);
      markDeleted(this.data, 'milestones', key);
      this.data.milestones = this.data.milestones.filter(function (x) { return x.id !== key; });
      this.save();
    },

    /* ---- 小猪窝 ---- */
    pen: function () {
      return this.data.pen;
    },

    // 互动一次：喂食 / 摸头 / 睡觉。成长值 +1，并记下今天互动过
    penRun: function (kind) {
      var p = this.data.pen;
      if (kind === 'feed') p.hunger += 1;
      else if (kind === 'pat') p.pats += 1;
      else if (kind === 'sleep') p.naps += 1;
      p.growth += 1;

      var day = todayKey();
      var isNewDay = !p.days[day];
      p.days[day] = 1;
      p.updatedAt = Date.now();
      this.save();

      return { isNewDay: isNewDay, streak: penStreak(p.days) };
    },

    /* ---- 称呼 ---- */
    setCouple: function (a, b) {
      this.data.couple = {
        she: trimStr(a) || '小猪',
        he: trimStr(b) || '饲养员'
      };
      this.save();
    },

    /* ---- 备份 ---- */
    exportJSON: function () {
      return JSON.stringify({
        app: 'pig_diary',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: this.data
      }, null, 2);
    },

    // 合并导入：只补充本地没有的内容，绝不覆盖已有回忆
    importJSON: function (text) {
      var parsed = JSON.parse(String(text));
      var incoming = normalize(parsed && parsed.data ? parsed.data : parsed);
      var added = { entries: 0, items: 0, milestones: 0, checkins: 0 };
      var self = this;

      // 先合并删除记录：对方删掉的，本地也不该再复活
      Object.keys(incoming.tombstones).forEach(function (k) {
        if (!self.data.tombstones[k] || incoming.tombstones[k] > self.data.tombstones[k]) {
          self.data.tombstones[k] = incoming.tombstones[k];
        }
      });
      Object.keys(self.data.tombstones).forEach(function (k) {
        var p = k.split(':');
        var kind = p[0], id = p[1], t = self.data.tombstones[k];
        function dead(x) { return x.id === id && ((x.updatedAt || x.createdAt || 0) <= t); }
        if (kind === 'entries') self.data.entries = self.data.entries.filter(function (x) { return !dead(x); });
        if (kind === 'items') self.data.items = self.data.items.filter(function (x) { return !dead(x); });
        if (kind === 'milestones') self.data.milestones = self.data.milestones.filter(function (x) { return !dead(x); });
        if (kind === 'checkins' && self.data.checkins[id] && (self.data.checkins[id].updatedAt || 0) <= t) delete self.data.checkins[id];
      });

      incoming.entries.forEach(function (e) {
        // 手动导入 = 我想把这些回忆找回来：把记录时间推到删除记录之后
        var tE = self.data.tombstones['entries:' + e.id];
        if (tE) e.updatedAt = Math.max(Date.now(), tE + 1);
        var dup = self.data.entries.some(function (x) {
          return x.id === e.id || (x.date === e.date && x.title === e.title && x.text === e.text);
        });
        if (!dup) { self.data.entries.push(e); added.entries++; }
      });

      incoming.items.forEach(function (it) {
        var tI = self.data.tombstones['items:' + it.id];
        if (tI) it.updatedAt = Math.max(Date.now(), tI + 1);
        var dup = self.data.items.some(function (x) {
          return x.id === it.id || (x.name === it.name && x.date === it.date);
        });
        if (!dup) { self.data.items.push(it); added.items++; }
      });

      incoming.milestones.forEach(function (m) {
        var tM = self.data.tombstones['milestones:' + m.id];
        if (tM) m.updatedAt = Math.max(Date.now(), tM + 1);
        var dup = self.data.milestones.some(function (x) {
          return x.id === m.id || (x.title === m.title && x.date === m.date);
        });
        if (!dup) { self.data.milestones.push(m); added.milestones++; }
      });

      Object.keys(incoming.checkins).forEach(function (day) {
        var tC = self.data.tombstones['checkins:' + day];
        if (tC) incoming.checkins[day].updatedAt = Math.max(Date.now(), tC + 1);
        if (!self.data.checkins[day]) {
          self.data.checkins[day] = incoming.checkins[day];
          added.checkins++;
        }
      });

      // 称呼：本地还是默认值时，采用备份里的名字
      if (self.data.couple.she === '小猪' && self.data.couple.he === '饲养员') {
        self.data.couple = incoming.couple;
      }

      // 小猪窝：次数取较大值，互动日期取并集（回忆和养成都不该被降级）
      var pl = self.data.pen, pi = incoming.pen;
      if (pi) {
        pl.hunger = Math.max(pl.hunger, pi.hunger);
        pl.pats = Math.max(pl.pats, pi.pats);
        pl.naps = Math.max(pl.naps, pi.naps);
        pl.growth = Math.max(pl.growth, pi.growth);
        pl.updatedAt = Math.max(pl.updatedAt, pi.updatedAt);
        Object.keys(pi.days).forEach(function (d) { pl.days[d] = 1; });
      }

      this.sortEntries();
      this.save();
      return added;
    }
  };

  store.data = read();
  store.sortEntries();

  window.PigDiary = window.PigDiary || {};
  window.PigDiary.store = store;
  window.PigDiary.WEATHER = WEATHER;
  window.PigDiary.TYPES = TYPES;
  window.PigDiary.todayKey = todayKey;
  window.PigDiary.addDays = addDays;
  window.PigDiary.dayDiff = dayDiff;
  window.PigDiary.formatDate = formatDate;
  window.PigDiary.formatShort = formatShort;
  window.PigDiary.relative = relative;
  window.PigDiary.nextOccur = nextOccur;
  window.PigDiary.isDate = isDate;
  window.PigDiary.penStreak = penStreak;

  // 下一次周年 / 生日（闰日会落到 2 月最后一天）
  function nextOccur(base, today) {
    var b = parseDate(base);
    var t = parseDate(today || todayKey());
    if (!b || !t) return today || todayKey();
    var y = t.getFullYear();
    var todayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var cand = new Date(y, b.getMonth(), b.getDate());
    if (cand < todayStart) cand = new Date(y + 1, b.getMonth(), b.getDate());
    if (cand.getMonth() !== b.getMonth()) {
      cand = new Date(cand.getFullYear(), b.getMonth() + 1, 0);
    }
    return toKey(cand);
  }
})();