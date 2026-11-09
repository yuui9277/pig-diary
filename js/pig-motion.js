/* ===== 小猪行为插件：pig-motion =====
 *
 * 给 3D 小猪（以及不支持 WebGL 时的 CSS 小猪）加一套"自己会动"的行为：
 *   - 在小窝里自己挑地方，一小跳一小跳地走过去（走走停停，不是固定轨迹）
 *   - 停下时东张西望、原地弹两下、凑近嗅一嗅
 *   - 被摸头 / 喂食 / 哄睡时乖乖停住看镜头，睡觉只剩轻轻呼吸
 *   - 带挤压拉伸（squash & stretch）和落地压扁，动作不那么"塑料"
 *
 * 设计成一个独立插件：pig3d.js 每帧问它要一次姿态；把它删掉或 disable()
 * 就退回 pig3d.js 原来的固定轨迹，互不影响。没有 WebGL 时页面继续用
 * CSS 小猪（css/pen.css 里的 pig-idle / pig-move 两段关键帧）。
 *
 * 用法：
 *   PigMotion.disable();          // 关掉自动溜达（小猪站着不动）
 *   PigMotion.enable();           // 再打开
 *   PigMotion.setMood('calm');    // calm | playful | sleepy  (默认 playful)
 *   PigMotion.behavior            // 当前行为，调试用：idle/walk/hop/look/sniff/sleep
 */
