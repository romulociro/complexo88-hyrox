require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const { WebSocketServer } = require("ws");
const { Store, newId, nowIso, slugify } = require("./src/store");
const play = require("./src/play");

const ON_RENDER = process.env.RENDER === "true";
const PORT = Number(process.env.PORT) || 43888;
const ADMIN_USER = process.env.ADMIN_USER || "";
const ADMIN_PASS = process.env.ADMIN_PASS || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "c88-dev-session-secret";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || (RENDER_URL ? `${RENDER_URL}/auth/google/callback` : "");
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1" || ON_RENDER;

const store = new Store();
store.load();

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false }));

const sessionParser = session({
  name: "c88.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

app.use(sessionParser);
app.use(express.static(path.join(__dirname, "public")));

function googleConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function publicOrigin(req) {
  if (GOOGLE_CALLBACK_URL) {
    try {
      return new URL(GOOGLE_CALLBACK_URL).origin;
    } catch {
      /* fall through */
    }
  }
  if (RENDER_URL) return RENDER_URL;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function callbackUrl(req) {
  if (GOOGLE_CALLBACK_URL) return GOOGLE_CALLBACK_URL;
  return `${publicOrigin(req)}/auth/google/callback`;
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function firstEmoji(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const segmenter = new Intl.Segmenter("pt", { granularity: "grapheme" });
    const first = [...segmenter.segment(text)][0];
    return first ? first.segment : text.slice(0, 8);
  } catch {
    return [...text][0] || "";
  }
}

function takeIcon(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const segmenter = new Intl.Segmenter("pt", { granularity: "grapheme" });
    return [...segmenter.segment(raw)]
      .slice(0, 3)
      .map((s) => s.segment)
      .join("")
      .slice(0, 16);
  } catch {
    return raw.slice(0, 16);
  }
}

function currentUser(req) {
  if (req.session?.admin) {
    return {
      id: "complexo",
      name: "COMPLEXO 88",
      nickname: "Box",
      avatar: "/img/c88.svg",
      type: "complexo",
      isAdmin: true,
      linkedAthleteId: null,
    };
  }
  if (req.session?.user) {
    return {
      ...req.session.user,
      isAdmin: false,
      linkedAthleteId: play.linkedAthleteId(req.session.user),
    };
  }
  return null;
}

function adminConfigured() {
  return Boolean(ADMIN_USER && ADMIN_PASS);
}

function requireAdmin(req, res, next) {
  if (!req.session?.admin) {
    return res.status(401).json({ error: "Faça login no painel do Complexo." });
  }
  next();
}

function requirePoster(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Entre para postar no mural." });
  }
  req.poster = user;
  next();
}

function requireAthlete(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Entra pra participar." });
  }
  if (user.isAdmin) {
    return res.status(403).json({ error: "O Complexo organiza. Entra como atleta pra essa jogada." });
  }
  req.poster = user;
  next();
}

function rankingPayload() {
  return store.ranking().map((athlete, index) => {
    const streak = play.streakForAthlete(store.data, athlete.id);
    return {
      ...athlete,
      rank: index + 1,
      streak: streak.streak,
      trainedToday: streak.trainedToday,
    };
  });
}

function findAthlete(id) {
  return store.ranking().find((a) => a.id === id) || null;
}

function messageView(message, { includeHidden = false } = {}) {
  if (!includeHidden && message.hidden) return null;
  return {
    id: message.id,
    authorId: message.authorId,
    authorName: message.authorName,
    authorNickname: message.authorNickname || "",
    authorAvatar: message.authorAvatar || "",
    authorType: message.authorType,
    icon: message.icon || "",
    text: message.text,
    createdAt: message.createdAt,
    hidden: Boolean(message.hidden),
    pinned: store.data.pinnedMessageId === message.id,
    reactions: play.reactionView(message),
  };
}

function orderedMessages(list) {
  const pinnedId = store.data.pinnedMessageId;
  const pinned = list.filter((m) => m.id === pinnedId);
  const rest = list.filter((m) => m.id !== pinnedId);
  return [...pinned, ...rest];
}

