/* ===== 小猪日记 · Service Worker =====
 * 让站点可以装到主屏，并在断网时照常打开。
 * 改动站点后请把 VERSION 加一，旧缓存会被清掉。
 */
'use strict';

var VERSION = 'pig-diary-v3.1.2';
var SHELL = [
  './',
  './index.html',
  './css/style.css',
  './css/sync.css',
  './css/pen.css',
  './js/data.js',
  './js/sync-config.js',
  './js/sync.js',
  './js/app.js',
  './js/pig-motion.js',
  './js/pig3d.js',
  './js/pen.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (cache) {
        // 逐个装：某个文件 404 或超时，不会把整份离线缓存一起废掉
        return Promise.all(SHELL.map(function (url) {
          return cache.add(url).catch(function () { return null; });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === VERSION ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 打开页面：先走网络（能及时拿到新版本），断网时回退到缓存
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(VERSION).then(function (cache) { cache.put('./index.html', copy); });
          return response;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (hit) {
            return hit || caches.match('./');
          });
        })
    );
    return;
  }

  // 静态资源：先用缓存，同时后台更新（下次打开就是新版）
  event.respondWith(
    caches.open(VERSION).then(function (cache) {
      return cache.match(request).then(function (hit) {
        // 3D 引擎和图标是「基本不变」的大文件：命中了就直接用，不再浪费一次流量
        var immortal = hit && (url.pathname.indexOf('/js/vendor/') >= 0 || url.pathname.indexOf('/icons/') >= 0);
        if (immortal) return hit;

        var network = fetch(request).then(function (response) {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        }).catch(function () { return null; });

        if (hit) {
          network.catch(function () { /* 忽略后台更新失败 */ });
          return hit;
        }
        return network.then(function (response) {
          return response || new Response('', { status: 504, statusText: 'offline' });
        });
      });
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'skip-waiting') self.skipWaiting();
});