let folderHandle = null;
let processedFiles = new Set();
let filesToSend = [];
let fileStatuses = {}; // Pour suivre l'état de chaque fichier

// Save folder handle permission to IndexedDB for persistence
async function saveFolderPermission(handle) {
  if (!handle) return;
  try {
    const db = await openDatabase();
    const tx = db.transaction('folderPermissions', 'readwrite');
    const store = tx.objectStore('folderPermissions');
    await store.put({ id: 'folderHandle', handle });
    await tx.complete;
    console.log('Folder permission saved successfully');
  } catch (error) {
    console.error('Error saving folder permission:', error);
  }
}

// Load saved folder handle from IndexedDB
async function loadSavedFolderPermission() {
  try {
    const db = await openDatabase();
    const tx = db.transaction('folderPermissions', 'readonly');
    const store = tx.objectStore('folderPermissions');
    const stored = await store.get('folderHandle');
    
    if (stored && stored.handle) {
      try {
        // Vérifier les permissions
        const permission = await stored.handle.requestPermission({ mode: 'read' });
        if (permission === 'granted') {
          folderHandle = stored.handle;
          console.log('Permissions du dossier chargées avec succès');
          
          // Update UI immediately
          updateUIWithFolder(folderHandle);
          
          // Load folder content and data
          await loadAllData();
          await loadFolderContent(folderHandle);
          monitorDirectory();
          
          // Informer le service worker du dossier actif
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'FOLDER_INFO',
              folderInfo: {
                name: folderHandle.name
              }
            });
          }
          
          return true;
        }
      } catch (error) {
        console.error('Erreur lors de la vérification des permissions:', error);
        // Clear invalid handle
        await clearStoredFolderPermission();
      }
    }
    return false;
  } catch (error) {
    console.error('Erreur lors du chargement des permissions du dossier:', error);
    return false;
  }
}

// Update UI with folder information
function updateUIWithFolder(handle) {
  if (!handle) return;
  
  document.getElementById('selectFolder').textContent = 'Changer de dossier';
  document.getElementById('syncStatus').style.display = 'block';
  document.getElementById('currentPath').style.display = 'block';
  document.getElementById('currentPath').textContent = `Dossier surveillé : ${handle.name}`;
  document.getElementById('fileList').style.display = 'block';
}

// Clear stored folder permission
async function clearStoredFolderPermission() {
  try {
    const db = await openDatabase();
    const tx = db.transaction('folderPermissions', 'readwrite');
    const store = tx.objectStore('folderPermissions');
    await store.delete('folderHandle');
    await tx.complete;
    console.log('Stored folder permission cleared');
  } catch (error) {
    console.error('Error clearing folder permission:', error);
  }
}

// Save processed files to IndexedDB
async function saveProcessedFiles() {
  try {
    const db = await openDatabase();
    const tx = db.transaction('processedFiles', 'readwrite');
    const store = tx.objectStore('processedFiles');
    await store.put({ id: 'files', files: Array.from(processedFiles) });
    await tx.complete;
    console.log('Processed files saved successfully');
  } catch (error) {
    console.error('Error saving processed files:', error);
  }
}

// Load processed files from IndexedDB
async function loadProcessedFiles() {
  try {
    const db = await openDatabase();
    const tx = db.transaction('processedFiles', 'readonly');
    const store = tx.objectStore('processedFiles');
    const stored = await store.get('files');
    if (stored && stored.files) {
      processedFiles = new Set(stored.files);
      console.log('Processed files loaded:', processedFiles.size);
    }
  } catch (error) {
    console.error('Error loading processed files:', error);
  }
}

// Save file statuses to IndexedDB
async function saveFileStatuses() {
  try {
    const db = await openDatabase();
    const tx = db.transaction('processedFiles', 'readwrite');
    const store = tx.objectStore('processedFiles');
    await store.put({ id: 'statuses', statuses: fileStatuses });
    await tx.complete;
    console.log('File statuses saved successfully');
  } catch (error) {
    console.error('Error saving file statuses:', error);
  }
}

// Load file statuses from IndexedDB
async function loadFileStatuses() {
  try {
    const db = await openDatabase();
    const tx = db.transaction('processedFiles', 'readonly');
    const store = tx.objectStore('processedFiles');
    const stored = await store.get('statuses');
    if (stored && stored.statuses) {
      fileStatuses = stored.statuses;
      console.log('File statuses loaded:', Object.keys(fileStatuses).length);
    }
  } catch (error) {
    console.error('Error loading file statuses:', error);
  }
}

