// Nombre del caché para nuestra aplicación
const CACHE_NAME = 'inventario-epp-cache-v1';

// Lista de archivos que queremos cachear (el "app shell")
const urlsToCache = [
  '.', // Representa el directorio raíz, usualmente tu index.html
  'index.html',
  'certificados.html', 
  'styles.css',
  'app.js',
  'certificados.js',
  'firebase-config.js',
  'manifest.json',
  'https://cdn.tailwindcss.com', // Cachear Tailwind CSS
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' // Cachear la fuente
];

// Evento 'install': se dispara cuando el service worker se instala.
// Aquí es donde cacheamos nuestros archivos.
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Abriendo caché y cacheando archivos principales');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('Service Worker: Fallo al cachear archivos', err);
      })
  );
});

// Evento 'fetch': se dispara cada vez que la aplicación hace una petición de red (ej. pedir una imagen, un script, etc.).
// Aquí interceptamos la petición y servimos desde el caché si es posible.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si la respuesta se encuentra en el caché, la retornamos
        if (response) {
          console.log('Service Worker: Sirviendo desde caché:', event.request.url);
          return response;
        }
        
        // Si no está en el caché, hacemos la petición de red
        console.log('Service Worker: Petición de red para:', event.request.url);
        return fetch(event.request);
      })
  );
});

// Evento 'activate': se dispara cuando el service worker se activa.
// Aquí podemos limpiar cachés antiguos si es necesario.
self.addEventListener('activate', event => {
  console.log('Service Worker: Activado');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Limpiando caché antiguo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
