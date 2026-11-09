# 🐷 小猪日记 · 我们的点滴

一个可以「装到手机主屏」的情侣日记小站：记录点滴、每日打卡、收藏小物件、倒数纪念日。
纯静态（HTML + CSS + 原生 JS），数据只保存在手机浏览器本地，无需账号、不联网、不上传。

## 手机上怎么装

页面本身就是 PWA，用手机浏览器打开网址即可安装：

**Android（Chrome / Edge / 三星浏览器）**
1. 打开网址；
2. 点右上角菜单 `⋮` →「安装应用」/「添加到主屏幕」；
3. 桌面出现猪猪图标，点开是全屏的，没有地址栏。

**iPhone / iPad（Safari）**
1. 用 **Safari** 打开网址（微信/QQ 内置浏览器不行）；
2. 点底部「分享」按钮 →「添加到主屏幕」；
3. 从桌面图标打开，就是独立 App 的样子。

装好之后：

- 首次打开会缓存全部页面，**断网也能写日记**（数据本来就在本机）。
- 支持长按图标直接进「写日记 / 时间线 / 今日打卡」（manifest shortcuts）。
- 不支持 7 天内没打开就被清数据的情况——重要，记得定期「导出备份」。

> 想换手机或担心清缓存：在「我们 → 导出备份」下载 JSON，新设备上「导入备份」即可（合并模式，不会覆盖）。

## 打包成 Android App（APK）

如果想直接装一个 `.apk`（不经过浏览器、不依赖任何网址），仓库里的 `android/` 就是外壳工程：

- **整站打包进 APK**：`assets/www/` 里是完整的 HTML/CSS/JS，WebView 通过自定义 https 源
  （`appassets.pigdiary.local`）经 `shouldInterceptRequest` 读取，**完全没有网络请求，连 INTERNET 权限都没申请**；