function predictionsView(user) {
  const p = store.data.predictions;
  const tallies = play.predictionTallies(store.data);
  const mine = user && !user.isAdmin ? p.votes[user.id] || null : null;
  return {
    open: Boolean(p.open),
    revealed: Boolean(p.revealed),
    mine,
    tallies: p.revealed || (user && user.isAdmin) ? tallies : null,
    actual: p.revealed ? p.actual : null,
    total: Object.keys(p.votes || {}).length,
  };
}

function weekPodiumView(user) {
  const w = store.data.weekPodium;
  const board = play.weekPodiumBoard(store.data, store.ranking());
  const mine = user && !user.isAdmin ? w.votes[user.id] || null : null;
  const podium = board.filter((a) => a.votes > 0).slice(0, 3);
  return {
    open: Boolean(w.open),
    weekKey: w.weekKey,
    mine,
    total: Object.keys(w.votes || {}).length,
    podium,
    board: w.open ? board.map((a) => ({ ...a, votes: a.votes })) : podium,
  };
}

function rivalView(user) {
  if (!user || user.isAdmin) return null;
  const pick = store.data.rivals[user.id];
  if (!pick) return { target: null, headToHead: null };
  const ranking = rankingPayload();
  const target = ranking.find((a) => a.id === pick.targetAthleteId) || null;
  const meId = play.linkedAthleteId(user);
  const me = meId ? ranking.find((a) => a.id === meId) || null : null;
  if (!target) return { target: null, headToHead: null };
  return {
    target,
    headToHead: {
      me,
      target,
      gap: me ? me.rank - target.rank : null,
    },
  };
}

function publicState(req) {
  const user = req ? currentUser(req) : null;
  const visible = orderedMessages(store.publicMessages().slice(-80)).map((m) => messageView(m));
  return {
    ranking: rankingPayload(),
    messages: visible,
    pinnedMessageId: store.data.pinnedMessageId,
    hallOfFame: store.data.hallOfFame,
    checkinsToday: play.todayCheckins(store.data),
    provocas: store.data.provocas.slice(-12).reverse(),
    inbox: play.inboxFor(store.data, user),
    predictions: predictionsView(user),
    weekPodium: weekPodiumView(user),
    challenge: store.data.challenge,
    poll: play.pollView(store.data.poll),
    rival: rivalView(user),
    updatedAt: store.data.updatedAt,
  };
}

function adminState() {
  return {
    ...publicState({ session: { admin: { name: "COMPLEXO 88" } } }),
    messages: orderedMessages(store.data.messages.slice(-200)).map((m) =>
      messageView(m, { includeHidden: true })
    ),
    muted: store.data.muted,
    predictions: predictionsView({ isAdmin: true, id: "complexo" }),
    weekPodium: weekPodiumView({ isAdmin: true, id: "complexo" }),
  };
}

const sockets = new Set();

function broadcast(type, payload) {
  const frame = JSON.stringify({ type, payload, at: Date.now() });
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(frame);
  }
}

function broadcastState(extra = {}) {
  broadcast("state", { ...publicState(), ...extra });
  broadcast("admin", adminState());
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "complexo88-hyrox-ranking",
    persist: "json-file",
    ephemeralDisk: ON_RENDER,
    adminEnv: adminConfigured(),
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    googleOAuth: googleConfigured(),
    devMode: !googleConfigured(),
    brand: "COMPLEXO 88",
  });
});

app.get("/api/me", (req, res) => {
  const user = currentUser(req);
  const checkin = user ? store.data.checkins[user.id] || null : null;
  res.json({
    user,
    muted: user ? store.isMuted(user.id) : false,
    googleOAuth: googleConfigured(),
    devMode: !googleConfigured(),
    checkin,
    inbox: play.inboxFor(store.data, user),
    rival: rivalView(user),
  });
});

app.get("/api/ranking", (_req, res) => {
  res.json({ ranking: rankingPayload(), updatedAt: store.data.updatedAt });
});

app.get("/api/state", (req, res) => {
  res.json(publicState(req));
});

app.get("/api/chat", (req, res) => {
  const admin = Boolean(req.session?.admin);
  const source = admin ? store.data.messages.slice(-200) : store.publicMessages().slice(-80);
  res.json({
    messages: orderedMessages(source).map((m) => messageView(m, { includeHidden: admin })),
    muted: admin ? store.data.muted : undefined,
  });
});

