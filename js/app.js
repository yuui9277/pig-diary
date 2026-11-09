/* ===== 小猪日记 · 主逻辑 ===== */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var Diary = window.PigDiary;
  var store = Diary.store;
  var PigSync = window.PigSync;

  var EMOJIS = ['🐷', '🍼', '🧸', '🎫', '🎞️', '☕', '🥤', '🎵', '📖', '🌸', '🎂', '💌', '🧣', '🕶️', '🎮', '🍰', '🧦', '💍'];
  var WEATHER = { '晴': '☀️', '多云': '⛅', '雨': '🌧️', '雪': '❄️', '雾': '🌫️', '夜': '🌙' };
  var TYPE_EMOJI = { anniversary: '💍', birthday: '🎂', custom: '🎈' };

  var state = { page: 'home', editingId: null, query: '', tag: '' };
  var checkinDirty = false;   // 打卡表里有没保存的输入时不覆盖它

  /* ---------- 通用 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  function parseTags(text) {
    var out = [];
    String(text || '').split(/[，,、;；\s]+/).forEach(function (t) {
      var v = t.trim().replace(/^#/, '');
      if (v && out.indexOf(v) === -1 && out.length < 6) out.push(v);
    });
    return out;
  }

  /* ---------- 页面切换 ---------- */
  function go(page) {
    state.page = page;
    try { history.replaceState(null, '', '#' + page); } catch (e) { /* file:// 或特殊环境忽略 */ }
    $$('.page').forEach(function (p) { p.classList.toggle('show', p.id === 'page-' + page); });
    $$('.tabbar button').forEach(function (b) {
      var on = b.dataset.page === page;
      b.classList.toggle('active', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });

    if (page === 'home') renderHome();
    else if (page === 'timeline') renderTimeline();
    else if (page === 'write') prepareWrite();
    else if (page === 'items') renderItems();
    else if (page === 'milestone') renderMilestones();
    else if (page === 'us') renderUs();

    window.scrollTo(0, 0);
  }

  /* ---------- 首页 ---------- */
  function togetherStart() {
    var anns = store.data.milestones
      .filter(function (m) { return m.type === 'anniversary'; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (anns.length) return anns[0].date;
    var entries = store.data.entries;
    return entries.length ? entries[entries.length - 1].date : '';
  }

  function renderHome() {
    var d = store.data;
    var today = Diary.todayKey();
    var start = togetherStart();
    var days = start ? Math.max(0, Diary.dayDiff(start, today)) : 0;

    $('#stat-entries').textContent = d.entries.length;
    $('#stat-days').textContent = days;
    $('#stat-items').textContent = d.items.length;

    renderHeat(today);
    renderOnThisDay(today);
  }

  function renderHeat(today) {
    var box = $('#heat');
    var html = '';
    for (var i = 13; i >= 0; i--) {
      var day = Diary.addDays(today, -i);
      var count = store.data.entries.filter(function (e) { return e.date === day; }).length;
      var checked = !!store.data.checkins[day];
      var lv = count > 1 ? 3 : (count === 1 ? 2 : (checked ? 1 : 0));
      var label = Diary.formatShort(day) + (count ? ' · ' + count + ' 条日记' : '') + (checked ? ' · 已打卡' : '');
      if (day === today) label = '今天 · ' + label;
      html += '<span class="h" data-l="' + lv + '"' + (day === today ? ' data-today="1"' : '')
        + ' title="' + esc(label) + '" aria-label="' + esc(label) + '"></span>';
    }
    box.innerHTML = html;
    $('#heat-range').innerHTML = '<span>' + Diary.formatShort(Diary.addDays(today, -13)) + '</span>'
      + '<span>今天 · ' + Diary.formatShort(today) + '</span>';
  }

  function renderOnThisDay(today) {
    var box = $('#onthisday');
    var md = today.slice(5);
    var list = store.data.entries.filter(function (e) {
      return e.date.slice(5) === md && e.date < today;
    });
    var head = '<div class="section-title"><span class="paw" aria-hidden="true">🐾</span>那年今日</div>';

    if (!list.length) {
      box.innerHTML = head
        + '<div class="card empty small"><span class="ep">🐷</span>还没有这一天的回忆<br>要不要现在写一条？</div>';
      return;
    }

    box.innerHTML = head + list.map(function (e) {
      var years = Number(today.slice(0, 4)) - Number(e.date.slice(0, 4));
      return '<div class="card ot-card">'
        + '<div class="tl-date">' + Diary.formatDate(e.date) + ' · ' + years + ' 年前</div>'
        + '<div class="tl-title">' + (e.mood ? esc(e.mood) + ' ' : '') + esc(e.title) + '</div>'
        + '<div class="tl-text">' + esc(e.text) + '</div>'
        + '</div>';
    }).join('');
  }

  /* ---------- 时间线 ---------- */
  function renderTimeline() {
    renderTagBar();
    renderTimelineList();
  }

  function renderTagBar() {
    var counts = {};
    store.data.entries.forEach(function (e) {
      (e.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });
    var tags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12);
    var bar = $('#tag-bar');

    // 选中的标签已经不存在了（比如最后一条带它的日记被删了）
    if (state.tag && tags.indexOf(state.tag) === -1) state.tag = '';

    if (!tags.length) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    bar.innerHTML = '<button class="chip' + (state.tag ? '' : ' on') + '" data-tag="" type="button">全部</button>'
      + tags.map(function (t) {
        return '<button class="chip' + (state.tag === t ? ' on' : '') + '" data-tag="' + esc(t) + '" type="button">#' + esc(t) + '</button>';
      }).join('');
  }

  function renderTimelineList() {
    var all = store.data.entries;
    var total = all.length;
    var q = state.query.trim().toLowerCase();
    var list = all.filter(function (e) {
      if (state.tag && (e.tags || []).indexOf(state.tag) === -1) return false;
      if (!q) return true;
      return (e.title + ' ' + e.text + ' ' + (e.tags || []).join(' ')).toLowerCase().indexOf(q) !== -1;
    });

    $('#tl-count').textContent = total
      ? (list.length === total ? '共 ' + total + ' 条' : list.length + ' / ' + total + ' 条')
      : '';

    var box = $('#tl-list');
    if (!total) {
      box.innerHTML = '<div class="empty"><span class="ep">🐷</span>小猪的日记本还是空的<br>从第一条开始填满它吧！</div>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="empty"><span class="ep">🔍</span>没有找到匹配的回忆<br>换个关键词试试？</div>';
      return;
    }

    box.innerHTML = list.map(function (e) {
      var no = total - all.indexOf(e); // 第 1 条 = 最早的一篇
      var tags = (e.tags || []).map(function (t) {
        return '<button class="tl-tag" type="button" data-tag="' + esc(t) + '">#' + esc(t) + '</button>';
      }).join('');
      return '<div class="tl-item" data-id="' + esc(e.id) + '">'
        + '<div class="tl-date">' + Diary.formatDate(e.date) + ' · 第 ' + no + ' 条</div>'
        + '<div class="tl-title">' + (e.mood ? esc(e.mood) + ' ' : '') + esc(e.title) + '</div>'
        + '<div class="tl-text">' + esc(e.text) + '</div>'
        + (tags ? '<div class="tl-tags">' + tags + '</div>' : '')
        + '<div class="tl-foot">'
        + '<button class="like-btn" type="button" data-like="' + esc(e.id) + '">🐽 戳猪鼻 ' + (e.likes || 0) + '</button>'
        + '<button class="tl-edit" type="button" data-edit="' + esc(e.id) + '">编辑</button>'
        + '<button class="tl-del" type="button" data-del="' + esc(e.id) + '">删除</button>'
        + '</div></div>';
    }).join('');
  }

  /* ---------- 写 / 编辑 ---------- */
  function prepareWrite() {
    if (state.editingId) {
      $('#write-title').textContent = '编辑这条日记';
      $('#entry-submit').textContent = '🐽 保存修改';
      $('#entry-cancel').hidden = false;
    } else {
      $('#write-title').textContent = '写一条新日记';
      $('#entry-submit').textContent = '🐽 小猪记下啦';
      $('#entry-cancel').hidden = true;
      if (!$('#e-date').value) $('#e-date').value = Diary.todayKey();
    }
  }

  function resetEntryForm() {
    state.editingId = null;
    $('#entry-form').reset();
    $('#e-date').value = Diary.todayKey();
    $$('#entry-mood span').forEach(function (s) {
      s.classList.remove('active');
      s.setAttribute('aria-pressed', 'false');
    });
    prepareWrite();
  }

  function startEdit(id) {
    var e = store.findEntry(id);
    if (!e) return;
    state.editingId = e.id;
    $('#e-date').value = e.date;
    $('#e-title').value = e.title;
    $('#e-text').value = e.text;
    $('#e-tags').value = (e.tags || []).join(', ');
    $$('#entry-mood span').forEach(function (s) {
      var on = s.textContent === e.mood;
      s.classList.toggle('active', on);
      s.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    go('write');
  }

  function setupEntryForm() {
    $('#entry-mood').addEventListener('click', function (ev) {
      selectMood(ev.target.closest('span'), '#entry-mood');
    });
    $('#entry-mood').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        selectMood(ev.target.closest('span'), '#entry-mood');
      }
    });

    $('#entry-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var title = $('#e-title').value.trim();
      var text = $('#e-text').value.trim();
      var date = $('#e-date').value;
      if (!Diary.isDate(date)) date = Diary.todayKey();
      var active = $('#entry-mood .active');
      var mood = active ? active.textContent : '';
      var tags = parseTags($('#e-tags').value);

      if (!title) { toast('给这一天起个标题吧 🐷'); $('#e-title').focus(); return; }
      if (!text) { toast('还差一点点内容哦 🐷'); $('#e-text').focus(); return; }

      if (state.editingId) {
        store.updateEntry(state.editingId, { date: date, title: title, text: text, mood: mood, tags: tags });
        toast('改好啦 🐽');
      } else {
        store.addEntry({ date: date, title: title, text: text, mood: mood, tags: tags });
        toast('小猪记下啦 🐽');
      }
      resetEntryForm();
      go('timeline');
    });

    $('#entry-cancel').addEventListener('click', function () {
      resetEntryForm();
      go('timeline');
      toast('以为什么都没发生 🐷');
    });
  }

  function selectMood(el, group) {
    if (!el) return;
    var wasOn = el.classList.contains('active');
    $$(group + ' span').forEach(function (x) {
      x.classList.remove('active');
      x.setAttribute('aria-pressed', 'false');
    });
    if (!wasOn) {
      el.classList.add('active');
      el.setAttribute('aria-pressed', 'true');
    }
  }

  /* ---------- 小猪屋 ---------- */
  function renderItems() {
    if (!checkinDirty) renderCheckinForm();
    renderCheckinHistory();
    renderItemGrid();
  }

  /* ---------- 小猪屋：打卡 ---------- */
  function renderCheckinForm() {
    var c = store.getCheckin(Diary.todayKey()) || {};
    $('#c-weather').value = WEATHER[c.weather] ? c.weather : '晴';
    $('#c-quote').value = c.quote || '';
    $('#c-song').value = c.song || '';
    $('#c-note').value = c.note || '';
    $$('#c-mood span').forEach(function (s) {
      var on = s.textContent === (c.mood || '');
      s.classList.toggle('active', on);
      s.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setupCheckin() {
    function markDirty() { checkinDirty = true; }
    $('#check-form').addEventListener('input', markDirty);
    $('#check-form').addEventListener('change', markDirty);

    $('#c-mood').addEventListener('click', function (ev) {
      selectMood(ev.target.closest('span'), '#c-mood');
      markDirty();
    });
    $('#c-mood').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        selectMood(ev.target.closest('span'), '#c-mood');
        markDirty();
      }
    });

    $('#check-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var active = $('#c-mood .active');
      store.setCheckin(Diary.todayKey(), {
        quote: $('#c-quote').value.trim(),
        song: $('#c-song').value.trim(),
        weather: $('#c-weather').value,
        mood: active ? active.textContent : '',
        note: $('#c-note').value.trim()
      });
      checkinDirty = false;
      renderCheckinForm();
      renderCheckinHistory();
      renderHome();
      toast('今日打卡完成 🐾');
    });
  }

  function renderCheckinHistory() {
    var box = $('#checkin-history');
    var today = Diary.todayKey();
    var days = Object.keys(store.data.checkins).sort().reverse().slice(0, 8);

    if (!days.length) {
      box.innerHTML = '<div class="empty small"><span class="ep">📮</span>还没有打卡记录<br>每天一句，慢慢就有故事了</div>';
      return;
    }

    box.innerHTML = days.map(function (day) {
      var c = store.data.checkins[day] || {};
      var weather = c.weather ? ((WEATHER[c.weather] || '') + ' ' + c.weather).trim() : '';
      var bits = [];
      if (c.quote) bits.push('<div class="cq">“' + esc(c.quote) + '”</div>');
      if (c.song) bits.push('<div class="cs">🎵 ' + esc(c.song) + '</div>');
      if (c.note) bits.push('<div class="cs">📝 ' + esc(c.note) + '</div>');
      return '<div class="chk">'
        + '<div class="cm">' + esc(c.mood || '🐷') + '</div>'
        + '<div class="cb">'
        + '<div class="cd">' + Diary.formatShort(day) + ' · ' + Diary.relative(day, today) + (weather ? ' · ' + esc(weather) : '') + '</div>'
        + bits.join('')
        + '</div>'
        + '<button class="icon-btn" type="button" data-dcheckin="' + esc(day) + '" title="删除这天的打卡" aria-label="删除这天的打卡">✕</button>'
        + '</div>';
    }).join('');
  }

  /* ---------- 小猪屋：小物件 ---------- */
  function renderEmojiPicker() {
    var current = $('#i-icon').value || '🧸';
    $('#emoji-picker').innerHTML = EMOJIS.map(function (e) {
      var on = e === current;
      return '<button type="button" class="emo' + (on ? ' on' : '') + '" data-emo="' + e + '" aria-pressed="' + on + '">' + e + '</button>';
    }).join('');
  }

  function renderItemGrid() {
    var g = $('#item-grid');
    var items = store.data.items;
    $('#item-count').textContent = items.length ? items.length + ' 件' : '';

    if (!items.length) {
      g.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="ep">🧸</span>还没有收藏的小物件<br>把共同回忆的“东西”记下来吧</div>';
      return;
    }
    g.innerHTML = items.map(function (it) {
      return '<div class="item" data-id="' + esc(it.id) + '">'
        + '<button class="icon-btn x" type="button" data-ditem="' + esc(it.id) + '" title="移出小猪屋" aria-label="移出小猪屋">✕</button>'
        + '<span class="emo">' + esc(it.icon || '🧸') + '</span>'
        + '<div class="in">' + esc(it.name) + '</div>'
        + '<div class="id">' + Diary.formatShort(it.date) + '</div>'
        + (it.desc ? '<div class="id desc">' + esc(it.desc) + '</div>' : '')
        + '</div>';
    }).join('');
  }

  function setupItemForm() {
    var picker = $('#emoji-picker');
    picker.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-emo]');
      if (!btn) return;
      $('#i-icon').value = btn.dataset.emo;
      $$('#emoji-picker .emo').forEach(function (x) {
        x.classList.toggle('on', x === btn);
        x.setAttribute('aria-pressed', x === btn ? 'true' : 'false');
      });
    });

    $('#item-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = $('#i-name').value.trim();
      if (!name) { toast('给小物件起个名字吧 🐷'); $('#i-name').focus(); return; }
      store.addItem({ name: name, desc: $('#i-desc').value.trim(), icon: $('#i-icon').value || '🧸' });
      $('#item-form').reset();
      $('#i-icon').value = '🧸';
      renderEmojiPicker();
      renderItemGrid();
      renderHome();
      toast('收藏进小猪屋啦 🧸');
    });
  }

  /* ---------- 纪念日 ---------- */
  function renderMilestones() {
    renderTogetherDays();
    var box = $('#ms-list');
    var today = Diary.todayKey();
    var rows = store.data.milestones.map(function (m) {
      return { m: m, next: Diary.nextOccur(m.date, today) };
    }).sort(function (a, b) { return Diary.dayDiff(a.next, b.next); });

    if (!rows.length) {
      box.innerHTML = '<div class="empty"><span class="ep">🎂</span>还没有纪念日<br>添加一个值得倒数的日子吧</div>';
      return;
    }

    box.innerHTML = rows.map(function (row) {
      var m = row.m;
      var left = Diary.dayDiff(today, row.next);
      var passed = Diary.dayDiff(m.date, today);
      var em = TYPE_EMOJI[m.type] || '🎈';
      var dayText = left === 0 ? '今天' : left + ' 天';
      return '<div class="ms-item" data-id="' + esc(m.id) + '">'
        + '<span class="emo">' + em + '</span>'
        + '<div class="mi"><div class="mt">' + esc(m.title) + '</div>'
        + '<div class="md">' + Diary.formatDate(m.date) + (passed > 0 ? ' · 已经 ' + passed + ' 天' : '') + '</div></div>'
        + '<div class="days">' + (left === 0 ? '🎉' : left) + '<small>' + (left === 0 ? '就是今天' : '天后') + '</small></div>'
        + '<button class="icon-btn" type="button" data-dms="' + esc(m.id) + '" title="删除这个纪念日" aria-label="删除这个纪念日">✕</button>'
        + '</div>';
    }).join('');
  }

  function renderTogetherDays() {
    var anns = store.data.milestones
      .filter(function (m) { return m.type === 'anniversary'; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var box = $('#together-days');

    if (!anns.length) {
      box.innerHTML = '<div class="card empty small"><span class="ep">💑</span>添加一个“在一起的日子”<br>就能看到一起走过多少天啦</div>';
      return;
    }
    var days = Math.max(0, Diary.dayDiff(anns[0].date, Diary.todayKey()));
    box.innerHTML = '<div class="card together">'
      + '<div class="tg-label">我们已经在一起</div>'
      + '<div class="tg-days">' + days + '</div>'
      + '<div class="tg-label">天 · 每一天都是小猪日记</div></div>';
  }

  function setupMilestoneForm() {
    $('#ms-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var title = $('#m-title').value.trim();
      var date = $('#m-date').value;
      if (!title) { toast('给这个日子起个名字吧 🐷'); $('#m-title').focus(); return; }
      if (!Diary.isDate(date)) { toast('补上日期吧 🐷'); $('#m-date').focus(); return; }
      store.addMilestone({ title: title, date: date, type: $('#m-type').value });
      $('#ms-form').reset();
      renderMilestones();
      renderHome();
      toast('纪念日已加入倒数 🎈');
    });
  }

  /* ---------- 我们 ---------- */
  function renderUs() {
    var c = store.data.couple;
    $('#us-a').textContent = c.she || '小猪';
    $('#us-b').textContent = c.he || '饲养员';
    $('#us-text-a').value = c.she || '';
    $('#us-text-b').value = c.he || '';

    var d = store.data;
    $('#data-summary').textContent = '📔 ' + d.entries.length + ' 条日记 · 🧸 ' + d.items.length
      + ' 件小物件 · 🎂 ' + d.milestones.length + ' 个纪念日 · 📮 '
      + Object.keys(d.checkins).length + ' 次打卡';
  }

  function setupUs() {
    $('#us-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      store.setCouple($('#us-text-a').value, $('#us-text-b').value);
      renderUs();
      toast('称呼已更新 🐷');
    });
  }

  /* ---------- 备份 ---------- */
  function exportData() {
    var text = store.exportJSON();
    var filename = '小猪日记备份-' + Diary.todayKey() + '.json';

    // 装在 Android App 里：交给原生写到「下载」目录
    if (window.AndroidPig && typeof window.AndroidPig.saveBackup === 'function') {
      try {
        window.AndroidPig.saveBackup(text, filename);
        toast('正在保存备份文件…🐽');
        return;
      } catch (e) { /* 出问题就退回浏览器下载 */ }
    }

    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('备份文件已下载 🐽');
    } catch (e) {
      toast('导出失败了，换个浏览器试试？');
    }
  }

  function shareBackup() {
    var text = store.exportJSON();
    var filename = '小猪日记备份-' + Diary.todayKey() + '.json';
    try {
      var file = new File([text], filename, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: '小猪日记备份' })
          .then(function () { toast('发出去啦，对方用「导入备份」接收 🐽'); })
          .catch(function () { /* 用户取消，不打扰 */ });
        return;
      }
    } catch (e) { /* 不支持就退回下载 */ }
    exportData();
  }

  function importFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var added = store.importJSON(reader.result);
        checkinDirty = false;
        renderAll();
        if (added.entries + added.items + added.milestones + added.checkins === 0) {
          toast('这份备份里的回忆都已经在啦 🐷');
        } else {
          toast('导入完成：+' + added.entries + ' 篇日记，+' + added.items + ' 件小物件，+' + added.milestones + ' 个纪念日');
        }
      } catch (err) {
        toast('这个文件读不出来，确认是备份文件吗？');
      }
    };
    reader.onerror = function () { toast('文件读取失败了'); };
    reader.readAsText(file, 'utf-8');
  }

  function clearAll() {
    if (!confirm('清空后，日记、打卡、小物件、纪念日都会消失，确定吗？')) return;
    if (!confirm('再确认一次：真的不要它们了吗？🐷')) return;
    store.reset();
    checkinDirty = false;
    resetEntryForm();
    renderAll();
    toast('小猪屋已经清空啦');
  }

  function setupBackup() {
    $('#btn-export').addEventListener('click', exportData);
    $('#file-import').addEventListener('change', importFile);
    $('#btn-clear').addEventListener('click', clearAll);

    // 「分享给对方」：只在系统支持分享文件时出现（iOS Safari / 安卓 Chrome）
    var shareBtn = $('#btn-share');
    if (shareBtn) {
      var canShareFile = false;
      try {
        var probe = new File(['{}'], 'pig.json', { type: 'application/json' });
        canShareFile = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [probe] }));
      } catch (e) { canShareFile = false; }
      shareBtn.hidden = !canShareFile;
      shareBtn.addEventListener('click', shareBackup);
    }
    // 键盘触发 label 打开的隐藏 input
    $('label[for="file-import"]').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('#file-import').click(); }
    });
  }

  /* ---------- 两台手机同步 ---------- */
  function syncStatusText(info) {
    var el = $('#sync-status');
    if (!el || !info) return;
    if (info.state === 'syncing') { el.textContent = '正在同步…'; return; }
    if (info.state === 'error') {
      el.textContent = '这次没同步成功（' + (info.error || '网络不通') + '），1 分钟后再试。';
      return;
    }
    if (!PigSync.enabled()) { el.textContent = ''; return; }
    var t = info.lastAt ? new Date(info.lastAt) : null;
    el.textContent = t
      ? '上次同步 ' + t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + ' · 会自动保持最新'
      : '已连接，正在等第一次同步…';
  }

  function refreshSyncUI() {
    if (!PigSync || !PigSync.configured || !PigSync.configured()) return;
    var card = $('#sync-card');
    if (card) card.hidden = false;
    var on = PigSync.enabled();
    var offBox = $('#sync-off'), onBox = $('#sync-on');
    if (!offBox || !onBox) return;
    offBox.hidden = on;
    onBox.hidden = !on;
    $('#sync-code-show').textContent = on ? PigSync.code() : '';
    syncStatusText({ state: PigSync.state(), lastAt: PigSync.lastAt() });
  }

  function setupSync() {
    if (!PigSync || !PigSync.configured()) return;
    PigSync.init({
      render: function () {
        renderAll();
        if (window.PigPen) window.PigPen.render();
      },
      status: function (info) { refreshSyncUI(); syncStatusText(info); }
    });
    refreshSyncUI();

    $('#btn-sync-create').addEventListener('click', function () {
      if (!confirm('生成一串配对码，把它发给对方，对方在下面粘贴就能连上。\n（配对码相当于钥匙，只发给你们俩）') ) return;
      PigSync.createSpace().then(function (code) {
        refreshSyncUI();
        toast('配对码：' + code);
      }).catch(function (e) { toast('没连上：' + ((e && e.message) || '检查一下网络')); });
    });

    $('#btn-sync-join').addEventListener('click', function () {
      PigSync.joinSpace($('#sync-code').value).then(function () {
        $('#sync-code').value = '';
        refreshSyncUI();
        toast('连上啦，正在合并日记 🐷');
      }).catch(function (e) { toast((e && e.message) || '配对码好像不对'); });
    });

    $('#btn-sync-copy').addEventListener('click', function () {
      var code = PigSync.code();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { toast('配对码已复制 🐽'); })
          .catch(function () { toast(code); });
      } else {
        toast(code);
      }
    });

    $('#btn-sync-now').addEventListener('click', function () {
      PigSync.syncNow().then(function (ok) { toast(ok ? '同步完成 🐽' : '这次没成，等会儿自动重试'); });
    });

    $('#btn-sync-off').addEventListener('click', function () {
      if (!confirm('断开后这台手机就不再和对方同步了，已经有的日记都会留在本机。确定吗？')) return;
      PigSync.leave();
      refreshSyncUI();
      toast('已断开同步');
    });
  }

  /* ---------- 搜索 ---------- */
  function setupSearch() {
    var input = $('#tl-search');
    input.addEventListener('input', function () {
      state.query = input.value;
      $('#tl-clear').hidden = !input.value;
      renderTimelineList();
    });
    $('#tl-clear').addEventListener('click', function () {
      input.value = '';
      state.query = '';
      $('#tl-clear').hidden = true;
      renderTimelineList();
      input.focus();
    });
  }

  /* ---------- 装到主屏（PWA） ---------- */
  var installPrompt = null;
  var PAGES = ['home', 'timeline', 'write', 'items', 'milestone', 'us'];

  function pageFromHash() {
    var h = String(location.hash || '').replace(/^#\/?/, '');
    return PAGES.indexOf(h) !== -1 ? h : 'home';
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true ||
      !!window.AndroidPig ||
      /[?&]app=1(&|$|\b)/.test(location.search);
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      navigator.maxTouchPoints > 1;
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isWeChat() {
    return /MicroMessenger/i.test(navigator.userAgent);
  }

  function updateApkUI() {
    var btn = document.getElementById('btn-apk');
    var note = document.getElementById('apk-note');
    if (!btn) return;
    // 安卓普通浏览器里才提供安装包；已经装在手机上了就不显示
    var show = isAndroid() && !window.AndroidPig && !isStandalone();
    btn.hidden = !show;
    if (!note) return;
    note.hidden = !show;
    if (show) {
      note.innerHTML = isWeChat()
        ? '⚠️ 微信里下不了安装包：点右上角 <b>···</b> → 「在浏览器打开」，再点上面的按钮。'
        : '想要更像 App（桌面图标、能接收分享）就装这个；不装也能用，加主屏幕也一样。';
    }
  }

  function updateInstallUI() {
    var card = $('#install-card');
    if (!card) return;
    updateApkUI();

    if (isStandalone()) {
      card.hidden = true;
      return;
    }

    var hint = $('#install-hint');
    var btn = $('#btn-install');
    var note = $('#install-note');
    var baseNote = '装好后从桌面图标打开，全屏无地址栏，断网也能写日记。';
    btn.hidden = true;
    note.hidden = true;
    note.innerHTML = baseNote;

    if (installPrompt) {
      card.hidden = false;
      hint.textContent = isMobile()
        ? '把「小猪日记」装成手机上的一个 App，从桌面一点就开。'
        : '把「小猪日记」装成电脑上的一个应用，从桌面一点就开。';
      btn.hidden = false;
      note.hidden = false;
    } else if (isIOS()) {
      card.hidden = false;
      hint.innerHTML = '用 <b>Safari</b> 打开本页 → 点底部「分享」<span class="k">⬆</span> → 选「添加到主屏幕」。';
      note.hidden = false;
      note.innerHTML = baseNote +
        '<br>如果是从微信/QQ 点进来的，先点右上角「···」→「在浏览器中打开」，再按上面的步骤添加。';
    } else if (isMobile()) {
      card.hidden = false;
      hint.innerHTML = '点浏览器右上角的菜单 <span class="k">⋮</span> → 选「安装应用」或「添加到主屏幕」。';
      note.hidden = false;
    } else {
      // 桌面浏览器又没有安装意向事件：不打扰
      card.hidden = true;
    }
  }

  function setupInstall() {
    var btn = $('#btn-install');
    if (btn) {
      btn.addEventListener('click', function () {
        if (!installPrompt) { updateInstallUI(); return; }
        var prompt = installPrompt;
        installPrompt = null;
        prompt.prompt();
        var choice = prompt.userChoice;
        if (choice && typeof choice.then === 'function') {
          choice.then(function (res) {
            if (res && res.outcome === 'accepted') toast('正在安装…🐷');
            updateInstallUI();
          });
        } else {
          updateInstallUI();
        }
      });
    }
    updateInstallUI();
  }

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // 装在 App 里时资源本来就全在本地，不需要 Service Worker
    if (window.AndroidPig) return;

    var start = function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              toast('有新版本啦，下次打开就是新版 🐷');
            }
          });
        });
      }).catch(function () { /* file:// 或非安全上下文：忽略 */ });
    };

    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);
  }

  function setupNetwork() {
    window.addEventListener('offline', function () {
      toast('现在离线了，日记依然会存在本机 🐷');
    });
    window.addEventListener('online', function () {
      toast('网络回来啦');
    });
  }

  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    installPrompt = ev;
    updateInstallUI();
  });

  window.addEventListener('appinstalled', function () {
    installPrompt = null;
    updateInstallUI();
    toast('装好啦，去桌面找小猪吧 🐷');
  });

  /* ---------- 事件委托 ---------- */
  function setupDelegates() {
    document.addEventListener('click', function (ev) {
      var el;

      if ((el = ev.target.closest('[data-like]'))) {
        var n = store.likeEntry(el.getAttribute('data-like'));
        el.textContent = '🐽 戳猪鼻 ' + n;
        el.classList.add('on');
        toast('小猪被你戳到啦 🐽');
        return;
      }

      if ((el = ev.target.closest('[data-edit]'))) {
        startEdit(el.getAttribute('data-edit'));
        return;
      }

      if ((el = ev.target.closest('[data-del]'))) {
        if (confirm('小猪捂嘴问：真的要删掉这条吗？')) {
          store.delEntry(el.getAttribute('data-del'));
          renderTimeline();
          renderHome();
          toast('这条被小猪藏起来啦');
        }
        return;
      }

      // 点卡片本身（不是里面的按钮）= 打开编辑：手机上比戳「编辑」两个字好按多了
      if ((el = ev.target.closest('.tl-item'))) {
        startEdit(el.getAttribute('data-id'));
        return;
      }

      if ((el = ev.target.closest('[data-tag]'))) {
        state.tag = el.getAttribute('data-tag');
        renderTimeline();
        return;
      }

      if ((el = ev.target.closest('[data-ditem]'))) {
        if (confirm('把这件小物件从小猪屋拿走吗？')) {
          store.delItem(el.getAttribute('data-ditem'));
          renderItemGrid();
          renderHome();
          toast('已移出小猪屋');
        }
        return;
      }

      if ((el = ev.target.closest('[data-dms]'))) {
        if (confirm('删掉这个纪念日吗？')) {
          store.delMilestone(el.getAttribute('data-dms'));
          renderMilestones();
          renderHome();
          toast('纪念日已删除');
        }
        return;
      }

      if ((el = ev.target.closest('[data-dcheckin]'))) {
        if (confirm('删除这天的打卡记录吗？')) {
          store.delCheckin(el.getAttribute('data-dcheckin'));
          renderCheckinHistory();
          renderHome();
          toast('打卡记录已删除');
        }
      }
    });
  }

  /* ---------- 回到顶部 ---------- */
  function setupToTop() {
    var btn = $('#toTop');
    window.addEventListener('scroll', function () {
      btn.classList.toggle('show', window.scrollY > 300);
    }, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- 爱心飘落 ---------- */
  function spawnHearts() {
    var box = $('.hearts');
    if (!box) return;
    for (var i = 0; i < 8; i++) {
      var h = document.createElement('i');
      h.textContent = ['❤', '💗', '💕', '🩷'][i % 4];
      h.style.left = Math.random() * 100 + '%';
      h.style.animationDuration = (4 + Math.random() * 4) + 's';
      h.style.animationDelay = Math.random() * 3 + 's';
      h.style.fontSize = (10 + Math.random() * 10) + 'px';
      box.appendChild(h);
    }
  }

  /* ---------- 演示数据 ---------- */
  function seedDemo() {
    var flag;
    try { flag = localStorage.getItem('pig_diary_demo'); } catch (e) { flag = '1'; }
    if (flag || store.data.entries.length) return;
    store.addEntry({
      date: Diary.todayKey(),
      title: '欢迎来到小猪日记 🐷',
      text: '从今天起，把我们的点点滴滴都记在这里吧～每一条都会是小猪最宝贝的回忆。',
      mood: '🥰',
      tags: ['开始']
    });
    try { localStorage.setItem('pig_diary_demo', '1'); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 渲染全部 ---------- */
  function renderAll() {
    renderHome();
    renderTimeline();
    if (!checkinDirty) renderCheckinForm();
    renderCheckinHistory();
    renderItemGrid();
    renderMilestones();
    renderUs();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    seedDemo();

    setupEntryForm();
    setupCheckin();
    setupItemForm();
    setupMilestoneForm();
    setupUs();
    setupBackup();
    setupSync();
    setupSearch();
    setupInstall();
    setupServiceWorker();
    setupNetwork();
    setupDelegates();
    setupToTop();
    renderEmojiPicker();

    $$('.tabbar button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.page === 'write' && state.editingId) resetEntryForm();
        go(b.dataset.page);
      });
    });

    $('#go-write').addEventListener('click', function () {
      if (state.editingId) resetEntryForm();
      go('write');
    });
    $('#go-checkin').addEventListener('click', function () { go('items'); });

    renderAll();
    go(pageFromHash());
    spawnHearts();

    // 给 pen.js 用的小提示条
    window.PigDiaryToast = toast;

    window.addEventListener('hashchange', function () {
      var p = pageFromHash();
      if (p !== state.page) go(p);
    });

    // 跨过零点后回到首页，日期相关的内容自动刷新
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) renderAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();