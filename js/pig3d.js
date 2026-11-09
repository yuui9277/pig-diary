/* ===== 小猪窝：WebGL 3D 小猪（盲盒手办风） =====
 *
 * 造型：坐姿全身，头大身小（头 ≈ 1.5 个身体），穿一件印着小猪脸的粉色连体服，
 * 头顶压着半个橘子，背一个黄色小背包；下垂软耳、小黑豆眼、粉鼻头、两坨腮红、卷尾巴。
 * 场景：白色星星地毯、身后一串星星灯、旁边一小盒薯条，粉色暖光。
 *
 * 动作：自己在小窝里随机挪位置（一小跳一小跳地蹦过去），偶尔停下东张西望；
 * 摸它 / 喂它 / 哄睡时停下来正对你。
 * 降级：不支持 WebGL / three.js 没加载成功 → 页面继续用 CSS 小猪，不会白屏。
 */
(function () {
  'use strict';

  function boot() {
    var THREE = window.THREE;
    var canvas = document.getElementById('pig3d');
    var sceneBox = document.getElementById('pen-scene');
    if (!THREE || !canvas || !sceneBox) return;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      return;                       // 没有 WebGL，退回 CSS 小猪
    }
    if (!renderer || !renderer.getContext()) return;

    // 像素比按设备能力分档：低端机 1.5，常规 2，高分屏最多 2（再高只是白烧电）
    var dprCap = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.SRGBColorSpace && 'outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (THREE.ACESFilmicToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.96;
    }
    // 真阴影：手办最怕"飘"在画面里
    if (THREE.PCFSoftShadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

    /* ---------- 灯光：影棚三点光 + 柔和环境反射 ---------- */
    var hemi = new THREE.HemisphereLight(0xfff2f7, 0xe6d6e4, 0.26);
    scene.add(hemi);

    var key = new THREE.DirectionalLight(0xfff4ec, 0.9);
    key.position.set(-2.7, 3.5, 4.1);
    if (THREE.PCFSoftShadowMap) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -2.8;
      key.shadow.camera.right = 2.8;
      key.shadow.camera.top = 3.4;
      key.shadow.camera.bottom = -1.8;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 14;
      key.shadow.bias = -0.0012;
      key.shadow.normalBias = 0.02;
    }
    scene.add(key);

    var fill = new THREE.DirectionalLight(0xeae4ff, 0.22);
    fill.position.set(3.6, 2.0, 2.6);
    scene.add(fill);

    var rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(-1.0, 2.8, -3.8);
    scene.add(rim);

    var ambient = new THREE.AmbientLight(0xffeef3, 0.05);
    scene.add(ambient);

    /* 程序化环境贴图：给漆面/清漆一点点真实反光，不然像塑料玩具 */
    (function studioEnv() {
      try {
        var c = document.createElement('canvas');
        c.width = 256; c.height = 128;
        var g = c.getContext('2d');
        var bg = g.createLinearGradient(0, 0, 0, 128);
        bg.addColorStop(0, '#f2e7ea');
        bg.addColorStop(0.42, '#e9d3dd');
        bg.addColorStop(0.78, '#cdbbcf');
        bg.addColorStop(1, '#a997ab');
        g.fillStyle = bg;
        g.fillRect(0, 0, 256, 128);
        [[64, 30, 52, 0.9], [196, 22, 36, 0.7], [214, 96, 44, 0.28]].forEach(function (b) {
          var rg = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
          rg.addColorStop(0, 'rgba(255,255,255,' + b[3] + ')');
          rg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = rg;
          g.beginPath();
          g.arc(b[0], b[1], b[2], 0, Math.PI * 2);
          g.fill();
        });
        var tex = new THREE.CanvasTexture(c);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        if (THREE.PMREMGenerator && renderer) {
          var pm = new THREE.PMREMGenerator(renderer);
          pm.compileEquirectangularShader();
          scene.environment = pm.fromEquirectangular(tex).texture;
          pm.dispose();
        } else {
          scene.environment = tex;
        }
        tex.dispose();
      } catch (e) { /* 环境贴图失败不影响主体 */ }
    })();

    /* ---------- 材质 ---------- */
    function clay(color, opts) {
      opts = opts || {};
      var params = {
        color: new THREE.Color(color).convertSRGBToLinear(),
        roughness: opts.roughness == null ? 0.88 : opts.roughness,
        metalness: 0,
        emissive: new THREE.Color(opts.emissive || 0x000000).convertSRGBToLinear(),
        emissiveIntensity: opts.emissiveIntensity == null ? 0.03 : opts.emissiveIntensity,
        transparent: !!opts.transparent,
        opacity: opts.opacity == null ? 1 : opts.opacity
      };
      params.envMapIntensity = opts.envMapIntensity == null ? 0.1 : opts.envMapIntensity;
      var mat = THREE.MeshPhysicalMaterial
        ? new THREE.MeshPhysicalMaterial(params)
        : new THREE.MeshStandardMaterial(params);
      if (mat.clearcoat !== undefined) {
        mat.clearcoat = opts.clearcoat == null ? 0.04 : opts.clearcoat;
        mat.clearcoatRoughness = opts.clearcoatRoughness == null ? 0.75 : opts.clearcoatRoughness;
      }
      return mat;
    }

    /* 连体服：底色 + 印的小猪脸 */
    function onesieTexture() {
      var c = document.createElement('canvas');
      c.width = c.height = 256;
      var g = c.getContext('2d');
      g.fillStyle = '#E85B7C';
      g.fillRect(0, 0, 256, 256);

      for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
          var cx = 32 + i * 64;
          var cy = 32 + j * 64;
          if ((i + j) % 2) {
            // 小猪脸印花
            g.fillStyle = 'rgba(255, 245, 248, .92)';
            g.beginPath();
            g.arc(cx, cy, 13, 0, Math.PI * 2);
            g.fill();
            // 耳朵
            g.beginPath();
            g.moveTo(cx - 13, cy - 8); g.lineTo(cx - 6, cy - 17); g.lineTo(cx - 3, cy - 6);
            g.closePath(); g.fill();
            g.beginPath();
            g.moveTo(cx + 13, cy - 8); g.lineTo(cx + 6, cy - 17); g.lineTo(cx + 3, cy - 6);
            g.closePath(); g.fill();
            // 鼻子 + 眼睛
            g.fillStyle = 'rgba(214, 78, 112, .62)';
            g.beginPath(); g.ellipse(cx, cy + 3, 5, 3.4, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(120, 48, 68, .62)';
            g.beginPath(); g.arc(cx - 5, cy - 2, 1.4, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.arc(cx + 5, cy - 2, 1.4, 0, Math.PI * 2); g.fill();
          } else {
            // 小圆点
            g.fillStyle = 'rgba(255, 255, 255, .5)';
            g.beginPath();
            g.arc(cx, cy, 3.2, 0, Math.PI * 2);
            g.fill();
          }
        }
      }

      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    var skinMat = clay(0xFF93B0, { roughness: 0.4 });
    var M = {
      skin: skinMat,
      onesie: new THREE.MeshPhysicalMaterial({
        map: onesieTexture(), roughness: 0.95, metalness: 0,
        clearcoat: 0.02, clearcoatRoughness: 0.8, envMapIntensity: 0.06
      }),
      skinDeep: clay(0xF983A2, { roughness: 0.44 }),
      earInner: clay(0xFB8CA9, { roughness: 0.48 }),
      nose: clay(0xFFA6BF, { roughness: 0.34 }),
      noseHole: clay(0xC2526C, { roughness: 0.55 }),
      eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x261A22).convertSRGBToLinear() }),
      glint: new THREE.MeshBasicMaterial({ color: 0xFFFFFF }),
      blush: clay(0xFF7E9B, { roughness: 1, emissive: 0x000000, emissiveIntensity: 0 }),
      mouth: clay(0xA63B55, { roughness: 0.5 }),
      cream: clay(0xFFF7EF, { roughness: 0.7 }),
      orange: clay(0xEF8A2A, { roughness: 0.48, clearcoat: 0.4 }),
      orangePith: clay(0xFFE7C4, { roughness: 0.78 }),
      leaf: clay(0x74B36A, { roughness: 0.6 }),
      bag: clay(0xFFC53D, { roughness: 0.55 }),
      bagDark: clay(0xE8A31F, { roughness: 0.58 }),
      strap: clay(0xC98F5A, { roughness: 0.75 }),
      gold: clay(0xF2C14E, { roughness: 0.3, clearcoat: 0.6, envMapIntensity: 0.9 }),
      gem: clay(0xE8607F, { roughness: 0.18, clearcoat: 1 }),
      rug: clay(0xFFFBF4, { roughness: 0.92 }),
      fryRed: clay(0xE4572E, { roughness: 0.75 }),
      fryYellow: clay(0xFFC94A, { roughness: 0.7 }),
      lamp: new THREE.MeshStandardMaterial({
        color: 0xFFF4DA, roughness: 0.6, emissive: 0xFFC98A, emissiveIntensity: 1.5
      })
    };

    // 橘子皮的颗粒感：给橘子上一点凹凸，别像塑料球
    (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var g = c.getContext('2d');
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 128, 128);
      for (var i = 0; i < 1400; i++) {
        var x = Math.random() * 128, y = Math.random() * 128, r = 0.8 + Math.random() * 1.4;
        g.fillStyle = 'rgba(255,255,255,.45)';
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 3);
      M.orange.bumpMap = tex;
      M.orange.bumpScale = 0.02;
      M.orange.needsUpdate = true;
    })();

    // 皮肤和衣服分开质感：皮肤更亮一点、衣服更哑光
    M.skin.roughness = 0.55;
    M.onesie.roughness = 0.85;

    /* ---------- 卡通描边：只留一圈很细的深色边，把形状"勾"出来 ---------- */
    function addOutline(mesh, color, k) {
      var mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), side: THREE.BackSide });
      var o = new THREE.Mesh(mesh.geometry, mat);
      o.scale.setScalar(k == null ? 1.03 : k);
      o.userData.noShadow = true;
      o.renderOrder = -1;
      mesh.add(o);
      return o;
    }

    /* ---------- 小猪 ---------- */
    var pig = new THREE.Group();
    scene.add(pig);

    var rig = new THREE.Group();          // 呼吸 / 蹦跳挂在这一层
    pig.add(rig);

    // 身体：梨形圆身子（车出来的轮廓比一个球更像手办）
    var bodyProfile = [
      [0.001, 0.02], [0.278, 0.03], [0.45, 0.07], [0.572, 0.16], [0.632, 0.32],
      [0.622, 0.5], [0.562, 0.66], [0.45, 0.8], [0.3, 0.92], [0.16, 0.99], [0.001, 1.01]
    ].map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var body = new THREE.Mesh(new THREE.LatheGeometry(bodyProfile, 56), M.onesie);
    rig.add(body);
    addOutline(body, 0xE2678C, 1.014);

    // 连体服的领口
    var collar = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.055, 12, 28), M.cream);
    collar.position.set(0, 0.97, 0.02);
    collar.rotation.x = Math.PI / 2;
    collar.scale.set(1, 1.08, 1);
    rig.add(collar);

    // 领口小铃铛
    var bell = new THREE.Mesh(new THREE.SphereGeometry(0.058, 18, 14), M.gold);
    bell.position.set(0, 0.86, 0.36);
    rig.add(bell);

    // 头
    var head = new THREE.Group();
    head.position.set(0, 1.62, 0.02);
    head.scale.setScalar(0.86);
    rig.add(head);

    var skull = new THREE.Mesh(new THREE.SphereGeometry(0.93, 48, 32), M.skin);
    skull.scale.set(1.0, 0.97, 0.96);
    head.add(skull);
    addOutline(skull, 0xE2678C, 1.028);

    // 鼻子
    var snout = new THREE.Mesh(new THREE.SphereGeometry(0.205, 34, 24), M.nose);
    snout.scale.set(1.26, 0.9, 0.72);
    snout.position.set(0, -0.145, 0.885);
    head.add(snout);
    addOutline(snout, 0xE2678C, 1.05);

    [-1, 1].forEach(function (s) {
      var n = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), M.noseHole);
      n.scale.set(1, 1.22, 0.5);
      n.position.set(s * 0.062, -0.14, 0.985);
      head.add(n);
    });

    // 小黑豆眼 + 高光点（手办的眼睛是"亮"的，不是两块黑）
    var eyes = [];
    [-1, 1].forEach(function (s) {
      var eyeGroup = new THREE.Group();
      eyeGroup.position.set(s * 0.325, 0.13, 0.85);
      head.add(eyeGroup);

      var e = new THREE.Mesh(new THREE.SphereGeometry(0.178, 32, 24), M.eye);
      e.scale.set(1, 1.12, 0.8);
      eyeGroup.add(e);

      // 虹膜：让黑豆眼有一点点层次，不是纯黑圆点
      var iris = new THREE.Mesh(new THREE.SphereGeometry(0.112, 22, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4A3438).convertSRGBToLinear() }));
      iris.scale.set(1, 1.08, 0.5);
      iris.position.z = 0.078;
      iris.userData.noShadow = true;
      eyeGroup.add(iris);

      var glint = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 14), M.glint);
      glint.position.set(-0.045, 0.052, 0.122);
      glint.scale.set(1, 1, 0.55);
      glint.userData.noShadow = true;
      eyeGroup.add(glint);

      var glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), M.glint);
      glint2.position.set(0.048, -0.058, 0.118);
      glint2.userData.noShadow = true;
      eyeGroup.add(glint2);


      eyes.push(eyeGroup);
    });

    // 腮红：一层柔和的粉，不是两坨实心球
    (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var g = c.getContext('2d');
      var rg = g.createRadialGradient(64, 64, 2, 64, 64, 62);
      rg.addColorStop(0, 'rgba(255, 122, 152, .62)');
      rg.addColorStop(0.5, 'rgba(255, 130, 158, .26)');
      rg.addColorStop(1, 'rgba(255, 140, 165, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
      var tex = new THREE.CanvasTexture(c);
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      [-1, 1].forEach(function (s) {
        var b = new THREE.Mesh(
          new THREE.PlaneGeometry(0.56, 0.4),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false })
        );
        b.position.set(s * 0.52, -0.155, 0.775);
        b.rotation.y = s * 0.46;
        b.rotation.z = -s * 0.08;
        b.renderOrder = 3;
        b.userData.noShadow = true;
        head.add(b);
      });
    })();

    // 嘴
    var mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.315, 0.805);
    head.add(mouthGroup);

    var smile = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.021, 8, 20, Math.PI), M.mouth);
    smile.rotation.z = Math.PI;
    mouthGroup.add(smile);

    var openMouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 18, 14), M.mouth);
    openMouth.scale.set(1, 1.1, 0.7);
    openMouth.visible = false;
    mouthGroup.add(openMouth);

    // 下垂的软耳朵
    var ears = [];
    [-1, 1].forEach(function (s) {
      var pivot = new THREE.Group();
      pivot.position.set(s * 0.645, 0.5, -0.02);
      head.add(pivot);

      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.31, 26, 18), M.skinDeep);
      ear.scale.set(0.98, 1.22, 0.5);
      ear.position.set(s * 0.15, -0.1, 0);
      ear.rotation.z = s * 0.3;
      pivot.add(ear);
      addOutline(ear, 0xE2678C, 1.045);

      var inner = new THREE.Mesh(new THREE.SphereGeometry(0.21, 22, 16), M.earInner);
      inner.scale.set(0.82, 1.08, 0.34);
      inner.position.set(s * 0.175, -0.11, 0.1);
      inner.rotation.z = s * 0.3;
      pivot.add(inner);

      ears.push(pivot);
    });

    // 小手臂（连体服的袖子）+ 袖口
    var arms = [];
    [-1, 1].forEach(function (s) {
      var arm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 22, 16), M.onesie);
      arm.scale.set(0.86, 1.35, 0.86);
      arm.position.set(s * 0.555, 0.55, 0.25);
      arm.rotation.z = s * 0.34;
      arm.rotation.x = -0.2;
      rig.add(arm);
      arms.push(arm);

      var cuff = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.032, 10, 18), M.cream);
      cuff.position.set(s * 0.575, 0.35, 0.31);
      cuff.rotation.x = 1.35;
      rig.add(cuff);

      // 小手：一小团奶油色，让袖子有个收口
      var paw = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), M.cream);
      paw.scale.set(1, 0.95, 1);
      paw.position.set(s * 0.58, 0.31, 0.35);
      rig.add(paw);

      // 肩窝：让胳膊"长"在身体上，不是粘上去的
      var shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.23, 22, 16), M.onesie);
      shoulder.scale.set(1, 0.92, 0.95);
      shoulder.position.set(s * 0.45, 0.66, 0.16);
      rig.add(shoulder);
    });

    // 小脚（连体服的脚脚）
    var feet = [];
    [-1, 1].forEach(function (s) {
      var foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), M.cream);
      foot.scale.set(1.1, 0.62, 1.35);
      foot.position.set(s * 0.34, 0.12, 0.5);
      foot.rotation.y = s * 0.16;
      rig.add(foot);
      feet.push(foot);
    });

    // 卷尾巴
    var tail = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.042, 10, 24, Math.PI * 1.7), M.earInner);
    tail.position.set(0, 0.52, -0.58);
    tail.rotation.y = Math.PI / 2;
    tail.rotation.z = 0.4;
    rig.add(tail);

    /* ---------- 头顶的小橘子 ---------- */
    var orange = new THREE.Group();
    orange.position.set(-0.33, 0.72, 0.03);
    orange.rotation.set(0.1, 0.5, -0.2);
    head.add(orange);

    var orangeDome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 34, 26), M.orange);
    orange.add(orangeDome);

    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.022, 0.055, 8), M.strap);
    stem.position.set(0, 0.31, 0);
    orange.add(stem);

    var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), M.leaf);
    leaf.scale.set(1.75, 0.2, 0.74);
    leaf.position.set(0.125, 0.3, 0.02);
    leaf.rotation.set(0, -0.35, -0.42);
    orange.add(leaf);

    /* ---------- 黄色小背包 ---------- */
    var bagGroup = new THREE.Group();
    bagGroup.position.set(0.66, 1.06, -0.3);
    bagGroup.rotation.y = -0.5;
    rig.add(bagGroup);

    var bag = new THREE.Mesh(new THREE.SphereGeometry(0.42, 26, 18), M.bag);
    bag.scale.set(1.95, 1.1, 0.62);
    bagGroup.add(bag);

    var flap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 22, 14), M.bagDark);
    flap.scale.set(1.7, 0.4, 0.64);
    flap.position.set(0, 0.26, 0.02);
    bagGroup.add(flap);

    var pocket = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 12), M.bagDark);
    pocket.scale.set(1, 0.85, 0.4);
    pocket.position.set(0, -0.14, 0.19);
    bagGroup.add(pocket);

    // 背带：从肩膀绕到身前
    [-1, 1].forEach(function (s) {
      var strap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.62, 0.06), M.strap);
      strap.position.set(s * 0.29, 0.82, 0.37);
      strap.rotation.x = -0.42;
      strap.rotation.z = s * 0.16;
      rig.add(strap);
    });

    /* ---------- 星星地毯 ---------- */
    var props = new THREE.Group();
    scene.add(props);

    var starShape = new THREE.Shape();
    var spikes = 5, outerR = 1.02, innerR = 0.46;
    for (var si = 0; si < spikes * 2; si++) {
      var rr = si % 2 ? innerR : outerR;
      var aa = (si / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      var px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
      if (si === 0) starShape.moveTo(px, py);
      else starShape.lineTo(px, py);
    }
    starShape.closePath();

    var rugGeo = new THREE.ExtrudeGeometry(starShape, {
      depth: 0.035, bevelEnabled: true, bevelSize: 0.022, bevelThickness: 0.018, bevelSegments: 2
    });
    rugGeo.rotateX(-Math.PI / 2);
    var rug = new THREE.Mesh(rugGeo, M.rug);
    rug.position.set(0, 0.06, 0.02);
    props.add(rug);

    /* ---------- 粉色房间背景（墙 + 地面） ---------- */
    var lamps = [];
    (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 256;
      var g = c.getContext('2d');
      var wall = g.createLinearGradient(0, 0, 0, 256);
      wall.addColorStop(0, '#FFEDF5');
      wall.addColorStop(0.62, '#FFDCE9');
      wall.addColorStop(0.63, '#F7C4D8');
      wall.addColorStop(1, '#EFB4CB');
      g.fillStyle = wall;
      g.fillRect(0, 0, 256, 256);
      // 墙脚一条柔和的阴影，像房间的转角
      var shade = g.createLinearGradient(0, 148, 0, 186);
      shade.addColorStop(0, 'rgba(214, 140, 170, 0)');
      shade.addColorStop(1, 'rgba(214, 140, 170, .35)');
      g.fillStyle = shade;
      g.fillRect(0, 148, 256, 38);
      // 主体身后的一团暖光
      var rg = g.createRadialGradient(128, 96, 6, 128, 104, 96);
      rg.addColorStop(0, 'rgba(255, 250, 244, .85)');
      rg.addColorStop(0.55, 'rgba(255, 236, 240, .35)');
      rg.addColorStop(1, 'rgba(255, 236, 240, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 256, 256);
      var tex = new THREE.CanvasTexture(c);
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      var back = new THREE.Mesh(
        new THREE.PlaneGeometry(8.2, 5.4),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      back.position.set(0.1, 1.6, -2.6);
      back.renderOrder = -1;
      scene.add(back);
    })();

    /* ---------- 左边的黄色星星灯 ---------- */
    (function () {
      var lampG = new THREE.Group();
      lampG.position.set(-1.28, 0, -0.14);
      scene.add(lampG);

      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.07, 24), M.cream);
      base.position.y = 0.035;
      lampG.add(base);

      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.74, 10), M.gold);
      stem.position.y = 0.42;
      lampG.add(stem);

      var stShape = new THREE.Shape();
      for (var i = 0; i < 10; i++) {
        var rr = i % 2 ? 0.115 : 0.27;
        var aa = (i / 10) * Math.PI * 2 - Math.PI / 2;
        var px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
        if (i === 0) stShape.moveTo(px, py); else stShape.lineTo(px, py);
      }
      stShape.closePath();
      var stGeo = new THREE.ExtrudeGeometry(stShape, {
        depth: 0.05, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.014, bevelSegments: 2
      });
      var stMat = new THREE.MeshStandardMaterial({
        color: 0xFFE39A, roughness: 0.55, emissive: 0xFFC46A, emissiveIntensity: 1.5
      });
      var stMesh = new THREE.Mesh(stGeo, stMat);
      stMesh.position.set(0, 0.87, -0.02);
      lampG.add(stMesh);

      var stLight = new THREE.PointLight(0xFFD79A, 0.55, 3.4, 2);
      stLight.position.set(0, 0.87, 0.2);
      lampG.add(stLight);
      lamps.push(stMesh);
    })();

    /* ---------- 右边印着 Zzz 的粉枕头 ---------- */
    (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 256;
      var g = c.getContext('2d');
      g.fillStyle = '#F58FB4';
      g.fillRect(0, 0, 256, 256);
      // 布纹
      for (var i = 0; i < 900; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,.06)' : 'rgba(214,120,152,.05)';
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
      g.fillStyle = '#FFF3F7';
      g.font = 'bold 58px "Segoe Script","Comic Sans MS",cursive';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // 球面 UV 会把中间的字转到背面，所以沿一圈印三份，正面总能看到一个
      [44, 128, 212].forEach(function (tx) { g.fillText('Zzz', tx, 128); });
      var tex = new THREE.CanvasTexture(c);
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      var mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.94, metalness: 0, envMapIntensity: 0.05 });
      var p = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 20), mat);
      p.scale.set(1.3, 0.88, 0.46);
      p.position.set(0.98, 0.36, 0.06);
      p.rotation.set(-0.1, 0.26, 0.06);
      scene.add(p);
    })();

    /* ---------- 抱枕 ---------- */
    var pillows = [];
    function makePillow(color, x, z, rot, scale) {
      var g = new THREE.Group();
      g.position.set(x, 0.06, z);
      g.rotation.y = rot;
      g.scale.setScalar(scale || 1);

      var mat = clay(color, { roughness: 0.98 });
      var pad = new THREE.Mesh(new THREE.SphereGeometry(0.46, 26, 18), mat);
      pad.scale.set(1, 0.94, 0.34);
      pad.rotation.x = -0.16;
      g.add(pad);

      // 枕头的缝边
      var seam = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.026, 8, 30), mat);
      seam.scale.set(1, 0.92, 1);
      seam.rotation.x = -0.16;
      g.add(seam);

      // 中间的小扣子
      var button = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), M.cream);
      button.position.set(0, 0.01, 0.16);
      g.add(button);

      props.add(g);
      pillows.push(g);
      return g;
    }

    makePillow(0xE6D2F2, -1.62, -0.34, 0.5, 1.0);    // 淡紫
    makePillow(0xFFB3CB, 1.58, -0.18, -0.42, 1.05);  // 粉
    makePillow(0xFFE7CC, -1.46, 0.62, 0.9, 0.8);     // 奶油

    /* ---------- 薯条 ---------- */
    var fries = new THREE.Group();
    fries.position.set(1.18, 0.06, -0.42);
    fries.rotation.y = -0.5;
    fries.scale.setScalar(0.82);
    props.add(fries);

    var carton = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.18), M.fryRed);
    carton.position.y = 0.15;
    fries.add(carton);

    for (var fi = 0; fi < 5; fi++) {
      var stick = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.045), M.fryYellow);
      stick.position.set(-0.07 + fi * 0.036, 0.38, -0.02 + (fi % 2) * 0.05);
      stick.rotation.z = (fi - 2) * 0.09;
      stick.rotation.x = (fi % 2) * 0.12;
      fries.add(stick);
    }

    /* ---------- 小王冠（连续 7 天） ---------- */
    var crown = new THREE.Group();
    crown.position.set(0, 0.88, 0.04);
    crown.rotation.x = -0.12;
    head.add(crown);

    var band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 12, 26), M.gold);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 1, 0.86);
    crown.add(band);

    for (var ci = 0; ci < 5; ci++) {
      var ang = (ci / 5) * Math.PI * 2;
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.17, 10), M.gold);
      spike.position.set(Math.cos(ang) * 0.24, 0.09, Math.sin(ang) * 0.2);
      crown.add(spike);

      var gem = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), M.gem);
      gem.position.set(Math.cos(ang) * 0.24, -0.03, Math.sin(ang) * 0.2);
      crown.add(gem);
    }
    crown.scale.setScalar(0.001);
    crown.visible = false;

    /* ---------- 头顶的思考气泡：想吃汉堡 ---------- */
    (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 256;
      var g = c.getContext('2d');

      g.fillStyle = 'rgba(255,255,255,.97)';
      [[128, 96, 52], [92, 112, 34], [166, 112, 32], [128, 62, 32]].forEach(function (b) {
        g.beginPath();
        g.arc(b[0], b[1], b[2], 0, Math.PI * 2);
        g.fill();
      });

      var bx = 128, by = 118;
      g.fillStyle = '#F2B563';
      g.beginPath(); g.ellipse(bx, by - 14, 40, 22, 0, Math.PI, Math.PI * 2); g.fill();
      g.fillStyle = '#FFF4DC';
      [[-16, -24], [2, -30], [18, -22], [-6, -32]].forEach(function (s) {
        g.beginPath(); g.ellipse(bx + s[0], by + s[1], 3.2, 2, 0.4, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = '#7FC46B';
      g.beginPath();
      g.moveTo(bx - 42, by - 2);
      for (var i = 0; i <= 6; i++) g.lineTo(bx - 42 + i * 14, by + (i % 2 ? 7 : -2));
      g.lineTo(bx + 42, by - 2);
      g.closePath(); g.fill();
      g.fillStyle = '#FFC94A';
      g.beginPath();
      g.moveTo(bx - 40, by + 6); g.lineTo(bx + 18, by + 6);
      g.lineTo(bx + 38, by + 18); g.lineTo(bx - 40, by + 18);
      g.closePath(); g.fill();
      g.fillStyle = '#8A4B32';
      g.beginPath();
      if (g.roundRect) g.roundRect(bx - 40, by + 12, 80, 16, 7);
      else g.rect(bx - 40, by + 12, 80, 16);
      g.fill();
      g.fillStyle = '#E8A44E';
      g.beginPath();
      if (g.roundRect) g.roundRect(bx - 38, by + 28, 76, 18, 9);
      else g.rect(bx - 38, by + 28, 76, 18);
      g.fill();

      g.fillStyle = 'rgba(255,255,255,.95)';
      [[96, 168, 13], [78, 188, 9], [66, 204, 6]].forEach(function (b) {
        g.beginPath(); g.arc(b[0], b[1], b[2], 0, Math.PI * 2); g.fill();
      });

      var tex = new THREE.CanvasTexture(c);
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.position.set(0.72, 2.44, 0.34);
      sp.scale.set(1.02, 1.02, 1);
      rig.add(sp);
    })();

    /* ---------- 地面阴影 ---------- */
    function shadowTexture() {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var g = c.getContext('2d');
      var grd = g.createRadialGradient(64, 64, 2, 64, 64, 60);
      grd.addColorStop(0, 'rgba(120, 70, 92, .62)');
      grd.addColorStop(0.42, 'rgba(130, 82, 104, .34)');
      grd.addColorStop(1, 'rgba(130, 82, 104, 0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      var tex = new THREE.CanvasTexture(c);
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      return tex;
    }
    var shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.09, 0.12);
    shadowMesh.material.opacity = 0.55;
    shadowMesh.scale.set(0.92, 0.92, 0.92);
    scene.add(shadowMesh);

    /* ---------- 真阴影：小猪压在星星地毯上的接触阴影 ---------- */
    var shadowCatcher = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.ShadowMaterial({ opacity: 0.24 })
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.015;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    rug.receiveShadow = true;
    pig.traverse(function (o) {
      if (o.isMesh && !o.userData.noShadow) o.castShadow = true;
    });
    orange.traverse(function (o) {
      if (o.isMesh) o.castShadow = true;
    });
    props.traverse(function (o) {
      if (o.isMesh) o.receiveShadow = true;
    });

    /* ---------- 飘出来的小东西 ---------- */
    var fxTex = {};
    function emojiTexture(ch) {
      if (fxTex[ch]) return fxTex[ch];
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var g = c.getContext('2d');
      g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, 64, 70);
      var tex = new THREE.CanvasTexture(c);
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      fxTex[ch] = tex;
      return tex;
    }

    var fxs = [];
    function spawnFx(ch, x, y, z, life, rise) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: emojiTexture(ch), transparent: true, depthWrite: false
      }));
      sp.position.set(x, y, z);
      sp.scale.setScalar(0.001);
      scene.add(sp);
      fxs.push({ sprite: sp, age: 0, life: life || 1.4, rise: rise == null ? 1.0 : rise });
    }

    /* ---------- 苹果 ---------- */
    var apple = new THREE.Group();
    var appleBody = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), clay(0xD9455C, { roughness: 0.5 }));
    apple.add(appleBody);
    var appleLeaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), clay(0x6BA751, { roughness: 0.8 }));
    appleLeaf.scale.set(1.4, 0.5, 1);
    appleLeaf.position.set(0.05, 0.14, 0);
    apple.add(appleLeaf);
    apple.visible = false;
    scene.add(apple);

    /* ---------- 状态 ---------- */
    var state = {
      yaw: 0, pitch: 0,
      dragging: false, lastX: 0, lastY: 0, downAt: 0, moved: 0, idleAt: 0,
      growth: 0.95, crownOn: false, sleeping: false,
      feedUntil: 0, appleUntil: 0, patUntil: 0,
      blinkAt: 1600, blinkUntil: 0, twitchAt: 0, twitchUntil: 0,
      // 在小窝里自己活动
      x: 0, z: 0, xLimit: 1.4, pxUnit: 0.014,
      yawTarget: 0, pausedUntil: 0, manualUntil: 0, still: false
    };

    var clock = new THREE.Clock();
    var time = 0;

    // pig-move 的四个关键点（单位 px，跟 CSS 里一模一样）
    var MOVE = [[0, 0], [15, -10], [30, 5], [10, 15], [0, 0]];

    // 手机开了「减弱动态效果」就只呼吸、不乱跑
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    state.still = !!(reduceMotion && reduceMotion.matches);
    if (reduceMotion && reduceMotion.addEventListener) {
      reduceMotion.addEventListener('change', function (e) { state.still = !!e.matches; });
    }

    // WebGL 崩了就彻底停掉，交回 CSS 小猪
    var stopped = false;

    /* ---------- 构图 ---------- */
    function resize() {
      var w = sceneBox.clientWidth || 320;
      var h = sceneBox.clientHeight || 224;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;

      var aspect = w / h;
      var dist = aspect < 1.5 ? 7.6 : 6.95;   // 头变大后拉远一点，四周留白
      camera.position.set(1.05, 0.95 + dist * 0.245, dist);
      camera.lookAt(0, 1.1, 0);
      camera.updateProjectionMatrix();

      // 舞台能看见多宽，别让小猪蹦出画面
      var halfH = Math.tan((camera.fov / 2) * Math.PI / 180) * dist;
      var halfW = halfH * aspect;
      state.pxUnit = (2 * halfW) / w;   // 1 个 CSS px 等于多少 3D 单位
      state.xLimit = Math.max(0.5, Math.min(1.02, halfW - 1.9));   // 只在星星地毯上溜达
      if (Math.abs(state.x) > state.xLimit) state.x = state.xLimit * (state.x > 0 ? 1 : -1);
    }
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(sceneBox);

    /* ---------- 交互 ---------- */
    function onDown(ev) {
      state.dragging = true;
      state.downAt = Date.now();
      state.moved = 0;
      state.lastX = ev.clientX;
      state.lastY = ev.clientY;
      state.manualUntil = Date.now() + 6000;
      state.idleAt = Date.now();
      if (canvas.setPointerCapture && ev.pointerId != null) {
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      }
    }
    function onMove(ev) {
      if (!state.dragging) return;
      var dx = ev.clientX - state.lastX;
      var dy = ev.clientY - state.lastY;
      state.lastX = ev.clientX;
      state.lastY = ev.clientY;
      state.moved += Math.abs(dx) + Math.abs(dy);
      state.yaw += dx * 0.009;
      state.pitch = Math.max(-0.35, Math.min(0.4, state.pitch + dy * 0.004));
      state.idleAt = Date.now();
    }
    function onUp() {
      if (!state.dragging) return;
      state.dragging = false;
      state.idleAt = Date.now();
      state.manualUntil = Date.now() + 7000;
      state.yawTarget = state.yaw;
      if (state.moved < 10 && Date.now() - state.downAt < 400) {
        if (state.sleeping) {
          if (window.PigPen && window.PigPen.wake) window.PigPen.wake();
        } else if (window.PigPen && window.PigPen.pat) {
          window.PigPen.pat();
        }
      }
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', function () { if (state.dragging) onUp(); });

    /* ---------- 每帧：看不见的时候真正停下来，不空转 ---------- */
    var looping = false;

    function sceneShowing() {
      var pageItems = document.getElementById('page-items');
      return !!(pageItems && pageItems.classList.contains('show') && !document.hidden);
    }

    function startLoop() {
      if (looping || stopped) return;
      looping = true;
      clock.getDelta();               // 丢掉暂停期间攒下的时间，避免一恢复就跳一大步
      requestAnimationFrame(frame);
    }

    function stopLoop() {
      looping = false;
    }

    function frame() {
      if (!looping || stopped) return;
      if (!sceneShowing()) {          // 切走了 / 后台了 / 页面藏了：彻底停
        looping = false;
        return;
      }
      requestAnimationFrame(frame);
      var dt = Math.min(clock.getDelta(), 0.05);
      time += dt;

      var now = Date.now();

      /* ---------- 走路：交给 pig-motion 插件 ----------
       * js/pig-motion.js 负责"自己挑地方、蹦过去、东张西望、原地弹一下"，
       * 这里每帧问它要一次姿态（x/z/侧身/起伏/挤压）。
       * 没装插件（或 PigMotion.disable()）时，退回原来的固定轨迹：
       * pig-idle 2s 上下 5px，pig-move 4s 沿 0,0 → 15,-10 → 30,5 → 10,15 → 0,0 往返。
       */
      var awake = !state.sleeping && !state.still && now >= state.pausedUntil && now >= state.manualUntil;

      var motion = null;
      if (window.PigMotion && window.PigMotion.update) {
        motion = window.PigMotion.update(dt, {
          awake: awake,
          sleeping: state.sleeping,
          dragging: state.dragging,
          paused: now < state.pausedUntil,
          xLimit: state.xLimit
        });
      }

      var bobY, idleScale;
      if (motion) {
        if (!state.dragging) {
          state.x = motion.x;
          state.z = motion.z;
          state.yawTarget = motion.yaw;
        }
        bobY = motion.lift;
        idleScale = motion.squash;
      } else {
        var idleK = (1 - Math.cos(((now % 2000) / 2000) * Math.PI * 2)) / 2;
        bobY = awake
          ? idleK * 5 * state.pxUnit
          : (state.sleeping ? Math.sin(time * 0.9) * 0.008 : 0);
        idleScale = 1 + (awake ? idleK : 0) * 0.02;

        var seg = (now % 4000) / 1000;
        var i0 = Math.floor(seg) % 4;
        var frac = seg - Math.floor(seg);
        var ease = frac * frac * (3 - 2 * frac);
        var dir = Math.floor(now / 4000) % 2 === 0 ? 1 : -1;
        var kx = MOVE[i0][0] + (MOVE[i0 + 1][0] - MOVE[i0][0]) * ease;
        var ky = MOVE[i0][1] + (MOVE[i0 + 1][1] - MOVE[i0][1]) * ease;

        if (awake) {
          state.x = Math.max(-state.xLimit, Math.min(state.xLimit, kx * state.pxUnit * dir));
          state.z = -ky * state.pxUnit * 0.9;
          var goingRight = (MOVE[i0 + 1][0] - MOVE[i0][0]) * dir >= 0;
          state.yawTarget = goingRight ? 0.52 : -0.52;
        }
      }

      // pig-idle 的上下 + 放大
      rig.position.y = bobY;
      rig.scale.set(idleScale, idleScale, idleScale);

      // 转向
      if (!state.dragging) {
        state.pitch *= 0.985;
        var turnSpeed = awake ? 3.2 : 2.0;
        state.yaw += (state.yawTarget - state.yaw) * Math.min(1, dt * turnSpeed);
      }

      pig.position.x += (state.x - pig.position.x) * Math.min(1, dt * 12);
      pig.position.z += (state.z - pig.position.z) * Math.min(1, dt * 12);
      pig.rotation.y = state.yaw;
      pig.rotation.x = state.pitch * 0.55;

      shadowMesh.position.x = pig.position.x;
      shadowMesh.position.z = 0.12 + pig.position.z * 0.6;

      /* 成长 */
      var target = state.growth;
      pig.scale.x += (target - pig.scale.x) * Math.min(1, dt * 6);
      pig.scale.y = pig.scale.x;
      pig.scale.z = pig.scale.x;

      /* 眨眼 */
      if (now > state.blinkAt) {
        state.blinkAt = now + 2800 + Math.random() * 3600;
        state.blinkUntil = now + 120;
      }
      var blinking = now < state.blinkUntil && !state.sleeping;
      var eyeScale = state.sleeping ? 0.1 : (blinking ? 0.12 : 1);
      eyes.forEach(function (e) {
        e.scale.y += (eyeScale - e.scale.y) * Math.min(1, dt * 24);
      });

      /* 耳朵 */
      if (now > state.twitchAt) {
        state.twitchAt = now + 4600 + Math.random() * 4200;
        state.twitchUntil = now + 280;
      }
      var twitching = now < state.twitchUntil;
      var patting = now < state.patUntil;
      ears.forEach(function (pivot, i) {
        var s = i === 0 ? -1 : 1;
        var sway = Math.sin(time * 1.9 + i) * 0.045;
        var twitch = twitching ? Math.sin((now - (state.twitchUntil - 280)) / 280 * Math.PI) * 0.26 : 0;
        var pat = patting ? Math.sin(time * 30) * 0.36 : 0;
        var fly = Math.min(0.4, bobY * 2.0);
        pivot.rotation.z = s * (0.06 + sway + twitch + pat + fly);
        pivot.rotation.x = patting ? Math.sin(time * 26) * 0.14 : 0;
      });

      /* 手臂 / 尾巴 */
      arms.forEach(function (arm, i) {
        var s = i === 0 ? -1 : 1;
        arm.rotation.z = s * (0.34 + (patting ? Math.sin(time * 26) * 0.22 : 0));
        arm.position.y = 0.55 + (patting ? Math.abs(Math.sin(time * 13)) * 0.06 : 0) + bobY * 0.5;
      });
      tail.rotation.y = Math.PI / 2 + Math.sin(time * (state.sleeping ? 0.8 : 2.2)) * 0.35;

      /* 星星灯：轻轻呼吸 */
      lamps.forEach(function (lamp, i) {
        lamp.material.emissiveIntensity = 1.2 + Math.sin(time * 1.6 + i * 0.7) * 0.45;
      });

      /* 喂食 */
      var feeding = now < state.feedUntil;
      openMouth.visible = feeding;
      smile.visible = !feeding;
      if (feeding) {
        var chews = Math.abs(Math.sin(time * 15));
        openMouth.scale.set(1, 1.1 + chews * 0.5, 0.7);
        head.rotation.x = Math.sin(time * 12) * 0.045;
      } else if (!state.sleeping) {
        head.rotation.x += (0 - head.rotation.x) * Math.min(1, dt * 6);
      }

      if (now < state.appleUntil) {
        var p = 1 - (state.appleUntil - now) / 900;
        apple.visible = true;
        apple.position.set(pig.position.x + 0.1 * (1 - p), 1.45 - p * 0.45, pig.position.z + 2.1 - p * 0.85);
        apple.rotation.z = p * 3;
        apple.scale.setScalar(1 - p * 0.3);
      } else {
        apple.visible = false;
      }

      /* 睡觉 */
      if (state.sleeping) {
        head.rotation.x += (0.14 - head.rotation.x) * Math.min(1, dt * 3);
        head.rotation.z += (0.09 - head.rotation.z) * Math.min(1, dt * 3);
      } else {
        head.rotation.z += (0 - head.rotation.z) * Math.min(1, dt * 4);
      }

      /* 王冠 */
      var crownTarget = state.crownOn ? 1 : 0.001;
      var cs = crown.scale.x + (crownTarget - crown.scale.x) * Math.min(1, dt * 7);
      crown.scale.setScalar(cs);
      crown.visible = cs > 0.02;
      if (state.crownOn) crown.rotation.y += dt * 0.7;

      /* 阴影跟呼吸 */
      var sh = Math.max(0.8, Math.min(1.2, pig.scale.x * 1.02));
      shadowMesh.scale.set(sh, sh, sh);
      shadowMesh.material.opacity = state.sleeping ? 0.5 : 1;

      /* 粒子 */
      for (var i = fxs.length - 1; i >= 0; i--) {
        var f = fxs[i];
        f.age += dt;
        var kk = f.age / f.life;
        if (kk >= 1) {
          scene.remove(f.sprite);
          f.sprite.material.dispose();
          fxs.splice(i, 1);
          continue;
        }
        f.sprite.position.y += dt * f.rise;
        var sc = kk < 0.25 ? (kk / 0.25) * 0.5 : 0.5;
        f.sprite.scale.setScalar(sc * (1 - kk * 0.25));
        f.sprite.material.opacity = kk < 0.7 ? 1 : (1 - (kk - 0.7) / 0.3);
      }

      renderer.render(scene, camera);
    }

    /* ---------- 对外接口 ---------- */
    var colors = ['❤️', '💕', '💗', '💖', '💞'];

    window.PigPen3D = {
      active: true,
      __debug: {
        scene: scene, camera: camera, renderer: renderer, pig: pig, props: props,
        parts: {
          body: body, head: head, skull: skull, snout: snout, mouth: mouthGroup,
          eyes: eyes, ears: ears, arms: arms, feet: feet, tail: tail, crown: crown,
          orange: orange, bag: bagGroup, rug: rug, fries: fries, lamps: lamps, collar: collar,
          pillows: pillows
        }
      },

      setGrowth: function (g) {
        state.growth = Math.max(0.95, Math.min(1.15, 0.95 + ((g || 1) - 1) * 0.57));
      },

      setCrown: function (on) { state.crownOn = !!on; },

      setSleeping: function (on) {
        on = !!on;
        if (state.sleeping === on) return;
        state.sleeping = on;
        if (on) { state.yawTarget = 0; state.blinkAt = Date.now() + 9000; }

        spawnFx(on ? '💤' : '✨', 0.45, 1.95, 0.2, 1.2, 0.6);

        var fromH = hemi.intensity, toH = on ? 0.14 : 0.26;
        var fromK = key.intensity, toK = on ? 0.38 : 0.85;
        var fromF = fill.intensity, toF = on ? 0.1 : 0.22;
        var fromA = ambient.intensity, toA = on ? 0.03 : 0.05;
        var t0 = Date.now();
        (function fade() {
          var k = Math.min(1, (Date.now() - t0) / 700);
          var e = k * k * (3 - 2 * k);
          hemi.intensity = fromH + (toH - fromH) * e;
          key.intensity = fromK + (toK - fromK) * e;
          fill.intensity = fromF + (toF - fromF) * e;
          ambient.intensity = fromA + (toA - fromA) * e;
          if (k < 1) requestAnimationFrame(fade);
        })();

        if (on) {
          setTimeout(function () {
            if (state.sleeping) spawnFx('z', 0.5, 1.85, 0.3, 2.2, 0.9);
          }, 900);
        }
      },

      play: function (kind) {
        var now = Date.now();
        state.pausedUntil = now + 1500;
        state.yawTarget = 0;
        if (kind === 'feed') {
          state.feedUntil = now + 900;
          state.appleUntil = now + 900;
          spawnFx('🍎', pig.position.x - 0.1, 1.3, pig.position.z + 0.85, 1.0, 0.4);
        } else if (kind === 'pat') {
          state.patUntil = now + 900;
          for (var i = 0; i < 4; i++) {
            (function (i) {
              setTimeout(function () {
                spawnFx(colors[i % colors.length],
                  pig.position.x + (Math.random() - 0.5) * 1.0, 1.75,
                  pig.position.z + 0.5, 1.7, 1.1);
              }, i * 130);
            })(i);
          }
        } else if (kind === 'sleep') {
          this.setSleeping(true);
        }
      },

      resetView: function () {
        state.yaw = 0;
        state.yawTarget = 0;
        state.pitch = 0;
        state.x = 0;
        state.z = 0;
      }
    };

    // GPU 被回收 / 被别的页面抢走时，不要留个黑屏，切回 CSS 小猪
    canvas.addEventListener('webglcontextlost', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      stopped = true;
      sceneBox.classList.remove('is3d');
      if (window.PigPen3D) window.PigPen3D.active = false;
    }, false);

    sceneBox.classList.add('is3d');

    resize();
    renderer.render(scene, camera);
    startLoop();

    // 回到前台 / 切回小猪窝时重新开机（后台时浏览器本来也会掐掉 rAF，这里只是收尾）
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopLoop(); else if (sceneShowing()) startLoop();
    });
    window.addEventListener('hashchange', function () {
      if (sceneShowing()) startLoop();
    });
  }

  /* ---------- 什么时候才去拉 three.js（总共 600KB） ----------
   * 以前是页面一打开就跑去下载，不管你看不看小猪窝。
   * 现在改成：真正切到「小猪窝」那一页才开始下载，
   * 没进小猪窝的人完全不用付这个代价。
   */
  var arming = false;
  var armed = false;

  function penVisible() {
    var box = document.getElementById('pen-scene');
    var page = document.getElementById('page-items');
    if (!box) return false;
    var onItems = (location.hash || '').indexOf('items') >= 0 || (page && page.className.indexOf('show') >= 0);
    return !!onItems && box.clientWidth > 0;
  }

  function arm() {
    if (armed || arming) return;
    if (!penVisible()) return;
    arming = true;
    window.removeEventListener('hashchange', arm);

    function start() {
      armed = true;
      try { localStorage.setItem('pig3d.seen', '1'); } catch (e) {}
      boot();
      // 刚刚进来时的形态（体型/王冠/睡眠）补一次，免得 3D 晚上线就跟着清零
      if (window.PigPen && window.PigPen.render) {
        try { window.PigPen.render(); } catch (e) {}
      }
      // 系统开了「减少动态效果」：小窝不自动乱走，只保留轻轻的呼吸
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (window.PigMotion && window.PigMotion.disable) window.PigMotion.disable();
      }
    }

    if (window.THREE) { start(); return; }
    // 引擎要下载一会儿，先给个「小窝正在搭建」的提示，别让人对着空台子等
    var box = document.getElementById('pen-scene');
    if (box) box.classList.add('pig-loading');
    var s = document.createElement('script');
    s.src = 'js/vendor/three.min.js';
    s.async = true;
    s.onload = function () { if (box) box.classList.remove('pig-loading'); start(); };
    s.onerror = function () { if (box) box.classList.remove('pig-loading'); sceneBoxSafe(); };
    document.head.appendChild(s);
  }

  function sceneBoxSafe() {
    // 下载 three.js 失败：什么都不用做，CSS 小猪已经在了
    arming = false;
  }

  // 切页面时 DOM 还没排好版（宽度是 0），所以多试几次再决定要不要加载
  var retryTimer = null;
  function armRetry(tries) {
    if (armed || arming) return;
    if (penVisible()) { arm(); return; }
    if (tries <= 0) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { armRetry(tries - 1); }, 220);
  }

  window.addEventListener('hashchange', function () { armRetry(14); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { armRetry(14); });
  } else {
    setTimeout(function () { armRetry(14); }, 0);
  }

  /* ---------- 回访预热：来过小猪窝的人，空闲时先把 3D 引擎拉进缓存 ----------
   * 第一次访问不预取（不让新用户多花流量）；第二次进小窝几乎秒开。
   */
  (function prefetchForReturning() {
    var seen = false;
    try { seen = localStorage.getItem('pig3d.seen') === '1'; } catch (e) { return; }
    if (!seen || window.THREE) return;
    var run = function () {
      if (armed || document.querySelector('link[data-prefetch="three"]')) return;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'script';
      link.href = 'js/vendor/three.min.js';
      link.setAttribute('data-prefetch', 'three');
      document.head.appendChild(link);
    };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 1800);
  })();
})();