const lastPostAt = new Map();

app.post("/api/chat", requirePoster, async (req, res) => {
  const user = req.poster;
  if (store.isMuted(user.id)) {
    return res.status(403).json({ error: "Você está no banco. Fala com o Complexo." });
  }
  const text = cleanText(req.body?.text, 400);
  if (!text) {
    return res.status(400).json({ error: "Escreve alguma coisa, campeão." });
  }
  const now = Date.now();
  const prev = lastPostAt.get(user.id) || 0;
  if (now - prev < 1200) {
    return res.status(429).json({ error: "Devagar. O mural não é ski erg." });
  }
  lastPostAt.set(user.id, now);

  const message = {
    id: newId("msg"),
    authorId: user.id,
    authorName: user.name,
    authorNickname: user.nickname || "",
    authorAvatar: user.avatar || "",
    authorType: user.type || "athlete",
    icon: user.icon || "",
    text,
    hidden: false,
    reactions: { "🔥": [], "💪": [], "😂": [], "👀": [] },
    createdAt: nowIso(),
  };

  await store.mutate((data) => {
    data.messages.push(message);
    if (data.messages.length > 400) data.messages = data.messages.slice(-400);
  });

  broadcastState();
  res.status(201).json({ message: messageView(message) });
});

app.post("/api/chat/:id/react", requireAthlete, async (req, res) => {
  const user = req.poster;
  if (store.isMuted(user.id)) {
    return res.status(403).json({ error: "Você está no banco." });
  }
  const emoji = String(req.body?.emoji || "");
  const ok = await store.mutate((data) => {
    const message = data.messages.find((m) => m.id === req.params.id && !m.hidden);
    if (!message) return false;
    return play.toggleReaction(message, user.id, emoji);
  });
  if (!ok) {
    return res.status(400).json({ error: "Essa reação não cola." });
  }
  broadcastState();
  res.json({ ok: true });
});

app.post("/api/provoca", requireAthlete, async (req, res) => {
  const user = req.poster;
  if (store.isMuted(user.id)) {
    return res.status(403).json({ error: "Você está no banco." });
  }
  const toAthleteId = cleanText(req.body?.toAthleteId, 64);
  const text = cleanText(req.body?.text, 140);
  const target = findAthlete(toAthleteId);
  if (!target) return res.status(400).json({ error: "Escolhe quem vai levar a provocação." });
  if (play.linkedAthleteId(user) === target.id) {
    return res.status(400).json({ error: "Provoca o outro, não tu mesmo." });
  }
  if (!text) return res.status(400).json({ error: "Manda o recado curto." });
  const row = {
    id: newId("poke"),
    fromId: user.id,
    fromName: user.name,
    fromIcon: user.icon || "",
    toAthleteId: target.id,
    toName: target.name,
    text,
    createdAt: nowIso(),
  };
  await store.mutate((data) => {
    data.provocas.push(row);
    if (data.provocas.length > 200) data.provocas = data.provocas.slice(-200);
  });
  broadcastState();
  res.status(201).json({ provoca: row });
});

app.post("/api/palpite", requireAthlete, async (req, res) => {
  const user = req.poster;
  if (store.isMuted(user.id)) return res.status(403).json({ error: "Você está no banco." });
  if (!store.data.predictions.open) {
    return res.status(400).json({ error: "Janela de palpite fechada." });
  }
  const up = cleanText(req.body?.upAthleteId, 64);
  const down = cleanText(req.body?.downAthleteId, 64);
  if (!findAthlete(up) || !findAthlete(down)) {
    return res.status(400).json({ error: "Escolhe quem sobe e quem desce." });
  }
  if (up === down) {
    return res.status(400).json({ error: "Sobe e desce têm que ser atletas diferentes." });
  }
  await store.mutate((data) => {
    data.predictions.votes[user.id] = {
      up,
      down,
      name: user.name,
      at: nowIso(),
    };
  });
  broadcastState();
  res.json({ ok: true, predictions: predictionsView(user) });
});

app.post("/api/checkin", requireAthlete, async (req, res) => {
  const user = req.poster;
  const row = await store.mutate((data) => play.applyCheckin(data, user));
  broadcastState();
  res.json({ checkin: row });
});

