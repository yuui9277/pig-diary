/* ===== 小猪日记 · 两台手机同步 =====
 * 数据先在本机加密（AES-GCM），再传到中转仓库（npoint.io）。
 * 服务器只看到密文；配对码就是钥匙，只在你俩之间传递。
 */
(function () {
  'use strict';

  var STORE_KEY = 'pig_diary_sync_v1';
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉 0/O/1/I，念起来不容易错
  var CODE_LEN = 16;
  var POLL_MS = 15000;
  var PUSH_DELAY = 1200;

  var api = window.PIG_SYNC_CONFIG || null;
  var store = window.PigDiary.store;
  var cfg = readCfg();
  var hooks = { render: null, status: null };
  var timer = null, pushTimer = null, busy = false, applying = false;
  var localRev = 0, pushedRev = -1, state = 'off', lastError = '';

  /* ---------- 配置 ---------- */
  function readCfg() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.code) return null;
      return o;
    } catch (e) { return null; }
  }
  function writeCfg() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 工具 ---------- */
  function enc(s) { return new TextEncoder().encode(s); }
  function b64(buf) {
    var u = new Uint8Array(buf), s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function hex(buf) {
    var u = new Uint8Array(buf), s = '';
    for (var i = 0; i < u.length; i++) s += ('0' + u[i].toString(16)).slice(-2);
    return s;
  }
  function sha256(s) { return crypto.subtle.digest('SHA-256', enc(s)).then(hex); }
  function randomCode() {
    var out = '', buf = new Uint8Array(CODE_LEN);
    crypto.getRandomValues(buf);
    for (var i = 0; i < CODE_LEN; i++) out += ALPHABET[buf[i] % ALPHABET.length];
    return out;
  }
  function normalizeCode(s) {
    var v = String(s || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
    return v.length === CODE_LEN ? v : '';
  }
  function prettyCode(code) {
    return String(code || '').replace(/(.{4})(?=.)/g, '$1-');
  }

  /* ---------- 密钥 ---------- */
  function deriveKey(code) {
    var salt = 'pig-diary|' + (api && api.bin ? api.bin : 'local');
    return crypto.subtle.importKey('raw', enc(code), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc(salt), iterations: 120000, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
      });
  }

  function encrypt(text) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(cfg.code).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc(text));
    }).then(function (ct) {
      return 'v1.' + b64(iv) + '.' + b64(ct);
    });
  }

  function decrypt(payload) {
    var parts = String(payload || '').split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return Promise.reject(new Error('格式不对'));
    return deriveKey(cfg.code).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[1]) }, key, unb64(parts[2]));
    }).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  /* ---------- 传输（npoint.io：GET 读、POST 写整个 JSON） ---------- */
  function binUrl() {
    return api.base.replace(/\/+$/, '') + '/' + api.bin;
  }

  function pull() {
    return fetch(binUrl() + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('读取失败 HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.p) return null;
      // 仓库里可能是旧配对码留下的密文，解不开就当空的：本机数据为准，别把同步卡死
      return decrypt(j.p).catch(function () { return null; });
    });
  }

  function push(payloadText) {
    return encrypt(payloadText).then(function (ct) {
      return fetch(binUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p: ct })
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('上传失败 HTTP ' + r.status);
    });
  }

  /* ---------- 合并 ---------- */
  function ver(r) { return (r && (r.updatedAt || r.createdAt)) || 0; }

  function buildPayload(d) {
    return JSON.stringify({
      v: 1,
      at: Date.now(),
      entries: d.entries,
      items: d.items,
      milestones: d.milestones,
      checkins: d.checkins,
      couple: d.couple,
      pen: d.pen,
      tombstones: d.tombstones || {}
    });
  }

  function dropTombstoned(d) {
    Object.keys(d.tombstones || {}).forEach(function (k) {
      var p = k.split(':'), kind = p[0], id = p[1], t = d.tombstones[k];
      if (kind === 'checkins') {
        if (d.checkins[id] && (d.checkins[id].updatedAt || 0) <= t) delete d.checkins[id];
        return;
      }
      d[kind] = (d[kind] || []).filter(function (x) { return !(x.id === id && ver(x) <= t); });
    });
  }

  function mergeInto(local, remote) {
    var changed = false;
    var rt = remote.tombstones || {};
    Object.keys(rt).forEach(function (k) {
      if (!local.tombstones[k] || rt[k] > local.tombstones[k]) { local.tombstones[k] = rt[k]; changed = true; }
    });

    ['entries', 'items', 'milestones'].forEach(function (kind) {
      var map = {};
      (local[kind] || []).forEach(function (r) { map[r.id] = r; });
      (remote[kind] || []).forEach(function (r) {
        if (!r || !r.id) return;
        var cur = map[r.id];
        if (!cur) { local[kind].push(r); map[r.id] = r; changed = true; }
        else if (ver(r) > ver(cur)) {
          Object.keys(r).forEach(function (k2) { cur[k2] = r[k2]; });
          changed = true;
        }
      });
    });

    Object.keys(remote.checkins || {}).forEach(function (day) {
      var cur = local.checkins[day], r = remote.checkins[day];
      if (!r) return;
      if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) { local.checkins[day] = r; changed = true; }
    });

    // 称呼：本地还是默认值时跟随对方
    if (remote.couple && local.couple.she === '小猪' && local.couple.he === '饲养员' &&
        (remote.couple.she !== '小猪' || remote.couple.he !== '饲养员')) {
      local.couple = remote.couple;
      changed = true;
    }

    // 小猪窝：次数只增不减（取较大值），互动日期取并集，两边都不会丢进度
    if (remote.pen && typeof remote.pen === 'object') {
      var pl = local.pen, pr = remote.pen;
      if (!pl) { local.pen = pr; changed = true; }
      else {
        var beforePen = pl.hunger + '/' + pl.pats + '/' + pl.naps + '/' + pl.growth + '/' + Object.keys(pl.days || {}).length;
        pl.hunger = Math.max(pl.hunger || 0, pr.hunger || 0);
        pl.pats = Math.max(pl.pats || 0, pr.pats || 0);
        pl.naps = Math.max(pl.naps || 0, pr.naps || 0);
        pl.growth = Math.max(pl.growth || 0, pr.growth || 0);
        pl.updatedAt = Math.max(pl.updatedAt || 0, pr.updatedAt || 0);
        pl.days = pl.days || {};
        Object.keys(pr.days || {}).forEach(function (d) { pl.days[d] = 1; });
        if (beforePen !== pl.hunger + '/' + pl.pats + '/' + pl.naps + '/' + pl.growth + '/' + Object.keys(pl.days).length) changed = true;
      }
    }

    var before = JSON.stringify([local.entries.length, local.items.length, local.milestones.length, Object.keys(local.checkins).length]);
    dropTombstoned(local);
    var after = JSON.stringify([local.entries.length, local.items.length, local.milestones.length, Object.keys(local.checkins).length]);
    if (before !== after) changed = true;
    return changed;
  }

  /* ---------- 状态 ---------- */
  function setState(s, err) {
    state = s;
    lastError = err || '';
    if (hooks.status) { try { hooks.status({ state: s, error: lastError, lastAt: cfg ? cfg.lastAt : 0 }); } catch (e) {} }
  }

  function schedulePush() {
    if (!cfg || !cfg.enabled) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { syncNow(); }, PUSH_DELAY);
  }

  function syncNow() {
    if (!cfg || !cfg.enabled || !api || !crypto.subtle) return Promise.resolve(false);
    if (busy) return Promise.resolve(false);
    busy = true;
    setState('syncing');

    return pull().then(function (remote) {
      var needPush = !remote || localRev !== pushedRev;

      if (remote) {
        applying = true;
        var changed = mergeInto(store.data, remote);
        store.sortEntries();
        store.save();
        applying = false;
        if (changed && hooks.render) hooks.render();
      }

      if (!needPush) return null;
      var revAtPush = localRev;
      return push(buildPayload(store.data)).then(function () { pushedRev = revAtPush; });
    }).then(function () {
      cfg.lastAt = Date.now();
      writeCfg();
      busy = false;
      setState('ok');
      return true;
    }).catch(function (err) {
      busy = false;
      setState('error', (err && err.message) || '网络不通');
      return false;
    });
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(function () {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) syncNow();
    }, POLL_MS);
  }

  /* ---------- 对外 ---------- */
  var PigSync = {
    available: function () {
      return !!(api && api.base && api.bin && typeof crypto !== 'undefined' && crypto.subtle && window.fetch);
    },
    configured: function () { return !!(api && api.base && api.bin); },
    enabled: function () { return !!(cfg && cfg.enabled); },
    state: function () { return state; },
    lastAt: function () { return cfg ? cfg.lastAt : 0; },
    code: function () { return cfg ? prettyCode(cfg.code) : ''; },
    rawCode: function () { return cfg ? cfg.code : ''; },

    createSpace: function () {
      var code = randomCode();
      cfg = { code: code, enabled: true, lastAt: 0 };
      writeCfg();
      startTimer();
      return syncNow().then(function () { return prettyCode(code); });
    },

    joinSpace: function (input) {
      var code = normalizeCode(input);
      if (!code) return Promise.reject(new Error('配对码看起来不对，应该是 16 位'));
      cfg = { code: code, enabled: true, lastAt: 0 };
      writeCfg();
      startTimer();
      return syncNow().then(function () { return true; });
    },

    leave: function () {
      cfg = null;
      clearInterval(timer);
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      setState('off');
    },

    syncNow: syncNow,

    init: function (opts) {
      hooks.render = opts && opts.render;
      hooks.status = opts && opts.status;

      // 本地任何保存都触发一次延迟上传
      var origSave = store.save;
      store.save = function () {
        origSave.apply(store, arguments);
        if (!applying) { localRev++; schedulePush(); }
      };

      if (!this.available()) { setState('unavailable'); return; }
      if (!cfg || !cfg.enabled) { setState('off'); return; }
      setState('idle');
      startTimer();
      setTimeout(function () { syncNow(); }, 800);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && cfg && cfg.enabled) syncNow();
      });
    }
  };

  window.PigSync = PigSync;
})();