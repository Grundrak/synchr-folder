const CACHE_NAME = 'offline-pwa';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html'
];

// Installation: cache everything listed
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activation: clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/send-email')) {
    // Skip caching API requests
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }

          return new Response(
            'Vous êtes hors ligne et cette ressource n\'est pas disponible.',
            {
              status: 200,
              headers: { 'Content-Type': 'text/plain' }
            }
          );
        });
    })
  );
});

// Background sync handler
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);

  if (event.tag === 'sync-new-files') {
    event.waitUntil(syncNewFiles());
  }

  if (event.tag === 'sync-emails') {
    event.waitUntil(syncEmails()
    .then(() => console.log('[SW] Email sync completed'))
    .catch(err => console.error('[SW] Email sync failed:', err)));
  }
});

// Periodic sync handler
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync event:', event.tag);
  
  if (event.tag === 'check-new-files') {
    event.waitUntil(syncNewFiles());
  }else if (event.tag === 'sync-emails') {
    event.waitUntil(syncEmails());
  }
});

// Function to sync queued emails
async function syncEmails() {
  console.log('[SW] Syncing queued emails');
  try {
    const db = await openDatabase(); // Open IndexedDB
    const tx = db.transaction('emailQueue', 'readonly');
    const store = tx.objectStore('emailQueue');
    const emails = await store.getAll();
    
    console.log(`[SW] Found ${emails.length} emails to sync`);
    
    for (const email of emails) {
      try {
        // Create FormData from the stored email data
        const formData = new FormData();
        formData.append('to', email.to);
        formData.append('subject', email.subject);
        formData.append('message', email.message);
        
        // We can't store actual File objects in IndexedDB, so we need to 
        // get them from the main thread if we need to attach files
        // For now, just send the email metadata
        
        const response = await fetch('http://localhost:3002/send-email', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          console.log('[SW] Email sent successfully:', email.id);
          // Remove email from the queue
          const deleteTx = db.transaction('emailQueue', 'readwrite');
          const deleteStore = deleteTx.objectStore('emailQueue');
          await deleteStore.delete(email.id);
          await deleteTx.complete;
        } else {
          console.error('[SW] Failed to send email:', await response.text());
        }
      } catch (error) {
        console.error('[SW] Error sending email:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('[SW] Error syncing emails:', error);
    return false;
  }
}


// Function to check for new files and sync them
async function syncNewFiles() {
  console.log('[SW] Checking for new files to sync');

  try {
    // Get all clients
    const clients = await self.clients.matchAll();
    
    if (clients.length === 0) {
      console.log('[SW] No active clients found');
      return false;
    }
    
    // Ask the main thread for data
    clients[0].postMessage({ 
      type: 'GET_STORED_DATA' 
    });
    
    // The main thread will respond with a message event
    // which we'll handle in the message event listener
    return true;
  } catch (error) {
    console.error('[SW] Error initiating file sync:', error);
    return false;
  }
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SYNC_FILES') {
    // Process the files that need to be synced
    processFilesToSync(event.data.files, event.data.folderInfo);
  }
});

// Function to sync files with the server
async function processFilesToSync(newFiles, folderInfo) {
  if (!newFiles || newFiles.length === 0) {
    console.log('[SW] No new files to sync');
    return;
  }

  console.log('[SW] Syncing files:', newFiles);

  try {
    // Send files to the server
    const formData = new FormData();
    formData.append('to', 'mnfad@ctm.ma');
    formData.append('subject', 'Nouveaux fichiers CV détectés');
    formData.append('message', `Nouveaux fichiers détectés dans le dossier ${folderInfo.name}.`);

    newFiles.forEach(file => {
      formData.append('files', file);
    });

    const response = await fetch('http://localhost:3002/send-email', {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      console.log('[SW] Files sent successfully');
      // Notify the main thread to update the processed files list
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({
            type: 'FILES_SYNCED',
            files: newFiles.map(file => file.name)
          });
        }
      });
    } else {
      console.error('[SW] Failed to send files:', await response.text());
    }
  } catch (error) {
    console.error('[SW] Error sending files:', error);
  }
}

// Function to open IndexedDB
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CTM_CV_App', 2); // Ensure version matches your app
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create 'emailQueue' store if it doesn't exist
      if (!db.objectStoreNames.contains('emailQueue')) {
        db.createObjectStore('emailQueue', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}