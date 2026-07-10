// 최근 파일을 IndexedDB에 저장/조회. 원본 File(Blob)을 보관하여 재열기 지원.
import type { RecentFile } from '../types'

const DB_NAME = 'pixelstudio'
const DB_VERSION = 1
const STORE = 'recentFiles'
const MAX_RECENT = 20

export type StoredFile = RecentFile & { blob: Blob }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('modified', 'modified')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

export async function putRecentFile(record: StoredFile): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const store = tx(db, 'readwrite')
    const r = store.put(record)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
  await pruneOld(db)
  db.close()
}

async function pruneOld(db: IDBDatabase): Promise<void> {
  const all = await new Promise<StoredFile[]>((resolve, reject) => {
    const req = tx(db, 'readonly').getAll()
    req.onsuccess = () => resolve(req.result as StoredFile[])
    req.onerror = () => reject(req.error)
  })
  if (all.length <= MAX_RECENT) return
  const sorted = all.sort((a, b) => b.modified - a.modified)
  const toDelete = sorted.slice(MAX_RECENT)
  await new Promise<void>((resolve, reject) => {
    const store = tx(db, 'readwrite')
    toDelete.forEach((d) => store.delete(d.id))
    store.transaction.oncomplete = () => resolve()
    store.transaction.onerror = () => reject(store.transaction.error)
  })
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  try {
    const db = await openDb()
    const all = await new Promise<StoredFile[]>((resolve, reject) => {
      const req = tx(db, 'readonly').getAll()
      req.onsuccess = () => resolve(req.result as StoredFile[])
      req.onerror = () => reject(req.error)
    })
    db.close()
    return all
      .sort((a, b) => b.modified - a.modified)
      .slice(0, MAX_RECENT)
      .map(({ blob: _blob, ...meta }) => meta)
  } catch {
    return []
  }
}

export async function getRecentBlob(id: string): Promise<StoredFile | null> {
  try {
    const db = await openDb()
    const rec = await new Promise<StoredFile | undefined>((resolve, reject) => {
      const req = tx(db, 'readonly').get(id)
      req.onsuccess = () => resolve(req.result as StoredFile | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return rec ?? null
  } catch {
    return null
  }
}

export async function clearRecentFiles(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const store = tx(db, 'readwrite')
      const r = store.clear()
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
    db.close()
  } catch {
    // 무시
  }
}
