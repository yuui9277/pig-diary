/* ===== 小猪窝：养成互动 =====
 * 喂食 / 摸头 / 睡觉，成长值让体型变大，连续 7 天戴王冠。
 * 数据存在 store.data.pen 里，会跟着同步走。
 */
(function () {
  'use strict';

  var PD = window.PigDiary;
  if (!PD || !PD.store) return;
  var store = PD.store;

  var pig = document.getElementById('pig');
  if (!pig) return;

  var scene = document.getElementById('pen-scene');
  var card = document.getElementById('pen-card');
  var fx = document.getElementById('pen-fx');
  var crown = document.getElementById('pig-crown');
  var zzz = document.getElementById('pig-zzz');
  var hint = document.getElementById('pen-hint');
  var elHunger = document.getElementById('pen-hunger');
  var elGrowth = document.getElementById('pen-growth');
  var elStreak = document.getElementById('pen-streak');

  var sleeping = false;
  var sleepTimer = null;
  var crownCelebrated = false;
  var CROWN_DAYS = 7;

  function pen() {
    if (!store.data.pen) store.data.pen = { hunger: 0, pats: 0, naps: 0, growth: 0, days: {}, updatedAt: 0 };
    return store.data.pen;
  }

  function streak() {
    try { return PD.penStreak(pen().days); } catch (e) { return 0; }
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var p = pen();
    var s = streak();

    elHunger.textContent = p.hunger;
    elGrowth.textContent = p.growth;
    elStreak.textContent = s;

    // 体型：0 次 → 1.0，100 次 → 1.35（封顶，别把版面撑破）
    var grow = 1 + Math.min(0.35, p.growth * 0.0035);
    if (card) card.style.setProperty('--grow', grow.toFixed(3));

    crown.hidden = s < CROWN_DAYS;
    zzz.className = 'pig-zzz' + (sleeping ? ' show' : '');

    if (window.PigPen3D) {
      window.PigPen3D.setGrowth(grow);
      window.PigPen3D.setCrown(s >= CROWN_DAYS);
      window.PigPen3D.setSleeping(sleeping);
    }

    if (s >= CROWN_DAYS && !crownCelebrated) {
      crownCelebrated = true;
      if (window.PigDiaryToast) window.PigDiaryToast('连续互动 ' + s + ' 天，小猪戴上小王冠啦 👑');
    }

    hint.textContent = sleeping
      ? '小猪睡着了，点一下叫醒它 💤'
      : (s >= CROWN_DAYS
        ? '已经连续互动 ' + s + ' 天，王冠戴稳了 👑'
        : '点点小猪摸摸头，喂饱它就会慢慢长大～');
  }

  /* ---------- 小特效 ---------- */
  function pop(text, cls, left) {
    if (!fx) return;
    var el = document.createElement('span');
    el.className = 'pen-pop ' + (cls || '');
    el.textContent = text;
    el.style.left = (left == null ? 46 + Math.random() * 16 : left) + '%';
    fx.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1600);
  }

  function hearts(n) {
    var all = ['❤️', '💕', '💗', '💖'];
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () {
          pop(all[i % all.length], 'emoji float', 30 + Math.random() * 40);
        }, i * 110);
      })(i);
    }
  }

  function wiggle(cls, ms) {
    pig.className = 'pig pig-element ' + cls;
    setTimeout(function () { pig.className = 'pig pig-element'; }, ms || 700);
  }

  /* ---------- 睡觉状态 ---------- */
  function wake() {
    if (!sleeping) return;
    sleeping = false;
    scene.classList.remove('sleeping');
    pig.classList.remove('sleeping');
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
    render();
  }

  function goSleep() {
    sleeping = true;
    scene.classList.add('sleeping');
    pig.classList.remove('pig', 'feeding', 'patting');
    pig.className = 'pig pig-element sleeping';
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = setTimeout(function () { wake(); }, 15000);   // 15 秒后自己醒
    render();
  }

  /* ---------- 三种互动 ---------- */
  function feed() {
    wake();
    wiggle('feeding', 950);
    pop('饱腹度 +1', '');
    setTimeout(function () { pop('🍎', 'emoji float', 22); }, 80);
    if (window.PigPen3D) window.PigPen3D.play('feed');
    var res = store.penRun('feed');
    render();
    if (res.isNewDay) pop('新的一天 🌞', '', 50);
  }

  function pat() {
    wake();
    wiggle('patting', 1000);
    hearts(3);
    if (window.PigPen3D) window.PigPen3D.play('pat');
    var res = store.penRun('pat');
    render();
    if (res.isNewDay) pop('新的一天 🌞', '', 50);
  }

  function nap() {
    if (sleeping) { wake(); return; }
    var res = store.penRun('sleep');
    goSleep();
    pop('zZ', '', 54);
    if (res.isNewDay) pop('新的一天 🌞', '', 50);
  }

  /* ---------- 绑定 ---------- */
  function on(el, fn) {
    if (!el) return;
    el.addEventListener('click', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      fn();
    });
  }

  on(pig, function () { if (sleeping) { wake(); } else { pat(); } });
  on(document.getElementById('btn-feed'), feed);
  on(document.getElementById('btn-pat'), pat);
  on(document.getElementById('btn-sleep'), nap);

  // 点场景空白处也能摸摸头
  if (scene) {
    scene.addEventListener('click', function (ev) {
      if (ev.target === scene || ev.target === fx) {
        if (sleeping) wake(); else pat();
      }
    });
  }

  // 从别的页面回来、或同步拉到了新数据时刷新
  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) render();
  });

  // 暴露给 app.js / sync 调用
  window.PigPen = {
    render: render,
    wake: wake,
    feed: feed,
    pat: pat,
    nap: nap,
    streak: streak
  };

  render();
})();