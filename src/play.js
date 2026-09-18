const REACTIONS = ["🔥", "💪", "😂", "👀"];

function saoPauloDate(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function shiftSaoPauloDate(days) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const sp = new Date(utc - 3 * 60 * 60000);
  sp.setDate(sp.getDate() + days);
  const y = sp.getFullYear();
  const m = String(sp.getMonth() + 1).padStart(2, "0");
  const d = String(sp.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdaySaoPaulo() {
  return shiftSaoPauloDate(-1);
}

function isoWeekKey(date = new Date()) {
  const sp = new Date(
    date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  const target = new Date(Date.UTC(sp.getFullYear(), sp.getMonth(), sp.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function emptyPlay() {
  return {
    hallOfFame: [],
    checkins: {},
    provocas: [],
    rivals: {},
    predictions: { open: true, revealed: false, votes: {}, actual: null },
    weekPodium: { open: true, weekKey: isoWeekKey(), votes: {} },
    challenge: null,
    poll: null,
    pinnedMessageId: null,
  };
}

function normalize(data, { nowIso, seedAthletes }) {
  const play = emptyPlay();
  data.athletes = Array.isArray(data.athletes) ? data.athletes : seedAthletes();
  data.messages = Array.isArray(data.messages) ? data.messages : [];
  data.muted = Array.isArray(data.muted) ? data.muted : [];
  data.hallOfFame = Array.isArray(data.hallOfFame) ? data.hallOfFame : [];
  data.checkins = data.checkins && typeof data.checkins === "object" ? data.checkins : {};
  data.provocas = Array.isArray(data.provocas) ? data.provocas : [];
  data.rivals = data.rivals && typeof data.rivals === "object" ? data.rivals : {};
  data.predictions = {
    ...play.predictions,
    ...(data.predictions && typeof data.predictions === "object" ? data.predictions : {}),
    votes:
      data.predictions && data.predictions.votes && typeof data.predictions.votes === "object"
        ? data.predictions.votes
        : {},
  };
  data.weekPodium = {
    ...play.weekPodium,
    ...(data.weekPodium && typeof data.weekPodium === "object" ? data.weekPodium : {}),
    votes:
      data.weekPodium && data.weekPodium.votes && typeof data.weekPodium.votes === "object"
        ? data.weekPodium.votes
        : {},
    weekKey: (data.weekPodium && data.weekPodium.weekKey) || isoWeekKey(),
  };
  data.challenge = data.challenge || null;
  data.poll = data.poll || null;
  data.pinnedMessageId = data.pinnedMessageId || null;
  data.updatedAt = data.updatedAt || nowIso();

  for (const message of data.messages) {
    if (!message.reactions || typeof message.reactions !== "object") {
      message.reactions = {};
    }
    for (const emoji of REACTIONS) {
      if (!Array.isArray(message.reactions[emoji])) message.reactions[emoji] = [];
    }
  }

  if (!data.hallOfFame.length) {
    const first = [...data.athletes].sort((a, b) => a.order - b.order)[0];
    if (first) {
      data.hallOfFame.push({
        athleteId: first.id,
        name: first.name,
        nickname: first.nickname,
        icon: first.icon,
        firstAt: first.createdAt || nowIso(),
        reigns: 1,
      });
    }
  }
  return data;
}

function linkedAthleteId(user) {
  if (!user) return null;
  if (user.linkedAthleteId) return user.linkedAthleteId;
  if (String(user.id || "").startsWith("dev:")) return String(user.id).slice(4);
  return null;
}

function recordNumberOne(data, athlete, { incrementReigns, nowIso }) {
  if (!athlete) return;
  const row = data.hallOfFame.find((h) => h.athleteId === athlete.id);
  if (!row) {
    data.hallOfFame.unshift({
      athleteId: athlete.id,
      name: athlete.name,
      nickname: athlete.nickname,
      icon: athlete.icon,
      firstAt: nowIso(),
      reigns: 1,
    });
    return;
  }
  row.name = athlete.name;
  row.nickname = athlete.nickname;
  row.icon = athlete.icon;
  if (incrementReigns) row.reigns += 1;
}

function streakForAthlete(data, athleteId) {
  const today = saoPauloDate();
  const hit = Object.values(data.checkins).find((c) => c.athleteId === athleteId);
  if (!hit) return { streak: 0, trainedToday: false };
  return {
    streak: hit.streak || 0,
    trainedToday: hit.lastDate === today,
    lastDate: hit.lastDate,
  };
}

function applyCheckin(data, user) {
  const today = saoPauloDate();
  const yesterday = yesterdaySaoPaulo();
  const athleteId = linkedAthleteId(user);
  const prev = data.checkins[user.id];
  if (prev && prev.lastDate === today) {
    return { ...prev, already: true };
  }
  const streak = prev && prev.lastDate === yesterday ? (prev.streak || 0) + 1 : 1;
  const row = {
    lastDate: today,
    streak,
    name: user.name,
    icon: user.icon || "",
    athleteId,
    already: false,
  };
  data.checkins[user.id] = row;
  return row;
}

function todayCheckins(data) {
  const today = saoPauloDate();
  return Object.entries(data.checkins)
    .filter(([, c]) => c.lastDate === today)
    .map(([userId, c]) => ({ userId, ...c }));
}

function reactionView(message) {
  const reactions = {};
  for (const emoji of REACTIONS) {
    const users = (message.reactions && message.reactions[emoji]) || [];
    reactions[emoji] = { count: users.length, users };
  }
  return reactions;
}

function toggleReaction(message, userId, emoji) {
  if (!REACTIONS.includes(emoji)) return false;
  if (!message.reactions) message.reactions = {};
  if (!Array.isArray(message.reactions[emoji])) message.reactions[emoji] = [];
  const list = message.reactions[emoji];
  const idx = list.indexOf(userId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(userId);
  return true;
}

function predictionTallies(data) {
  const up = {};
  const down = {};
  for (const vote of Object.values(data.predictions.votes || {})) {
    if (vote.up) up[vote.up] = (up[vote.up] || 0) + 1;
    if (vote.down) down[vote.down] = (down[vote.down] || 0) + 1;
  }
  return { up, down };
}

function computeActualMoves(before, after) {
  const prev = new Map(before.map((a, i) => [a.id, i]));
  const up = [];
  const down = [];
  after.forEach((a, i) => {
    const old = prev.get(a.id);
    if (old == null) return;
    if (i < old) up.push(a.id);
    if (i > old) down.push(a.id);
  });
  return { up, down };
}

function enteredTop3(before, after) {
  const oldTop = new Set(before.slice(0, 3).map((a) => a.id));
  return after.slice(0, 3).filter((a) => !oldTop.has(a.id));
}

function weekPodiumBoard(data, athletes) {
  const counts = {};
  for (const vote of Object.values(data.weekPodium.votes || {})) {
    if (vote.athleteId) counts[vote.athleteId] = (counts[vote.athleteId] || 0) + 1;
  }
  return [...athletes]
    .map((a) => ({
      id: a.id,
      name: a.name,
      nickname: a.nickname,
      icon: a.icon,
      votes: counts[a.id] || 0,
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "pt"));
}

function pollView(poll, { hideVotes = false } = {}) {
  if (!poll) return null;
  const counts = {};
  for (const optionId of Object.values(poll.votes || {})) {
    counts[optionId] = (counts[optionId] || 0) + 1;
  }
  const total = Object.keys(poll.votes || {}).length;
  return {
    id: poll.id,
    question: poll.question,
    open: poll.open,
    total,
    options: poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      count: hideVotes && poll.open ? 0 : counts[o.id] || 0,
    })),
  };
}

function inboxFor(data, user) {
  if (!user) return [];
  const mine = linkedAthleteId(user);
  if (!mine) return [];
  return data.provocas.filter((p) => p.toAthleteId === mine).slice(-20);
}

module.exports = {
  REACTIONS,
  saoPauloDate,
  yesterdaySaoPaulo,
  isoWeekKey,
  emptyPlay,
  normalize,
  linkedAthleteId,
  recordNumberOne,
  streakForAthlete,
  applyCheckin,
  todayCheckins,
  reactionView,
  toggleReaction,
  predictionTallies,
  computeActualMoves,
  enteredTop3,
  weekPodiumBoard,
  pollView,
  inboxFor,
};
