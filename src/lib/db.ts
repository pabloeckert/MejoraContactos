import { openDB, type IDBPDatabase } from "idb";
import type { UnifiedContact } from "@/types/contact";

const DB_NAME = "contact-unifier";
const DB_VERSION = 2;

let dbInstance: IDBPDatabase | null = null;

async function getDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (db.objectStoreNames.contains("contacts")) {
        db.deleteObjectStore("contacts");
      }
      const store = db.createObjectStore("contacts", { keyPath: "id" });
      store.createIndex("email", "email", { unique: false });
      store.createIndex("whatsapp", "whatsapp", { unique: false });
      store.createIndex("source", "source", { unique: false });
    },
  });
  return dbInstance;
}

export async function saveContacts(contacts: UnifiedContact[]) {
  const db = await getDB();
  const tx = db.transaction("contacts", "readwrite");
  for (const c of contacts) {
    await tx.store.put(c);
  }
  await tx.done;
}

export async function getAllContacts(): Promise<UnifiedContact[]> {
  const db = await getDB();
  return db.getAll("contacts");
}

export async function getContactCount(): Promise<number> {
  const db = await getDB();
  return db.count("contacts");
}

export async function clearContacts() {
  const db = await getDB();
  await db.clear("contacts");
}

export async function deleteContact(id: string) {
  const db = await getDB();
  await db.delete("contacts", id);
}

export async function updateContact(contact: UnifiedContact) {
  const db = await getDB();
  await db.put("contacts", contact);
}
