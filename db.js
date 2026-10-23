// db.js: everything that talks to IndexedDB lives in this file.
// game.js calls these functions. YOU write them.
// Each one throws "not built yet" until you replace that line with your code.
// Your packet's DATA SPEC says WHAT every record holds. Spell every name EXACTLY
// like the spec, so your teacher can open DevTools and find everything.

const DB_NAME = "questDB";
const DB_VERSION = 2;

// ALREADY DONE: wraps an IndexedDB request in a promise so you can use await.
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------- Level 1: Open the database ----------
// Opens questDB. Version 1 has three stores: "heroes", "inventory", and "powers".
// Gives back (a promise for) the open database.
async function openDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("heroes")) {
      db.createObjectStore("heroes", { keyPath: "name" });
    }
    if (!db.objectStoreNames.contains("inventory")) {
      db.createObjectStore("inventory", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("powers")) {
      db.createObjectStore("powers", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("journal")) {
      db.createObjectStore("journal", { keyPath: "id", autoIncrement: true });
    }
  };
  return promisify(request);
}

// ---------- Level 1: Heroes ----------
// name: like "Ana". heroClass: "fighter", "rogue", "wizard", or "cleric".
// attributes: { strength: 15, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 13 }
// Build a NEW hero record (see the DATA SPEC) and save it. Give back the record.
// A name that is already taken should fail, not replace the old hero.
async function createHero(name, heroClass, attributes) {
  const db = await openDB();
  const heroStore = db.transaction("heroes", "readwrite").objectStore("heroes");
  const allHeroes = await promisify(heroStore.getAll());

  if (allHeroes.some((hero) => hero.name === name)) {
    throw new Error(`Hero "${name}" already exists.`);
  } else {
    const hero = {
      name: name,
      heroClass: heroClass,
      attributes: attributes,
      hp: 10 + modifier(attributes.constitution),
      maxHp: 10 + modifier(attributes.constitution),
      xp: 0,
      level: 1,
      gold: 10,
      createdAt: new Date().toISOString()
    };
    await promisify(heroStore.add(hero));
    return hero;
  }
}

// name: a hero's name. Gives back that hero's record (or undefined).
async function getHero(name) {
  const questDB = await openDB();
  const heroStore = questDB.transaction('heroes', 'readonly').objectStore('heroes')
  return promisify(heroStore.get(name))

}

// Gives back an array of every hero record.
async function getAllHeroes() {
  const db = await openDB();
  const heroStore = db.transaction("heroes", "readonly").objectStore("heroes");
  return promisify(heroStore.getAll());
}

// hero: a hero record that game.js changed (new hp, xp, level, or gold).
// Save it over the old one.
async function updateHero(hero) {
  const db = await openDB();
  const heroStore = db.transaction("heroes", "readwrite").objectStore("heroes");

  await promisify(heroStore.put(hero));
}

// ---------- Level 2: Inventory ----------
// heroName: whose bag. item: one object from ITEMS in data.js, like
//   { itemId: "healing-potion", name: "Healing Potion", type: "potion", icon: "🧪" }
// Not in that hero's bag yet? Save it with qty 1. Already there? Add 1 to qty.
async function addItem(heroName, item) {
  const db = await openDB();
  const inventoryStore = db.transaction("inventory", "readwrite").objectStore("inventory");
  const id = `${heroName}-${item.itemId}`;
  const existing = await promisify(inventoryStore.get(id));

  if (!existing) {
    await promisify(inventoryStore.add({
      id: id,
      hero: heroName,
      itemId: item.itemId,
      name: item.name,
      type: item.type,
      icon: item.icon,
      qty: 1
    }));
  } else {
    existing.qty += 1;
    await promisify(inventoryStore.put(existing));
  }
}

// heroName: whose bag. Gives back ONLY that hero's items.
async function getInventory(heroName) {
  /* throw new Error("getInventory() is not built yet (Level 2)"); */

  const db = await openDB();
  const inventoryStore = db.transaction("inventory", "readonly").objectStore("inventory");
  const allInventory = await promisify(inventoryStore.getAll());
  return allInventory.filter((inventory) => inventory.hero == heroName)
}