// Open IndexedDB database
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CTM_CV_App', 2);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('folderPermissions')) {
        db.createObjectStore('folderPermissions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('processedFiles')) {
        db.createObjectStore('processedFiles', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('emailQueue')) {
        db.createObjectStore('emailQueue', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Save all data to both IndexedDB and local folder
async function saveAllData() {
  try {
    // Save to IndexedDB
    await saveProcessedFiles();
    await saveFileStatuses();
    
    // Save to local folder if available
    if (folderHandle) {
      try {
        const dataFile = await folderHandle.getFileHandle('.app-data.json', { create: true });
        const writable = await dataFile.createWritable();
        const data = {
          processedFiles: Array.from(processedFiles),
          fileStatuses,
          lastUpdate: new Date().toISOString(),
          folderName: folderHandle.name
        };
        await writable.write(JSON.stringify(data));
        await writable.close();
        console.log('Data saved to local folder');
      } catch (error) {
        console.error('Error saving to local folder:', error);
      }
    }
  } catch (error) {
    console.error('Error saving all data:', error);
  }
}

// Load all data from both IndexedDB and local folder
async function loadAllData() {
  try {
    // Load from IndexedDB first
    await loadProcessedFiles();
    await loadFileStatuses();
    
    // Try to load from local folder if available
    if (folderHandle) {
      try {
        const dataFile = await folderHandle.getFileHandle('.app-data.json');
        const file = await dataFile.getFile();
        const data = JSON.parse(await file.text());
        
        // Merge data - ensure we properly update our sets
        if (data.processedFiles && Array.isArray(data.processedFiles)) {
          data.processedFiles.forEach(file => processedFiles.add(file));
        }
        
        // Merge file statuses
        if (data.fileStatuses && typeof data.fileStatuses === 'object') {
          Object.assign(fileStatuses, data.fileStatuses);
        }
        
        console.log('Data loaded from local folder');
      } catch (error) {
        console.log('No local data file found, using IndexedDB data');
      }
    }
  } catch (error) {
    console.error('Error loading all data:', error);
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
}

// Add file to UI with status
function addFileToUI(file, status = 'pending') {
  const fileListElement = document.getElementById('fileList');
  
  // Check if file already exists in the list
  const fileId = `file-${file.name.replace(/\s+/g, '-')}`;
  const existingFileItem = document.getElementById(fileId);
  
  if (existingFileItem) {
    // Update existing file item
    const statusElement = existingFileItem.querySelector('.file-status');
    statusElement.textContent = getStatusText(status);
    statusElement.className = `file-status ${status}`;
    return;
  }
  
  // Create new file item
  const fileItem = document.createElement('div');
  fileItem.className = 'file-item';
  fileItem.id = fileId;
  
  const fileIcon = document.createElement('span');
  fileIcon.className = 'file-icon';
  fileIcon.textContent = '📄 ';
  
  const fileName = document.createElement('span');
  fileName.className = 'file-name';
  fileName.textContent = file.name;
  
  const fileSize = document.createElement('span');
  fileSize.className = 'file-size';
  fileSize.textContent = formatFileSize(file.size);
  
  const fileStatus = document.createElement('span');
  fileStatus.className = `file-status ${status}`;
  fileStatus.textContent = getStatusText(status);
  
  fileItem.appendChild(fileIcon);
  fileItem.appendChild(fileName);
  fileItem.appendChild(fileSize);
  fileItem.appendChild(fileStatus);
  
  fileListElement.appendChild(fileItem);
  fileStatuses[file.name] = status;
  
  // Save updated file statuses
  saveFileStatuses();
}

// Get text representation of file status
function getStatusText(status) {
  switch(status) {
    case 'pending': return 'En attente';
    case 'sending': return 'Envoi...';
    case 'sent': return 'Envoyé';
    case 'error': return 'Erreur';
    case 'queued': return 'En file d\'attente';
    default: return 'Inconnu';
  }
}

// Load the content of the selected folder
async function loadFolderContent(handle) {
  if (!handle) return;

  const currentPathElement = document.getElementById('currentPath');
  const fileListElement = document.getElementById('fileList');

  // Show folder name
  currentPathElement.style.display = 'block';
  currentPathElement.textContent = `Dossier surveillé : ${handle.name}`;

  // Clear previous file list
  fileListElement.innerHTML = '';
  fileListElement.style.display = 'block';

  let hasFiles = false;

  // Iterate over the folder contents
  try {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file' && !entry.name.startsWith('.')) {
        hasFiles = true;
        const file = await entry.getFile();

        // Determine status based on whether file has been processed
        let status = 'pending';
        if (processedFiles.has(file.name)) {
          status = fileStatuses[file.name] || 'sent';
        }

        // Add file to the UI
        addFileToUI(file, status);
      }
    }

    if (!hasFiles) {
      const noFilesMessage = document.createElement('div');
      noFilesMessage.className = 'no-files-message';
      noFilesMessage.textContent = 'Aucun fichier détecté dans ce dossier.';
      fileListElement.appendChild(noFilesMessage);
    }
  } catch (error) {
    console.error('Error loading folder content:', error);
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = 'Erreur lors du chargement du contenu du dossier.';
    fileListElement.appendChild(errorMessage);
  }
}

// Vérifier périodiquement les nouveaux fichiers
async function checkForNewFiles() {
  if (!folderHandle) return [];
  
  console.log('Vérification des nouveaux fichiers...');
  try {
    const newFiles = [];
    
    // Parcourir le contenu du dossier
    for await (const entry of folderHandle.values()) {
      if (entry.kind === 'file' && !entry.name.startsWith('.')) {
        const file = await entry.getFile();
        
        // Si le fichier n'a pas été traité
        if (!processedFiles.has(file.name)) {
          console.log('Nouveau fichier détecté:', file.name);
          newFiles.push(file);
          processedFiles.add(file.name);
        }
      }
    }
    
    // Traiter les nouveaux fichiers s'il y en a
    if (newFiles.length > 0) {
      await sendNewFiles(newFiles);
      await saveProcessedFiles();
      await saveFileStatuses();
    }
    
    return newFiles;
  } catch (error) {
    console.error('Erreur lors de la vérification des nouveaux fichiers:', error);
    return [];
  }
}

// Monitor directory for changes
async function monitorDirectory() {
  if (!folderHandle) return;
  console.log('Surveillance du dossier:', folderHandle.name);
  
  await checkForNewFiles();
  
  // Continuer la surveillance
  setTimeout(monitorDirectory, 5000); // Vérifier les nouveaux fichiers toutes les 5 secondes
}

// Configurer la messagerie du service worker
function setupServiceWorkerMessaging() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', async (event) => {
      console.log('Message reçu du service worker:', event.data);
      
      if (event.data.type === 'GET_STORED_DATA') {
        if (folderHandle) {
          const newFiles = await checkForNewFiles();
          
          // Envoyer les informations au service worker
          event.source.postMessage({
            type: 'SYNC_FILES',
            files: newFiles,
            folderInfo: {
              name: folderHandle.name
            }
          });
        }
      } else if (event.data.type === 'FILES_SYNCED') {
        console.log('Fichiers synchronisés par le service worker:', event.data.files);
        // Mettre à jour l'interface si nécessaire
        event.data.files.forEach(fileName => {
          processedFiles.add(fileName);
          fileStatuses[fileName] = 'sent';
          const fileId = `file-${fileName.replace(/\s+/g, '-')}`;
          const fileItem = document.getElementById(fileId);
          if (fileItem) {
            const statusElement = fileItem.querySelector('.file-status');
            statusElement.textContent = getStatusText('sent');
            statusElement.className = 'file-status sent';
          }
        });
        
        // Sauvegarder les fichiers traités
        await saveProcessedFiles();
        await saveFileStatuses();
        await saveAllData(); // Save to both IndexedDB and local file
      }
    });
  }
}