app.post("/api/challenge/join", requireAthlete, async (req, res) => {
  const user = req.poster;
  if (store.isMuted(user.id)) return res.status(403).json({ error: "Você está no banco." });
  if (!store.data.challenge || !store.data.challenge.open) {
    return res.status(400).json({ error: "Sem desafio aberto." });
  }
  await store.mutate((data) => {
    if (!data.challenge.participants.some((p) => p.userId === user.id)) {
      data.challenge.participants.push({
        userId: user.id,
        name: user.name,
        icon: user.icon || "",
        at: nowIso(),
      });
    }
  });
  broadcastState();
  res.json({ challenge: store.data.challenge });
});

app.post("/api/poll/vote", requireAthlete, async (req, res) => {
  const user = req.poster;
  if (store.isMuted(user.id)) return res.status(403).json({ error: "Você está no banco." });
  const poll = store.data.poll;
  if (!poll || !poll.open) return res.status(400).json({ error: "Enquete fechada." });
  const optionId = cleanText(req.body?.optionId, 64);
  if (!poll.options.some((o) => o.id === optionId)) {
    return res.status(400).json({ error: "Opção inválida." });
  }
  await store.mutate((data) => {
    data.poll.votes[user.id] = optionId;
  });
  broadcastState();
  res.json({ poll: play.pollView(store.data.poll) });
});

app.post("/api/rival", requireAthlete, async (req, res) => {
  const user = req.poster;
  const athleteId = cleanText(req.body?.athleteId, 64);
  const target = findAthlete(athleteId);
  if (!target) return res.status(400).json({ error: "Escolhe um alvo do ranking." });
  if (play.linkedAthleteId(user) === target.id) {
    return res.status(400).json({ error: "Rival é o outro. Escolhe alguém da fila." });
  }
  await store.mutate((data) => {
    data.rivals[user.id] = { targetAthleteId: target.id, at: nowIso() };
  });
  broadcastState();
  res.json({ rival: rivalView(user) });
});

