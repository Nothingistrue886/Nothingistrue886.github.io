---
layout: null
---

`use strict`;

const
    version = '{{site.time}}',
    CACHE = "cuizuofei's blog " + version,
    offlineURL = '/offline.html',
    // installFilesEssential = [],
    installFilesEssential = [
        '/',
        '/index.html',
        '/offline.html',
        '/assets/vendor/primer-css/css/primer.css',
        '/assets/vendor/primer-markdown/dist/user-content.min.css',
        '/assets/vendor/octicons/octicons/octicons.css',
        '/assets/css/components/collection.css',
        '/assets/css/components/repo-card.css',
        '/assets/css/sections/repo-list.css',
        '/assets/css/sections/mini-repo-list.css',
        '/assets/css/components/boxed-group.css',
        '/assets/css/globals/common.css',
        '/assets/css/globals/responsive.css',
        '/assets/css/posts/index.css',
        '/assets/vendor/jquery/dist/jquery.min.js',
        '/assets/js/main.js',
        '/manifest.json',
        '/apple-touch-icon.png',
        '/favicon-32x32.png',
        '/favicon-16x16.png',
        '/safari-pinned-tab.svg'
    ].concat(offlineURL),
    installFilesDesirable = [];

// install static assets
function installStaticFiles() {
    return caches.open(CACHE)
        .then(cache => {
            // cache desirable files
            cache.addAll(installFilesDesirable);
            // cache essential files
            return Promise.all(
                installFilesEssential.map(value =>
                    cache.add(value).catch(() => console.log("cache error " + value))
                )
            );
        });
}

// clear old caches
function clearOldCaches() {
    return caches.keys()
        .then(keylist => {
            return Promise.all(
                keylist
                    .filter(key => key !== CACHE)
                    .map(key => caches.delete(key))
            );
        });
}

// application installation
self.addEventListener('install', event => {
    console.log('service worker: install');
    // cache core files
    event.waitUntil(
        installStaticFiles()
            .then(() => self.skipWaiting())
    );
});

// application activated
self.addEventListener('activate', event => {
    console.log('service worker: activate');
    // delete old caches
    event.waitUntil(
        clearOldCaches()
            .then(() => self.clients.claim())
    );
});

// is image URL?
let iExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].map(f => '.' + f);

function isImage(url) {
    return iExt.reduce((ret, ext) => ret || url.endsWith(ext), false);
}

// return offline asset
function offlineAsset(url) {
    if (isImage(url)) {
        // return image
        return new Response(
            '<svg role="img" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"><title>offline</title><path d="M0 0h400v300H0z" fill="#eee" /><text x="200" y="150" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="50" fill="#ccc">offline</text></svg>',
            {
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'no-store'
                }
            }
        );
    } else {
        // return page
        return caches.match(offlineURL);
    }

}

// application fetch network data
self.addEventListener('fetch', event => {
    // abandon non-GET requests or cross-origin requests (giscus, analytics, etc.)
    if (event.request.method !== 'GET') return;
    let url = event.request.url;
    if (!url.startsWith(self.location.origin)) return;

    // HTML navigation: network first, fallback to cache/offline page
    if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        let copy = response.clone();
                        caches.open(CACHE).then(cache => cache.put(event.request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request).then(res => res || offlineAsset(url)))
        );
        return;
    }

    // Static assets: cache first, fallback to network
    event.respondWith(
        caches.open(CACHE)
            .then(cache => {
                return cache.match(event.request)
                    .then(response => {
                        if (response) {
                            return response;
                        }
                        return fetch(event.request)
                            .then(newreq => {
                                if (newreq.ok) cache.put(event.request, newreq.clone());
                                return newreq;
                            })
                            .catch(() => offlineAsset(url));
                    });
            })
    );
});