async function queueEmail(files) {
  try {
    const db = await openDatabase();
    const tx = db.transaction('emailQueue', 'readwrite');
    const store = tx.objectStore('emailQueue');
    
    const emailData = {
      to: 'mnfad@ctm.ma',
      subject: 'Nouveaux fichiers CV',
      message: 'Nouveaux fichiers CV détectés dans le dossier surveillé.',
      files: files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      }))
    };
    
    await store.add(emailData);
    await tx.complete;
    console.log('Email queued for later sending');
    
    return true;
  } catch (error) {
    console.error('Error queuing email:', error);
    return false;
  }
}

// Function to send new files to the server
async function sendNewFiles(files) {
  if (!files || files.length === 0) return;
  console.log('Sending new files:', files.map(f => f.name));
  
  try {
    // Check if offline
    if (!navigator.onLine) {
      console.log('Offline: Queuing email');
      const queued = await queueEmail(files);
      
      // Update file statuses to queued
      files.forEach(file => {
        fileStatuses[file.name] = 'queued';
        addFileToUI(file, 'queued');
      });

      // Save updated file statuses
      await saveFileStatuses();
      await saveAllData();
      
      // Register sync if available
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-emails');
      }
      
      return;
    }
    
    // Update file status to sending
    files.forEach(file => {
      fileStatuses[file.name] = 'sending';
      addFileToUI(file, 'sending');
    });
    
    const formData = new FormData();
    formData.append('to', 'mnfad@ctm.ma');
    formData.append('subject', 'Nouveaux fichiers CV');
    formData.append('message', 'Nouveaux fichiers CV détectés dans le dossier surveillé.');
    
    files.forEach(file => formData.append('files', file));
    
    const response = await fetch('http://localhost:3002/send-email', {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      console.log('Files sent successfully');
      // Update file statuses to sent
      files.forEach(file => {
        fileStatuses[file.name] = 'sent';
        addFileToUI(file, 'sent');
      });
    } else {
      console.error('Failed to send files:', await response.text());
      // Update file statuses to error
      files.forEach(file => {
        fileStatuses[file.name] = 'error';
        addFileToUI(file, 'error');
      });
    }
    
    // Save updated file statuses and data
    await saveFileStatuses();
    await saveAllData();
    
  } catch (error) {
    console.error('Error sending files:', error);
    // Update file statuses to error
    files.forEach(file => {
      fileStatuses[file.name] = 'error';
      addFileToUI(file, 'error');
    });
    
    // Save updated file statuses
    await saveFileStatuses();
    await saveAllData();
  }
}