(function () {
  'use strict';

  var CFG = {
    walkSpeed: 0.46,     // 每秒走多少 3D 单位
    turnSpeed: 3.6,      // 转身速度（弧度/秒）
    stepFreq: 2.4,       // 每秒蹦几下
    hopHeight: 0.05,     // 走路时抬多高
    squash: 0.06,        // 挤压拉伸幅度
    idleMin: 0.5,        // 两次动作之间至少发呆多久（秒）
    idleMax: 1.3,
    minTravel: 0.35,     // 太近的目标点就重选，避免原地抖
    maxYaw: 0.55,        // 最多侧多少度（保持脸朝镜头）
    zMin: -0.17,         // 前后活动范围（负 = 往后）
    zMax: 0.13
  };

  var MOODS = {
    calm: { idleScale: 1.4, walkChance: 0.52, hopChance: 0.14, lookChance: 0.20, speed: 0.38 },
    playful: { idleScale: 1.0, walkChance: 0.66, hopChance: 0.14, lookChance: 0.10, speed: 0.54 },
    sleepy: { idleScale: 2.4, walkChance: 0.22, hopChance: 0.05, lookChance: 0.55, speed: 0.30 }
  };

  var state = {
    enabled: true,
    mood: 'playful',
    mode: 'idle',
    t: 0,            // 插件自己的时钟
    modeT: 0,        // 当前行为已经进行多久
    modeLen: 1.6,    // 当前行为总时长
    x: 0, z: 0,
    tx: 0, tz: 0,
    yaw: 0,
    gait: 0,
    lift: 0,
    squash: 1,
    hops: 0,
    lookDir: 1,
    boring: 0,       // 连着几次没挪窝，就强制走一段
    started: false,  // 开场第一件事就是走两步，别一进来先发呆
    breathe: 0,
    lastX: 0, lastZ: 0
  };

  function mood() {
    return MOODS[state.mood] || MOODS.playful;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function easeOut(k) {
    return 1 - (1 - k) * (1 - k);
  }

  /* 选一个新目标点：别太近、别出地毯 */
  function pickTarget(ctx) {
    var limit = Math.max(0.24, (ctx.xLimit || 0.6) * 0.86);
    var x = 0, z = 0;
    for (var i = 0; i < 6; i++) {
      x = rand(-limit, limit);
      z = rand(CFG.zMin, CFG.zMax);
      if (Math.hypot(x - state.x, z - state.z) >= CFG.minTravel) break;
    }
    state.tx = x;
    state.tz = z;
  }

  function enter(mode, ctx) {
    state.mode = mode;
    state.modeT = 0;
    if (mode === 'walk') state.boring = 0;
    else if (mode === 'hop' || mode === 'look' || mode === 'sniff') state.boring++;
    if (mode === 'idle') {
      state.modeLen = rand(CFG.idleMin, CFG.idleMax) * mood().idleScale;
      state.hops = 0;
    } else if (mode === 'walk') {
      pickTarget(ctx);
      state.modeLen = 6.0;              // 兜底：走太久就重新决定
    } else if (mode === 'hop') {
      state.modeLen = rand(0.9, 1.5);
      state.hops = 0;
    } else if (mode === 'look') {
      state.modeLen = rand(1.4, 2.6);
      state.lookDir = Math.random() < 0.5 ? -1 : 1;
    } else if (mode === 'sniff') {
      state.modeLen = rand(1.0, 1.8);
    } else {
      state.modeLen = 1;
    }
  }

  /* 发呆结束：按心情抽下一个动作 */
  function decide(ctx) {
    // 连着两次原地动，就强制它走一段，别一直站着
    if (state.boring >= 2) {
      enter('walk', ctx);
      return;
    }
    var m = mood();
    var r = Math.random();
    if (r < m.walkChance) {
      enter('walk', ctx);
    } else if (r < m.walkChance + m.hopChance) {
      enter('hop', ctx);
    } else if (r < m.walkChance + m.hopChance + m.lookChance) {
      enter('look', ctx);
    } else {
      enter('sniff', ctx);
    }
  }

  function tick(dt, ctx) {
    state.t += dt;
    state.modeT += dt;

    if (!state.started && !ctx.paused && !ctx.sleeping && !ctx.dragging) {
      state.started = true;
      enter('walk', ctx);
    }

    // 被摸头/喂食/哄睡：站定看镜头，只有轻微呼吸
    if (ctx.paused || ctx.sleeping || ctx.dragging) {
      state.gait += dt * 1.2;
      state.lift = ctx.sleeping
        ? Math.sin(state.t * 1.15) * 0.008
        : Math.sin(state.t * 2.2) * 0.006;
      state.squash = 1 + (ctx.sleeping ? 0.004 : 0.008) * Math.sin(state.t * 2.2);
      state.yaw += (0 - state.yaw) * Math.min(1, dt * 3);
      state.mode = ctx.sleeping ? 'sleep' : 'hold';
      state.modeT = 0;
      if (!ctx.dragging) { state.tx = state.x; state.tz = state.z; }
      return;
    }

    if (state.mode === 'hold' || state.mode === 'sleep') {
      enter('idle', ctx);
    }

    var speed = mood().speed;

    if (state.mode === 'walk') {
      var dx = state.tx - state.x;
      var dz = state.tz - state.z;
      var dist = Math.hypot(dx, dz);

      if (dist < 0.05) {
        enter('idle', ctx);
      } else {
        // 目标方向 → 身体侧一点，保持脸朝镜头
        var wantYaw = clamp(dx * 1.5, -CFG.maxYaw, CFG.maxYaw);
        state.yaw += (wantYaw - state.yaw) * Math.min(1, dt * CFG.turnSpeed);

        // 先转得差不多再迈步，看起来不像"滑步"
        var facing = 1 - Math.min(1, Math.abs(wantYaw - state.yaw) / 0.45);
        var v = speed * (0.35 + 0.65 * facing);
        var step = Math.min(dist, v * dt);
        state.x += (dx / dist) * step;
        state.z += (dz / dist) * step;

        // 蹦跳步态：抬脚 + 落地压扁
        state.gait += dt * Math.PI * 2 * CFG.stepFreq * (0.4 + 0.6 * facing);
        var hop = Math.abs(Math.sin(state.gait));
        state.lift = hop * CFG.hopHeight * (0.6 + 0.4 * facing);
        state.squash = 1 + CFG.squash * Math.cos(state.gait * 2) * 0.5
                       - (1 - hop) * CFG.squash * 0.6;

        if (state.modeT > state.modeLen) enter('idle', ctx);   // 走太久，重选
      }

    } else if (state.mode === 'hop') {
      // 原地弹两下：起跳拉长，落地压扁
      var k = Math.sin(state.modeT * Math.PI * 2 / 0.62);
      state.lift = Math.max(0, k) * 0.075;
      state.squash = 1 + (k > 0 ? 0.05 : -0.06) * Math.abs(k);
      state.yaw += (0 - state.yaw) * Math.min(1, dt * 4);
      var cycles = Math.floor(state.modeT / 0.62);
      if (cycles > state.hops) state.hops = cycles;
      if (state.modeT > state.modeLen) enter('idle', ctx);

    } else if (state.mode === 'look') {
      // 东张西望：慢慢左右转头，身体跟着晃
      var sway = Math.sin(state.modeT * 1.7) * state.lookDir;
      state.yaw += (sway * CFG.maxYaw * 0.75 - state.yaw) * Math.min(1, dt * 2.2);
      state.gait += dt * 1.6;
      state.lift = Math.abs(Math.sin(state.gait)) * 0.012;
      state.squash = 1 + Math.sin(state.gait * 2) * 0.012;
      if (state.modeT > state.modeLen) enter('idle', ctx);

    } else if (state.mode === 'sniff') {
      // 凑近嗅一嗅：往前探一下再退回来
      var p = Math.min(1, state.modeT / 0.5);
      var back = state.modeT > state.modeLen - 0.5
        ? Math.min(1, (state.modeT - (state.modeLen - 0.5)) / 0.5) : 0;
      var lean = easeOut(p) * (1 - easeOut(back));
      state.z = state.lastZ * (1 - lean) + (CFG.zMax + 0.05) * lean;
      state.yaw += (0 - state.yaw) * Math.min(1, dt * 3);
      state.gait += dt * 3.2;
      state.lift = Math.abs(Math.sin(state.gait)) * 0.008;
      state.squash = 1 - lean * 0.035;
      if (state.modeT > state.modeLen) {
        state.z = state.lastZ;
        enter('idle', ctx);
      }

    } else {
      // 发呆：呼吸 + 很小的重心晃
      state.breathe = Math.sin(state.t * Math.PI * 2 / 2.1);
      state.lift = state.breathe * 0.008;
      state.squash = 1 + state.breathe * 0.008;
      state.yaw += (Math.sin(state.t * 0.9) * 0.06 - state.yaw) * Math.min(1, dt * 1.5);
      state.lastX = state.x;
      state.lastZ = state.z;
      if (state.modeT > state.modeLen) decide(ctx);
    }

    // 离开嗅一嗅/走路时，记住落脚点
    if (state.mode !== 'sniff') { state.lastX = state.x; state.lastZ = state.z; }

    // 别出地毯
    var lim = Math.max(0.24, (ctx.xLimit || 0.6) * 0.9);
    state.x = clamp(state.x, -lim, lim);
    state.z = clamp(state.z, CFG.zMin - 0.04, CFG.zMax + 0.06);
  }

  var api = {
    version: '1.0.0',

    enable: function () {
      state.enabled = true;
      return api;
    },

    disable: function () {
      state.enabled = false;
      return api;
    },

    toggle: function () {
      state.enabled ? api.disable() : api.enable();
      return state.enabled;
    },

    isEnabled: function () { return state.enabled; },

    setMood: function (name) {
      if (MOODS[name]) state.mood = name;
      return api;
    },

    get behavior() { return state.mode; },

    /* 供 pig3d.js 每帧调用：返回这一帧的姿态 */
    update: function (dt, ctx) {
      if (!state.enabled) return null;
      dt = Math.min(Math.max(dt || 0.016, 0.001), 0.05);
      ctx = ctx || {};
      tick(dt, ctx);
      return {
        x: state.x,
        z: state.z,
        yaw: state.yaw,
        lift: state.lift,
        squash: state.squash,
        mode: state.mode
      };
    }
  };

  window.PigMotion = api;
})();