app.post("/api/week-podium/vote", requireAthlete, async (req, res) => {
  const user = req.poster;
  if (store.isMuted(user.id)) return res.status(403).json({ error: "Você está no banco." });
  if (!store.data.weekPodium.open) {
    return res.status(400).json({ error: "Votação da semana fechada." });
  }
  const athleteId = cleanText(req.body?.athleteId, 64);
  const target = findAthlete(athleteId);
  if (!target) return res.status(400).json({ error: "Escolhe um atleta." });
  await store.mutate((data) => {
    data.weekPodium.votes[user.id] = {
      athleteId: target.id,
      name: user.name,
      at: nowIso(),
    };
  });
  broadcastState();
  res.json({ weekPodium: weekPodiumView(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const admin = Boolean(req.session?.admin);
  req.session.destroy(() => {
    res.clearCookie("c88.sid");
    res.json({ ok: true, admin });
  });
});

app.get("/api/auth/dev/identities", (_req, res) => {
  if (googleConfigured()) {
    return res.status(404).json({ error: "Modo DEV desligado — use o Google." });
  }
  res.json({
    identities: rankingPayload().map((a) => ({
      id: `dev:${a.id}`,
      athleteId: a.id,
      name: a.name,
      nickname: a.nickname,
      icon: a.icon,
    })),
  });
});

app.post("/api/auth/dev/login", (req, res) => {
  if (googleConfigured()) {
    return res.status(400).json({ error: "OAuth do Google está ativo. Use Entrar com Google." });
  }
  const athleteId = cleanText(req.body?.athleteId, 64);
  const athlete = findAthlete(athleteId);
  if (!athlete) {
    return res.status(400).json({ error: "Escolhe um atleta da lista." });
  }
  req.session.admin = false;
  req.session.user = {
    id: `dev:${athlete.id}`,
    name: athlete.name,
    nickname: athlete.nickname,
    avatar: "",
    icon: athlete.icon,
    type: "athlete",
    linkedAthleteId: athlete.id,
  };
  req.session.save(() => {
    res.json({ user: currentUser(req) });
  });
});

app.get("/auth/google", (req, res) => {
  if (!googleConfigured()) {
    return res.redirect("/?auth=dev");
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/auth/google/callback", async (req, res) => {
  if (!googleConfigured()) {
    return res.redirect("/?auth=dev");
  }
  const code = req.query.code;
  if (!code) {
    return res.redirect("/?auth=denied");
  }
  try {
    const tokenBody = new URLSearchParams({
      code: String(code),
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(req),
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.warn("Google token exchange failed:", tokens.error || tokens);
      return res.redirect("/?auth=error");
    }
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profile.sub) {
      return res.redirect("/?auth=error");
    }
    req.session.admin = false;
    req.session.user = {
      id: `google:${profile.sub}`,
      name: profile.name || profile.email || "Atleta",
      nickname: "",
      avatar: profile.picture || "",
      icon: "",
      email: profile.email || "",
      type: "athlete",
      linkedAthleteId: null,
    };
    req.session.save(() => res.redirect("/#mural"));
  } catch {
    res.redirect("/?auth=error");
  }
});

app.post("/api/admin/login", (req, res) => {
  if (!adminConfigured()) {
    return res.status(503).json({
      error: "Painel sem ADMIN_USER e ADMIN_PASS no ambiente. Defina as variáveis e reinicie o servidor.",
    });
  }
  const user = String(req.body?.user ?? "");
  const pass = String(req.body?.pass ?? "");
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    return res.status(401).json({ error: "Usuário ou senha errados, irmão." });
  }
  req.session.user = null;
  req.session.admin = {
    name: "COMPLEXO 88",
    at: nowIso(),
  };
  req.session.save(() => {
    res.json({ ok: true, user: currentUser(req) });
  });
});

app.get("/api/admin/me", (req, res) => {
  if (!req.session?.admin) {
    return res.status(401).json({ error: "Não autenticado." });
  }
  res.json({ user: currentUser(req) });
});

app.get("/api/admin/state", requireAdmin, (_req, res) => {
  res.json(adminState());
});

app.put("/api/admin/ranking", requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const current = store.ranking();
  if (!ids.length || ids.length !== current.length) {
    return res.status(400).json({ error: "Ordem incompleta." });
  }
  const known = new Set(current.map((a) => a.id));
  if (ids.some((id) => !known.has(id))) {
    return res.status(400).json({ error: "Atleta desconhecido na ordem." });
  }
  const before = current.map((a) => ({ id: a.id, name: a.name, icon: a.icon, order: a.order }));
  await store.mutate((data) => {
    const byId = new Map(data.athletes.map((a) => [a.id, a]));
    data.athletes = ids.map((id, index) => ({
      ...byId.get(id),
      order: index + 1,
    }));
    const after = [...data.athletes].sort((a, b) => a.order - b.order);
    const newFirst = after[0];
    const oldFirst = before[0];
    play.recordNumberOne(data, newFirst, {
      incrementReigns: Boolean(oldFirst && newFirst && oldFirst.id !== newFirst.id),
      nowIso,
    });
    if (data.predictions.open || !data.predictions.revealed) {
      data.predictions.actual = play.computeActualMoves(before, after);
      data.predictions.revealed = true;
      data.predictions.open = false;
    }
  });
  const after = rankingPayload();
  const newcomers = play.enteredTop3(before, after);
  broadcastState({ enteredTop3: newcomers, ranking: after });
  res.json({ ranking: after, enteredTop3: newcomers });
});

app.post("/api/admin/athletes", requireAdmin, async (req, res) => {
  const name = cleanText(req.body?.name, 40);
  const nickname = cleanText(req.body?.nickname, 40);
  const icon = takeIcon(req.body?.icon) || firstEmoji(req.body?.icon) || "⚡";
  if (!name) {
    return res.status(400).json({ error: "Nome é obrigatório." });
  }
  const idBase = slugify(name) || newId("atl");
  let id = idBase;
  await store.mutate((data) => {
    let n = 2;
    const used = new Set(data.athletes.map((a) => a.id));
    while (used.has(id)) {
      id = `${idBase}-${n}`;
      n += 1;
    }
    data.athletes.push({
      id,
      name,
      nickname,
      icon,
      createdAt: nowIso(),
      order: data.athletes.length + 1,
    });
  });
  broadcastState();
  res.status(201).json({ ranking: rankingPayload() });
});

app.put("/api/admin/athletes/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const name = cleanText(req.body?.name, 40);
  const nickname = cleanText(req.body?.nickname, 40);
  const icon = takeIcon(req.body?.icon);
  if (!name) {
    return res.status(400).json({ error: "Nome é obrigatório." });
  }
  const found = await store.mutate((data) => {
    const athlete = data.athletes.find((a) => a.id === id);
    if (!athlete) return false;
    athlete.name = name;
    athlete.nickname = nickname;
    if (icon) athlete.icon = icon;
    const hall = data.hallOfFame.find((h) => h.athleteId === id);
    if (hall) {
      hall.name = name;
      hall.nickname = nickname;
      if (icon) hall.icon = icon;
    }
    return true;
  });
  if (!found) {
    return res.status(404).json({ error: "Atleta não encontrado." });
  }
  broadcastState();
  res.json({ ranking: rankingPayload() });
});

app.delete("/api/admin/athletes/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const found = await store.mutate((data) => {
    const before = data.athletes.length;
    data.athletes = data.athletes.filter((a) => a.id !== id);
    data.athletes.forEach((a, index) => {
      a.order = index + 1;
    });
    return data.athletes.length !== before;
  });
  if (!found) {
    return res.status(404).json({ error: "Atleta não encontrado." });
  }
  broadcastState();
  res.json({ ranking: rankingPayload() });
});