// heroName: whose bag. itemId: which item, like "healing-potion".
// Takes 1 away from qty. At 0, the item leaves the bag.
async function removeItem(heroName, itemId) {
  const db = await openDB();
  const inventoryStore = db.transaction("inventory", "readwrite").objectStore("inventory");
  const id = `${heroName}-${itemId}`;
  const item = await promisify(inventoryStore.get(id));

  if (!item) return;
  if (item.qty <= 1) {
    await promisify(inventoryStore.delete(id));
  } else {
    item.qty -= 1;
    await promisify(inventoryStore.put(item));
  }
}

// ---------- Level 2: Powers ----------
// heroName: who learns it. power: one object from a class's powers in data.js, like
//   { powerId: "magic-missile", name: "Magic Missile", description: "...", learnAt: 1 }
// Saves that the hero knows this power.
async function learnPower(heroName, power) {
  const db = await openDB();
  const store = db.transaction("powers", "readwrite").objectStore("powers");
  

    await promisify(store.add({
      id: heroName + "-" + power.powerId,
      hero: heroName,
      powerId: power.powerId,
      name: power.name,
      description: power.description,
      learnAt: power.learnAt
    }));
  }

// heroName: whose powers. Gives back ONLY that hero's powers.
async function getPowers(heroName) {
  const db = await openDB();
  const powerStore = db.transaction("powers", "readonly").objectStore("powers");
  const allPowers = await promisify(powerStore.getAll());
  return allPowers.filter(power => power.hero === heroName);
}

// ---------- Level 2: Delete ----------
// name: a hero's name. Removes the hero AND everything that belongs to them
// (their items and powers, and at Level 3, their journal too).
async function deleteHero(name) {
  const db = await openDB();
  const tx = db.transaction(["heroes", "inventory", "powers", "journal"], "readwrite");

  const heroStore = tx.objectStore("heroes");
  const inventoryStore = tx.objectStore("inventory");
  const powersStore = tx.objectStore("powers");
  const journalStore = tx.objectStore("journal");

  const hero = await promisify(heroStore.get(name));

  if (!hero) {
    throw new Error(`Hero "${name}" does not exist.`);
  }

  const inventory = await promisify(inventoryStore.getAll());
  const powers = await promisify(powersStore.getAll());
  const journal = await promisify(journalStore.getAll());

  for (const entry of journal) {
    if (entry.hero === name) {
      await promisify(journalStore.delete(entry.id));
    }
  }

  await promisify(heroStore.delete(name));

  for (const item of inventory) {
    if (item.hero === name) {
      await promisify(inventoryStore.delete(item.id));
    }
  }

  for (const power of powers) {
    if (power.hero === name) {
      await promisify(powersStore.delete(power.id));
    }
  }

  return hero;
}


// ---------- Level 3: Adventure journal (version 2) ----------
// heroName: whose journal. text: what happened, like "Beat a Goblin. +30 XP".
// Saves a new journal entry.
//Version 2 of the db means i need to create a new 
async function addJournal(heroName, text) {
  /* throw new Error("addJournal() is not built yet (Level 3)");  */
  
/*   const db = await openDB(DB_NAME, 2);
  const store = db.transaction("") */
  const db = await openDB();
  const store = db.transaction("journal", "readwrite").objectStore("journal");

  //save new journal entry
  const entry = {
    hero: heroName,
    text: text,
    createdAt: new Date().toISOString()
  };

  return await promisify(store.add(entry));


}

// heroName: whose journal. Gives back ONLY that hero's entries, newest first.
async function getJournal(heroName) {
  /* throw new Error("getJournal() is not built yet (Level 3)"); */

  const db = await openDB();
  const store = db.transaction("journal", "readonly").objectStore("journal");

  const allEntries = await promisify(store.getAll());

  //use filter to get only the entries for the specified hero, then use reverse 
  const heroEntries = allEntries.filter(entry => entry.hero == heroName);
  const reversedEntries = heroEntries.reverse();
  return reversedEntries;
}
