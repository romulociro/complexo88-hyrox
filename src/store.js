const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { SEED_ATHLETES, slugify } = require("./seed");
const { normalize } = require("./play");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_PATH = process.env.DATA_PATH || path.join(DATA_DIR, "store.json");

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function seedAthletes() {
  return SEED_ATHLETES.map((athlete, index) => ({
    id: slugify(athlete.name),
    name: athlete.name,
    nickname: athlete.nickname,
    icon: athlete.icon,
    createdAt: nowIso(),
    order: index + 1,
  }));
}

function emptyStore() {
  return normalize(
    {
      athletes: seedAthletes(),
      messages: [],
      muted: [],
      updatedAt: nowIso(),
    },
    { nowIso, seedAthletes }
  );
}

class Store {
  constructor() {
    this.data = emptyStore();
    this.queue = Promise.resolve();
  }

  load() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_PATH)) {
      this.data = emptyStore();
      this.writeSync();
      console.log(`Seed inicial gravado em ${DATA_PATH}`);
      return this.data;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      this.data = normalize(raw, { nowIso, seedAthletes });
      this.writeSync();
    } catch {
      this.data = emptyStore();
      this.writeSync();
    }
    return this.data;
  }

  writeSync() {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    const tmp = `${DATA_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, DATA_PATH);
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }

  async mutate(fn) {
    const run = this.queue.then(async () => {
      const result = await fn(this.data);
      this.data.updatedAt = nowIso();
      this.writeSync();
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  ranking() {
    return [...this.data.athletes].sort((a, b) => a.order - b.order);
  }

  publicMessages() {
    return this.data.messages.filter((m) => !m.hidden);
  }

  isMuted(userId) {
    return this.data.muted.some((m) => m.userId === userId);
  }
}

module.exports = { Store, newId, nowIso, DATA_PATH, slugify };
