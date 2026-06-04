// Bar Soutsu カクテル原価計算 — Service Worker
// 更新方針: ページ本体(HTML)とJSONは「ネットワーク優先」で常に最新を取得し、
//   オフライン時のみキャッシュを使う。画像・CSS・JSは「キャッシュ優先」で高速表示。
const CACHE_NAME = "cocktail-cost-tool-v13";
const CACHE_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./assets/icon.svg",
  "./assets/bar-background.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";
  const fresh =
    req.mode === "navigate" ||
    accept.includes("text/html") ||
    url.pathname.endsWith(".json");

  if (fresh) {
    // ネットワーク優先（最新を表示。失敗時はキャッシュ）
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("./index.html")),
        ),
    );
  } else {
    // キャッシュ優先（高速。無ければ取得してキャッシュ）
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
