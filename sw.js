/* Service Worker
   v2 修复：Safari 报 "Response served by service worker has redirections"
   原因：托管方（Cloudflare Pages / Workers 静态资源）会把 /index.html 308 跳到 /，
        缓存里如果原样存了跳转响应，Safari 拒绝用它渲染页面。
   做法：所有资源都存成干净的 200；导航请求只从缓存的入口页返回，永不返回跳转。
*/
var VERSION = 'dljy-v4';
var ENTRY = './index.html';
var ASSETS = [
  './index.html',
  './app.css',
  './questions.js',
  './app.js',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

/* 把响应规整成 200，并去掉 location / content-encoding 这类会导致问题的头 */
function clean(res) {
  var h = new Headers();
  res.headers.forEach(function (value, key) {
    var k = String(key).toLowerCase();
    if (k === 'location' || k === 'content-encoding' || k === 'content-length' || k === 'transfer-encoding') return;
    h.set(key, value);
  });
  return res.blob().then(function (body) {
    return new Response(body, { status: 200, statusText: 'OK', headers: h });
  });
}

function fetchClean(url) {
  return fetch(new Request(url, { cache: 'reload', redirect: 'follow' }))
    .then(function (res) {
      if (!res || !res.ok) throw new Error('bad status ' + (res && res.status));
      return clean(res);
    });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) {
        return Promise.all(ASSETS.map(function (u) {
          return fetchClean(u)
            .then(function (r) { return c.put(u, r); })
            .catch(function () { /* 单个资源失败不影响整体安装 */ });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k !== VERSION) return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  /* 页面导航：只用缓存里的入口页，绝不把跳转响应交给浏览器 */
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(VERSION)
        .then(function (c) { return c.match(ENTRY); })
        .then(function (hit) {
          if (hit) return hit;
          return fetch(req, { redirect: 'follow' }).then(clean);
        })
        .catch(function () {
          return caches.match(ENTRY);
        })
    );
    return;
  }

  /* 静态资源：缓存优先，回填时也规整成 200 */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && !res.redirected) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
