// Kill-switch service worker. The previous worker intercepted every fetch but never populated a
// cache, so any network failure (e.g. a deploy window) became a dead page that kept failing until
// the visitor cleared site data. This version uninstalls itself and reloads the pages it controls;
// the file must stay in place so browsers still holding the old worker fetch this one, self-destruct,
// and return to plain network fetches. Do not re-add a fetch handler without a real caching strategy.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: "window" })
      for (const client of clients) client.navigate(client.url)
    })(),
  )
})
