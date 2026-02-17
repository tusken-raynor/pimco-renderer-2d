let removedOldies = false;

function initIndexedDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ConfiguratorDB", 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images", { keyPath: "filename" });
      }
    };
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (removedOldies) {
        // Remove all expired entries from the database
        deleteOlderThan(db, "images", "createdAt", 90)
          .then(() => {
            removedOldies = true;
          })
          .catch((e) => {
            console.error("Failed to delete all old entries:", e);
          });
      }
      resolve(db);
    };
    request.onerror = event => {
      const error = event.target!['error'] || new Error("Failed to resolve DB upgrade");
      reject(error);
    };
  });
}

function saveBlob(filename: string, blob: Blob) {
  return new Promise<void>(async (resolve, reject) => {
    const db = await initIndexedDB();
    const tx = db.transaction("images", "readwrite");
    const store = tx.objectStore("images");
    store.put({ filename, blob, createdAt: Date.now() });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = e => {
      db.close();
      reject(e);
    };
    tx.onabort = (e) => {
      db.close();
      reject(e);
    };
  });
}

function getBlob(filename: string) {
  return new Promise<Blob | null>(async (resolve, reject) => {
    const db = await initIndexedDB();
    const tx = db.transaction("images", "readonly");
    const store = tx.objectStore("images");
    const getReq = store.get(filename);
    getReq.onerror = e => {
      db.close();
      reject(e);
    };
    tx.onerror = e => {
      db.close();
      reject(e);
    };
    tx.onabort = (e) => {
      db.close();
      reject(e);
    };
    // Make sure the transaction completion event and read success event are triggered before returning the blob
    await Promise.all([new Promise(r => tx.oncomplete = r), new Promise(r => getReq.onsuccess = r)]);
    // If the created timestamp was over 90 days ago, discount the record and delete it
    if (getReq.result?.createdAt && Date.now() - getReq.result.createdAt > 90 * 24 * 60 * 60 * 1000) {
      deleteBlob(filename);
      store.delete(filename);
      db.close();
      return;
    }
    db.close();
    resolve(getReq.result?.blob || null);
  });
}

function deleteBlob(filename: string) {
  return new Promise<void>(async (resolve, reject) => {
    const db = await initIndexedDB();
    const tx = db.transaction("images", "readwrite");
    const store = tx.objectStore("images");
    store.delete(filename);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = e => {
      db.close();
      reject(e);
    };
    tx.onabort = (e) => {
      db.close();
      reject(e);
    };
  });
}

export default {
  saveBlob,
  getBlob,
  deleteBlob
}

function deleteOlderThan(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  days: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);

      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const range = IDBKeyRange.upperBound(cutoff); // <= cutoff

      const request = index.openCursor(range);

      request.onsuccess = (event: Event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      request.onerror = () => reject(request.error);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}