app.post("/api/admin/chat", requireAdmin, async (req, res) => {
  const text = cleanText(req.body?.text, 400);
  if (!text) {
    return res.status(400).json({ error: "Escreve o recado do box." });
  }
  const message = {
    id: newId("msg"),
    authorId: "complexo",
    authorName: "COMPLEXO 88",
    authorNickname: "Box",
    authorAvatar: "/img/c88.svg",
    authorType: "complexo",
    icon: "⚡",
    text,
    hidden: false,
    reactions: { "🔥": [], "💪": [], "😂": [], "👀": [] },
    createdAt: nowIso(),
  };
  await store.mutate((data) => {
    data.messages.push(message);
  });
  broadcastState();
  res.status(201).json({ message: messageView(message) });
});

app.delete("/api/admin/chat/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  await store.mutate((data) => {
    data.messages = data.messages.filter((m) => m.id !== id);
    if (data.pinnedMessageId === id) data.pinnedMessageId = null;
  });
  broadcastState();
  res.json({ ok: true });
});

app.post("/api/admin/chat/:id/hide", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const hidden = req.body?.hidden !== false;
  await store.mutate((data) => {
    const message = data.messages.find((m) => m.id === id);
    if (message) message.hidden = hidden;
    if (hidden && data.pinnedMessageId === id) data.pinnedMessageId = null;
  });
  broadcastState();
  res.json({ ok: true });
});

app.post("/api/admin/chat/:id/pin", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  await store.mutate((data) => {
    const message = data.messages.find((m) => m.id === id);
    if (!message) return;
    data.pinnedMessageId = data.pinnedMessageId === id ? null : id;
  });
  broadcastState();
  res.json({ pinnedMessageId: store.data.pinnedMessageId });
});

app.post("/api/admin/mute", requireAdmin, async (req, res) => {
  const userId = cleanText(req.body?.userId, 80);
  const name = cleanText(req.body?.name, 60);
  if (!userId) {
    return res.status(400).json({ error: "userId obrigatório." });
  }
  await store.mutate((data) => {
    if (!data.muted.some((m) => m.userId === userId)) {
      data.muted.push({ userId, name, at: nowIso() });
    }
  });
  broadcastState();
  res.json({ muted: store.data.muted });
});

app.post("/api/admin/unmute", requireAdmin, async (req, res) => {
  const userId = cleanText(req.body?.userId, 80);
  await store.mutate((data) => {
    data.muted = data.muted.filter((m) => m.userId !== userId);
  });
  broadcastState();
  res.json({ muted: store.data.muted });
});

app.post("/api/admin/palpite/open", requireAdmin, async (_req, res) => {
  await store.mutate((data) => {
    data.predictions = { open: true, revealed: false, votes: {}, actual: null };
  });
  broadcastState();
  res.json({ predictions: predictionsView({ isAdmin: true }) });
});