- 用自定义安全源是为了让 `localStorage` 有一个稳定 origin，数据能长期保存；
- 「导出备份」走 JS 桥 `AndroidPig.saveBackup()`，写到系统 **下载/小猪日记/** 目录；
- 「导入备份」用文件选择器（SAF），不需要存储权限；
- 返回键逻辑：非首页 → 回首页，首页 → 退出；
- 图标为自适应图标（背景 #FF8FAB + 小猪前景），`minSdk 29`（Android 10+），`targetSdk 34`。

重新打包（不需要 Android Studio / Gradle）：

```powershell
# 需要 JDK 17 + Android SDK build-tools 34 + platform android-34
# 默认放在 C:\Users\Public\pig-diary-build\{jdk-17,android-sdk}
pwsh -ExecutionPolicy Bypass -File android\build.ps1
# 产物：android\out\PigDiary.apk
```

注意两点：

1. `android/keystore/pigdiary.jks` 是签名证书，**别丢**；以后升级必须用同一个证书，否则只能卸载重装（数据会没）。
2. 构建脚本会把文件先复制到 `C:\Users\Public\pig-diary-build\work` 再编译 —— aapt2 在中文路径下会报
   `failed to open directory`，这是工具的已知限制。

## 做成 iPhone / iPad App

iOS 和 Android 不一样：**没有 Mac + Apple 开发者证书就装不了 `.ipa` 文件**（Apple 只允许 App Store / TestFlight
分发，两者都要用 Xcode 打包签名）。所以在 iPhone 上，「App」的标准做法就是加到主屏的网页 App，本站按这个标准做了：

| 能力 | 怎么实现的 |
| --- | --- |
| 桌面图标 | `apple-touch-icon`（180×180），名字来自 `apple-mobile-web-app-title` |
| 全屏启动 | `apple-mobile-web-app-capable`，打开后没有地址栏和工具栏 |
| 启动画面 | 11 张 `apple-touch-startup-image`，覆盖 iPhone 16/15/14/13/12/X/8、SE、iPad，避免白屏 |
| 离线可用 | Service Worker 预缓存整站，断网也能打开、能写 |
| 状态栏 | `apple-mobile-web-app-status-bar-style: default` + `viewport-fit=cover` + `env(safe-area-inset-*)` |

安装步骤：**用 Safari 打开** → 底部「分享」⬆️ → 「添加到主屏幕」→ 添加。

几个坑：

- 微信 / QQ 内置浏览器**不能**添加主屏，要先点右上角「···」→「在浏览器中打开」；
- 主屏图标记住的是**安装时的地址**，所以要在固定域名下安装（临时隧道地址重连后会变）；
- 已经装好的图标，即使地址失效，仍会从缓存打开（离线可用），只是拿不到更新；
- 删除图标会清掉该站点的本地数据，重要内容先导出备份。

### 永久地址：GitHub Pages（推荐，已配置好）

临时隧道（`*.lhr.life`）每次重连都会换域名，图标点了就 404。**GitHub Pages 是免费永久的**，
本项目已经按 Pages 的要求准备好：全站相对路径、`start_url: "./"`、带 `.nojekyll`。

发布 / 更新一条命令：

```powershell
pwsh -ExecutionPolicy Bypass -File tools\publish-pages.ps1
# 默认把 site/pig_diary/ 推到 yuui9277/pig-diary 的 main 分支并开启 Pages
```

脚本走的是 `api.github.com`（Git Data API，一次提交全部文件），令牌从
`D:\dsh-data\gh-token.dpapi`（DPAPI 加密）读取，也可以用 `$env:GH_TOKEN` 覆盖。

发布后的地址形如：

```
https://yuui9277.github.io/pig-diary/
```

第一次开启 Pages 需要等 1–2 分钟构建；之后每次推送 30 秒左右生效。
`*.github.io` 在国内偶尔慢，但胜在**不会变**，装到主屏一劳永逸。

## 本地预览

- 直接双击 `index.html` 可以看界面，但 **Service Worker 与安装功能需要 http(s)**；
- 正确姿势是在目录里起一个静态服务器：

  ```bash
  python -m http.server 8000
  # 打开 http://127.0.0.1:8000
  ```

## 目录结构

```
pig_diary/
├── index.html           页面结构（六个 Tab）
├── manifest.json        PWA 清单：名称、图标、全屏模式、快捷方式
├── sw.js                Service Worker：预缓存 + 离线回退
├── css/style.css        粉色小猪主题
├── js/data.js           数据层：localStorage、日期工具、备份导入导出
├── js/app.js            交互层：渲染、表单、搜索筛选、安装引导
├── js/pig3d.js          WebGL 3D 小猪：造型、星星地毯、灯光、摸头/喂食/哄睡
├── js/pig-motion.js     行为插件：自己挑地方溜达、蹦跶、东张西望、凑近嗅一嗅
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable-512.png   Android 自适应图标
    └── apple-touch-icon.png    iOS 主屏图标
```

仓库同级还有：

```
android/                  APK 工程（WebView 外壳）
├── app/
│   ├── AndroidManifest.xml
│   ├── java/com/pigdiary/app/MainActivity.java
│   └── res/              图标、主题、文案
├── keystore/pigdiary.jks 签名证书（务必保存）
└── build.ps1             一键编译 + 对齐 + 签名
tools/                    图标生成、PWA 与 APK 桥接自检脚本
```

## 功能

| 页面 | 能做什么 |
| --- | --- |
| 首页 | 日记数 / 在一起天数 / 小物件数；最近 14 天热度条；「那年今日」；快捷写日记、打卡 |
| 时间线 | 按日期倒序；关键词搜索（标题/正文/标签）；标签筛选；戳猪鼻；编辑；删除 |
| 写日记 | 可补写过去任意一天；选心情、加标签；保存后回到时间线 |
| 小猪屋 | 每日打卡（天气、心情色、今日一句、一起听的歌、小备注）；打卡存档可回看/删除；小物件收藏；3D 小猪会自己在小窝里溜达、蹦跶 |
| 纪念日 | 「在一起」天数；生日/纪念日倒数（闰日 2/29 会落到 2/28）；删除 |
| 我们 | 改称呼；数据统计；**导出备份 / 合并导入 / 清空数据**；安装引导 |

## 数据与备份

- 存储键：`pig_diary_v1`（单个 JSON，存在浏览器 localStorage）。
- 「导入备份」是**合并**模式：只补充本地没有的内容，不会覆盖已有回忆；重复导入不会产生重复条目。
- 旧版本数据（数字 id、`"☀️ 晴"` 这种带 emoji 的天气、字段缺失）会被自动修复并兼容。

## 两台手机同步（可选）

默认是各存各的。要让两台手机共用一份日记，需要一个「中转小仓库」把密文递过去。

> 为什么不是 Supabase：`*.supabase.co` 在国内会被重置（TLS 握手直接断），手机根本连不上。
> 现在用的是 **npoint.io**：不用注册、国内能直连、支持数百 KB、开了 CORS。

配置只有两行，写在 `js/sync-config.js`：

```js
window.PIG_SYNC_CONFIG = { base: 'https://api.npoint.io', bin: '你自己的仓库ID' };
```

建仓：打开 https://www.npoint.io → 「Create JSON Bin」→ 随便存一段 `{}` → 页面底部会给出
`https://api.npoint.io/<仓库ID>`，把那串 ID 填进 `bin` 即可。想换别家（哪怕是自己开的服务器），
只改这两行。

用法：一台「我们 → 两台手机同步 → 生成配对码」，另一台粘贴配对码，之后自动保持同步。

- **端到端加密**：配对码经 PBKDF2（12 万次）派生 AES-GCM 密钥，仓库里只有 `{"p":"v1.…"}` 这样的密文，
  中转站也看不到内容。配对码等于钥匙，丢了数据就打不开，请两台手机都留好。
- 配对码存在本机 `pig_diary_sync_v1`，**不会**写进导出的备份。
- 合并按 id + `updatedAt` 取较新的一份；删除用 `tombstones` 传播（删了不会复活）。
- 断网照常写本地，联网后自动补传；前台每 15 秒拉一次，切回 App 立即同步。
- 「清空数据」会同时清掉云端（通过墓碑传播），所以删除前想清楚。
- 中转站是免费公共服务，**不保证永久存在**：万一哪天失效，两台手机的本地数据都还在，
  换一个仓库 ID 重新配对即可（本机数据不会丢）。

## 维护提示

- 改了 `index.html` / `css` / `js` 之后，把 `sw.js` 顶部的 `VERSION` 加一（例如 `pig-diary-v1.0.1`），
  否则老用户会继续用缓存里的旧版本（静态资源是「先缓存、后台更新」，第二次打开才换新）。
- 小猪的动作由 `js/pig-motion.js` 插件驱动：想让它安静点可在控制台执行 `PigMotion.setMood('calm')`，
  完全停下用 `PigMotion.disable()`；把 `index.html` 里那行 `<script>` 删掉就退回 `pig3d.js` 原来的固定轨迹。
- 图标由 `tools/make_icons.py` 生成（Pillow 绘制，改颜色/尺寸后重跑即可）。
- `tools/pwa-test.mjs` 是自动化自检：manifest、Service Worker、离线可用、可安装性、核心功能回归。
  ```bash
  node tools/pwa-test.mjs http://127.0.0.1:8000/
  ```
- `tools/apk-bridge-test.mjs` 校验网页与 APK 外壳的约定：装了 App 就不显示安装卡片、不注册 Service Worker、
  点导出必须调用 `AndroidPig.saveBackup` 且 JSON 结构正确。
- `tools/sync-test.mjs` 用两个互相隔离的浏览器上下文模拟两台手机，默认接一个假的 npoint 仓库，
  验证配对、双向合并、删除传播、密文存储（14 项）。加 `REAL=1 BIN=<仓库ID>` 可直接打真的 npoint。
  ```bash
  node tools/sync-test.mjs http://127.0.0.1:8000/
  ```
- `tools/make_android_icons.py` 生成 Android 各密度图标与自适应图标前景。

## 这次更新做了什么

**App 化（新增）**

- `manifest.json`：独立图标名「小猪日记」、`standalone` 全屏、竖屏、主题色、三个快捷方式。
- `sw.js`：预缓存 10 个资源，导航请求网络优先、断网回退；静态资源先缓存后更新；版本变化自动清旧缓存。
- 三套图标（192 / 512 / maskable + iOS 180），由脚本绘制粉底 + 小猪。
- 安装引导卡片：Android 走 `beforeinstallprompt` 弹原生意向框，iOS 给出 Safari 的图文步骤；已安装则自动隐藏。
- iOS/Android 全屏适配：`viewport-fit=cover`、`env(safe-area-inset-*)`、状态栏、`overscroll-behavior`。
- 离线/联网提示、`#write` 等 hash 直达（配合图标长按快捷方式）。
- 安装后再次打开若已是最新，不再提示；有新版本会提示一次。

**修掉的问题**

- 时间线的「第 N 条」原来从 0 开始且顺序反了，改为按时间正序编号。
- 打卡页天气回填失效（存的是 `晴`，select 的 value 却是 `☀️ 晴`）。
- 新日记没有日期选择，只能记「今天」；现在可以补写过去任意一天。
- 日期排序不稳定，导入/旧数据会出现乱序。
- 输入里的 `mood`、小物件 `icon` 之前直出未转义。
- 首页「一起走过的天」取数组最后一条，排序变化后会算错。
- 跨零点后统计不刷新；写日记/打卡中途切 Tab 会丢草稿。

**补上的能力**

- 编辑已有日记、小物件/纪念日/打卡记录删除入口。
- 打卡历史存档、时间线搜索与标签筛选、首页 14 天热度条。
- 备份导出 / 合并导入 / 清空数据。
- 键盘焦点样式、表单 label 关联、导航 `aria-current`、`prefers-reduced-motion`。

## 小猪窝（养成互动）

在「小猪窝」页面顶部就是这只小猪，可以跟它玩：

| 动作 | 效果 |
|---|---|
| 🍎 喂食 | 嘴巴动一动（嚼三下），飘出「饱腹度 +1」 |
| 🤚 摸头 / 点小猪 | 耳朵抖两下，头顶冒爱心 |
| 😴 睡觉 | 闭眼、打呼噜 zZ，背景变暗，15 秒后自己醒（点一下也叫醒） |
| 成长值 | 每次互动 +1，数字越大体型越大（CSS transform: scale，1.35 倍封顶） |
| 连续互动 | 每天互动累积，**连续 7 天**小猪戴上小王冠 👑 |

状态存在 `data.pen` 里（`hunger` / `pats` / `naps` / `growth` / `days`），
跟着备份和同步一起走：两台手机合并时次数取较大值、互动日期取并集，进度只增不减。

小猪有两种画法，按手机能力自动切换：

| 情况 | 用的什么 | 效果 |
|---|---|---|
| 支持 WebGL（绝大多数手机） | `js/pig3d.js` + three.js，真 3D | 黏土手感、真阴影、在自己房间里蹦跶 |
| 不支持 / 加载失败 / GPU 被回收 | `css/pen.css` 里的 CSS 小猪 | 一样会动（`pig-idle` + `pig-move`），不白屏 |

3D 那套是**按需加载**的：只有真的点进「小猪窝」才会去下载 600 KB 的 three.js，
没进过的人首屏完全不受影响（详见 `CHANGELOG.md` 的 v3.0）。

## v3.0 优化（性能 / 稳定 / 无障碍）

- **首屏瘦身**：`three.min.js` 从「一进站就下」改成「进小猪窝才下」，首屏传输 800 KB → 200 KB；
  Service Worker 也不再预缓存它。
- **不空转**：页面不可见时 3D 渲染循环直接停；切回来再继续。
- **不黑屏**：`webglcontextlost` 自动降级回 CSS 小猪；three.js 下载失败也一样。
- **不丢状态**：3D 晚于页面加载完成时，会主动同步体型 / 王冠 / 睡眠状态。
- **尊重系统设置**：`prefers-reduced-motion: reduce` 时小猪只呼吸、不乱跑。
- 细节和版本对照见 [CHANGELOG.md](CHANGELOG.md)。