// DOMContentLoaded Event
document.addEventListener('DOMContentLoaded', async () => {
  if ('showDirectoryPicker' in window) {
    try {
      // Wait for service worker to be ready
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }
      
      // Try to load saved folder permission
      const hasPermission = await loadSavedFolderPermission();
      
      document.getElementById('selectFolder').addEventListener('click', async () => {
        try {
          const handle = await window.showDirectoryPicker({
            id: 'ctm-cv-folder',
            mode: 'readwrite',
            startIn: 'documents'
          });
          
          folderHandle = handle;
          await saveFolderPermission(handle);
          updateUIWithFolder(handle);
          await loadAllData();
          await loadFolderContent(handle);
          monitorDirectory();
          
          // Inform service worker
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'FOLDER_INFO',
              folderInfo: { name: folderHandle.name }
            });
          }
        } catch (err) {
          console.error('Error selecting folder:', err);
        }
      });
      
      setupServiceWorkerMessaging();
    } catch (error) {
      console.error('Error during initialization:', error);
    }
  } else {
    document.getElementById('selectFolder').style.display = 'none';
    document.getElementById('noSupport').style.display = 'block';
  }
});

// Enregistrer le service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then((registration) => {
      console.log('Service Worker registered with scope:', registration.scope);
      
      // Register Background Sync for emails
      if ('SyncManager' in window) {
        return registration.sync.register('sync-emails');
      }
    })
    .then(() => {
      console.log('Background sync registered for emails');
    })
    .catch((error) => {
      console.error('Service Worker registration failed:', error);
    });
}

// Register Periodic Background Sync for emails
if ('serviceWorker' in navigator && 'PeriodicSyncManager' in window) {
  navigator.serviceWorker.ready.then((registration) => {
    // Check for permission
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'periodic-background-sync' }).then((result) => {
        if (result.state === 'granted') {
          // Permission granted, register periodic sync
          registration.periodicSync.register('sync-emails', {
            minInterval: 24 * 60 * 60 * 1000 // 1 day in milliseconds
          }).then(() => {
            console.log('Periodic sync registered for emails');
            
            // Register sync for checking new files
            return registration.periodicSync.register('check-new-files', {
              minInterval: 15 * 60 * 1000 // 15 minutes
            });
          }).then(() => {
            console.log('Periodic sync registered for checking new files');
          }).catch((error) => {
            console.error('Periodic sync registration failed:', error);
          });
        }
      }).catch((error) => {
        console.error('Error checking Periodic Background Sync permission:', error);
      });
    }
  });
}

// Listen for online event to re-register background sync
window.addEventListener('online', async () => {
  console.log('Device is back online');
  
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-emails');
      console.log('Background sync re-registered after coming online');
    }
    
    // Check for new files after coming back online
    if (folderHandle) {
      await checkForNewFiles();
    }
  } catch (error) {
    console.error('Error handling online event:', error);
  }
});

// Remove duplicate visibilitychange event listener and consolidate them
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && folderHandle) {
    console.log('Page visible again, checking for new files...');
    await checkForNewFiles();
    await loadAllData(); // Reload data when tab becomes visible
  } else if (document.visibilityState === 'hidden' && folderHandle) {
    console.log('Page hidden, saving data...');
    await saveAllData();
    await saveFolderPermission(folderHandle);
  }
});

// Save data before the page is unloaded
window.addEventListener('beforeunload', async (event) => {
  if (folderHandle) {
    event.preventDefault();
    await saveAllData();
    await saveFolderPermission(folderHandle);
  }
});

// Load saved state when page loads
window.addEventListener('load', async () => {
  // Try to restore previous session
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.ready;
      const hasPermission = await loadSavedFolderPermission();
    } catch (error) {
      console.error('Error restoring session:', error);
    }
  }
});