app.post("/api/admin/palpite/reveal", requireAdmin, async (_req, res) => {
  await store.mutate((data) => {
    data.predictions.revealed = true;
    data.predictions.open = false;
  });
  broadcastState();
  res.json({ predictions: predictionsView({ isAdmin: true }) });
});

app.post("/api/admin/week-podium/open", requireAdmin, async (_req, res) => {
  await store.mutate((data) => {
    data.weekPodium.open = true;
  });
  broadcastState();
  res.json({ weekPodium: weekPodiumView({ isAdmin: true }) });
});

app.post("/api/admin/week-podium/close", requireAdmin, async (_req, res) => {
  await store.mutate((data) => {
    data.weekPodium.open = false;
  });
  broadcastState();
  res.json({ weekPodium: weekPodiumView({ isAdmin: true }) });
});

app.post("/api/admin/week-podium/reset", requireAdmin, async (_req, res) => {
  await store.mutate((data) => {
    data.weekPodium = { open: true, weekKey: play.isoWeekKey(), votes: {} };
  });
  broadcastState();
  res.json({ weekPodium: weekPodiumView({ isAdmin: true }) });
});

app.post("/api/admin/challenge", requireAdmin, async (req, res) => {
  const title = cleanText(req.body?.title, 80);
  const wod = cleanText(req.body?.wod, 400);
  if (!title || !wod) {
    return res.status(400).json({ error: "Manda o título e o WOD da semana." });
  }
  await store.mutate((data) => {
    data.challenge = {
      id: newId("wod"),
      title,
      wod,
      open: true,
      createdAt: nowIso(),
      participants: [],
    };
  });
  broadcastState();
  res.json({ challenge: store.data.challenge });
});

app.post("/api/admin/challenge/close", requireAdmin, async (_req, res) => {
  await store.mutate((data) => {
    if (data.challenge) data.challenge.open = false;
  });
  broadcastState();
  res.json({ challenge: store.data.challenge });
});

app.post("/api/admin/poll", requireAdmin, async (req, res) => {
  const question = cleanText(req.body?.question, 120);
  const raw = Array.isArray(req.body?.options) ? req.body.options : [];
  const options = raw.map((o) => cleanText(o, 40)).filter(Boolean).slice(0, 4);
  if (!question || options.length < 2) {
    return res.status(400).json({ error: "Pergunta e pelo menos 2 opções." });
  }
  await store.mutate((data) => {
    data.poll = {
      id: newId("poll"),
      question,
      open: true,
      options: options.map((text, i) => ({ id: `opt${i + 1}`, text })),
      votes: {},
    };
  });
  broadcastState();
  res.json({ poll: play.pollView(store.data.poll) });
});

app.post("/api/admin/poll/close", requireAdmin, async (_req, res) => {
  await store.mutate((data) => {
    if (data.poll) data.poll.open = false;
  });
  broadcastState();
  res.json({ poll: play.pollView(store.data.poll) });
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  sockets.add(ws);
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("close", () => sockets.delete(ws));
  ws.send(
    JSON.stringify({
      type: "hello",
      payload: publicState(),
      at: Date.now(),
    })
  );
});

const pingTimer = setInterval(() => {
  for (const ws of sockets) {
    if (!ws.isAlive) {
      ws.terminate();
      sockets.delete(ws);
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

function shutdown() {
  clearInterval(pingTimer);
  wss.close();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(PORT, "0.0.0.0", () => {
  const publicUrl = RENDER_URL || `http://127.0.0.1:${PORT}`;
  console.log(`Complexo 88 Hyrox ranking em ${publicUrl}`);
  console.log(`Admin: ${publicUrl}/admin`);
  if (!adminConfigured()) {
    console.error("ADMIN_USER e ADMIN_PASS ausentes. Login do /admin recusado até definir no ambiente.");
  }
  console.log(googleConfigured() ? "Google OAuth: ativo" : "Google OAuth: ausente — mural em MODO DEV");
  if (ON_RENDER) {
    console.log("Render free: disco efêmero. data/store.json some no redeploy; o seed volta no próximo boot se o arquivo não existir.");
  }
  if (
    SESSION_SECRET === "c88-dev-session-secret" &&
    (ON_RENDER || process.env.NODE_ENV === "production")
  ) {
    console.warn("SESSION_SECRET ainda é o padrão. Defina um segredo no painel da Render.");
  }
});
