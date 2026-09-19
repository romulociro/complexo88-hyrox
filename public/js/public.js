(() => {
  const { api, toast, escapeHtml, rankClass, rankPlace, prefersReducedMotion, formatWhen, formatToday, connectLive } = window.C88;
  const REACTIONS = ["🔥", "💪", "😂", "👀"];

  const rankingEl = document.getElementById("ranking");
  const podiumEl = document.getElementById("podium");
  const rankingStatus = document.getElementById("ranking-status");
  const rankingUpdated = document.getElementById("ranking-updated");
  const chatList = document.getElementById("chat-list");
  const chatStatus = document.getElementById("chat-status");
  const authBox = document.getElementById("auth-box");
  const chatForm = document.getElementById("chat-form");
  const chatText = document.getElementById("chat-text");
  const who = document.getElementById("who");
  const logoutBtn = document.getElementById("logout-btn");
  const weekdayEl = document.getElementById("weekday");
  const todayEl = document.getElementById("today");
  const athleteDock = document.getElementById("athlete-dock");
  const streakLine = document.getElementById("streak-line");
  const checkinBtn = document.getElementById("checkin-btn");
  const checkinsToday = document.getElementById("checkins-today");
  const provocaTarget = document.getElementById("provoca-target");
  const provocaText = document.getElementById("provoca-text");
  const rivalTarget = document.getElementById("rival-target");
  const rivalLine = document.getElementById("rival-line");
  const inboxEl = document.getElementById("inbox");

  let me = null;
  let muted = false;
  let state = {
    ranking: [],
    messages: [],
    hallOfFame: [],
    weekPodium: null,
    challenge: null,
    predictions: null,
    poll: null,
    provocas: [],
    inbox: [],
    checkinsToday: [],
    rival: null,
  };
  let lastTop3 = [];

  const date = formatToday();
  if (weekdayEl) weekdayEl.textContent = date.weekday;
  if (todayEl) todayEl.textContent = date.day;

  function athleteOptions(select, selected) {
    select.innerHTML = `<option value="">ESCOLHE O ATLETA</option>` +
      state.ranking
        .map(
          (a) =>
            `<option value="${escapeHtml(a.id)}" ${a.id === selected ? "selected" : ""}>${escapeHtml(a.name)} — ${escapeHtml(a.nickname || "")}</option>`
        )
        .join("");
  }

  function streakBadge(a) {
    if (!a.streak) return "";
    const hot = a.trainedToday ? "streak on" : "streak";
    return `<span class="${hot}" title="Sequência de treino">🔥 ${a.streak}</span>`;
  }

  function renderRanking(athletes) {
    if (!Array.isArray(athletes) || !athletes.length) {
      rankingStatus.hidden = false;
      rankingStatus.className = "empty";
      rankingStatus.textContent = "Ainda não tem atleta no grid. O Complexo solta o ranking em breve.";
      rankingEl.innerHTML = "";
      podiumEl.innerHTML = "";
      rankingEl.setAttribute("aria-busy", "false");
      return;
    }
    rankingStatus.hidden = true;
    rankingEl.setAttribute("aria-busy", "false");
    const top = athletes.slice(0, 3);
    podiumEl.innerHTML = top
      .map((a) => {
        const klass = rankClass(a.rank);
        const place = rankPlace(a.rank);
        return `<article class="podium-card ${klass}">
          <div class="rank-sq ${klass}" aria-hidden="true">${a.rank}</div>
          <h3 class="athlete-name">${escapeHtml(a.name.toUpperCase())} <span class="rank-icon">${escapeHtml(a.icon)}</span></h3>
          <p class="athlete-nick">${escapeHtml(a.nickname || "SEM APELIDO")} ${streakBadge(a)}</p>
          <p class="rank-place">${escapeHtml(place)}</p>
        </article>`;
      })
      .join("");
    rankingEl.innerHTML = athletes
      .slice(3)
      .map((a) => {
        const klass = rankClass(a.rank);
        const place = rankPlace(a.rank);
        return `<li class="rank-row ${klass}">
          <span class="rank-sq ${klass}" aria-hidden="true">${a.rank}</span>
          <div class="rank-main">
            <p class="athlete-name">${escapeHtml(a.name.toUpperCase())} <span class="rank-icon">${escapeHtml(a.icon)}</span> ${streakBadge(a)}</p>
            <p class="athlete-nick">${escapeHtml(a.nickname || "SEM APELIDO")}</p>
            <p class="rank-place">${escapeHtml(place)}</p>
          </div>
        </li>`;
      })
      .join("");
  }

  function initials(name) {
    return escapeHtml(String(name || "C").trim().charAt(0).toUpperCase());
  }

  function renderChat(messages) {
    if (!Array.isArray(messages) || !messages.length) {
      chatStatus.hidden = false;
      chatStatus.className = "empty";
      chatStatus.textContent = "Mural limpo. Manda o primeiro recado da galera.";
      chatList.innerHTML = "";
      return;
    }
    chatStatus.hidden = true;
    const pinned = messages.filter((m) => m.pinned);
    const rest = messages.filter((m) => !m.pinned).slice().reverse();
    const ordered = [...pinned, ...rest];
    chatList.innerHTML = ordered
      .map((m) => {
        const avatar = m.authorAvatar
          ? `<img class="avatar" src="${escapeHtml(m.authorAvatar)}" alt="">`
          : `<span class="avatar fallback">${m.icon ? escapeHtml(m.icon) : initials(m.authorName)}</span>`;
        const badge = m.authorType === "complexo" ? `<span class="badge">BOX</span>` : "";
        const pin = m.pinned ? `<span class="badge">FIXADO</span>` : "";
        const nick = m.authorNickname ? ` — ${escapeHtml(m.authorNickname)}` : "";
        const reacts = REACTIONS.map((emoji) => {
          const pack = (m.reactions && m.reactions[emoji]) || { count: 0, users: [] };
          const mine = me && pack.users && pack.users.includes(me.id);
          return `<button type="button" class="react-btn ${mine ? "mine" : ""}" data-react="${escapeHtml(m.id)}" data-emoji="${emoji}" aria-pressed="${mine ? "true" : "false"}">${emoji} ${pack.count || ""}</button>`;
        }).join("");
        return `<li class="chat-item ${m.pinned ? "pinned" : ""}">
          <div class="chat-meta">
            ${avatar}
            <span class="chat-author">${escapeHtml(m.authorName)}${nick}</span>
            ${badge}${pin}
            <span class="chat-time">${escapeHtml(formatWhen(m.createdAt))}</span>
          </div>
          <p class="chat-text">${escapeHtml(m.text)}</p>
          <div class="reacts">${reacts}</div>
        </li>`;
      })
      .join("");
    chatList.scrollTop = 0;
  }

  function renderAuth(config) {
    const athlete = me && !me.isAdmin;
    athleteDock.hidden = !athlete;
    if (me) {
      authBox.innerHTML = "";
      chatForm.hidden = muted;
      who.textContent = muted
        ? `${me.name} está no banco. Fala com o Complexo.`
        : `Postando como ${me.name}${me.nickname ? ` — ${me.nickname}` : ""}`;
      logoutBtn.hidden = false;
      return;
    }
    chatForm.hidden = true;
    logoutBtn.hidden = true;
    who.textContent = "";
    if (config.googleOAuth) {
      authBox.innerHTML = `
        <p class="section-sub">Entra com Google pra postar com teu nome e foto.</p>
        <div class="actions" style="margin-top:8px">
          <a class="btn" href="/auth/google">ENTRAR COM GOOGLE</a>
        </div>`;
      return;
    }
    authBox.innerHTML = `
      <p class="section-sub">MODO DEV: OAuth do Google não está configurado. Escolhe um atleta pra demo local.</p>
      <div class="dev-grid" id="dev-grid"></div>`;
    loadDevIdentities();
  }

  function renderHall(list) {
    const el = document.getElementById("hall");
    if (!list || !list.length) {
      el.innerHTML = `<li class="empty">Ainda sem rei. Quem chega ao #1 oficial entra pra história.</li>`;
      return;
    }
    el.innerHTML = list
      .map(
        (h) => `<li class="rank-row">
          <span class="rank-sq gold">#1</span>
          <div class="rank-main">
            <p class="athlete-name">${escapeHtml((h.name || "").toUpperCase())} <span class="rank-icon">${escapeHtml(h.icon)}</span></p>
            <p class="athlete-nick">${escapeHtml(h.nickname || "")} • ${h.reigns || 1} VEZ(ES) NO TOPO</p>
          </div>
        </li>`
      )
      .join("");
  }

  function renderWeek(week) {
    const el = document.getElementById("week-podium");
    if (!week) {
      el.innerHTML = `<p class="empty">Sem votação ainda.</p>`;
      return;
    }
    const canVote = Boolean(me && !me.isAdmin && week.open && !muted);
    const podium = (week.podium || []).slice(0, 3);
    const board = week.board || [];
    const top = podium.length
      ? `<div class="podium mini">${podium
          .map((a, i) => {
            const klass = rankClass(i + 1);
            return `<article class="podium-card ${klass}">
              <div class="rank-sq ${klass}">${i + 1}</div>
              <h3 class="athlete-name">${escapeHtml(a.name.toUpperCase())} ${escapeHtml(a.icon)}</h3>
              <p class="athlete-nick">${a.votes} VOTO(S)</p>
            </article>`;
          })
          .join("")}</div>`
      : `<p class="empty">Ainda sem votos. A galera escolhe o pódio da semana.</p>`;
    const picks = canVote
      ? `<div class="vote-grid">${board
          .map(
            (a) => `<button type="button" class="dev-chip ${week.mine && week.mine.athleteId === a.id ? "picked" : ""}" data-week="${escapeHtml(a.id)}" aria-pressed="${week.mine && week.mine.athleteId === a.id ? "true" : "false"}">
              <span>${escapeHtml(a.icon)}</span><span>${escapeHtml(a.name)}</span>
            </button>`
          )
          .join("")}</div>`
      : week.open
        ? `<p class="tiny">Entra como atleta pra votar no pódio da semana.</p>`
        : `<p class="tiny">Votação fechada pelo Complexo. Semana ${escapeHtml(week.weekKey)}.</p>`;
    el.innerHTML = `${top}<p class="tiny">${week.total || 0} voto(s) • ${escapeHtml(week.weekKey)}</p>${picks}`;
  }

  function renderChallenge(ch) {
    const el = document.getElementById("challenge");
    if (!ch) {
      el.innerHTML = `<p class="empty">O Complexo ainda não soltou o WOD da semana.</p>`;
      return;
    }
    const people = (ch.participants || [])
      .map((p) => `${escapeHtml(p.icon || "")} ${escapeHtml(p.name)}`)
      .join(" • ");
    const joined = me && (ch.participants || []).some((p) => p.userId === me.id);
    const btn =
      me && !me.isAdmin && ch.open && !joined
        ? `<button class="btn" type="button" id="join-challenge">TÔ DENTRO</button>`
        : "";
    el.innerHTML = `
      <h3 class="athlete-name">${escapeHtml(ch.title.toUpperCase())}</h3>
      <p class="chat-text">${escapeHtml(ch.wod)}</p>
      <p class="tiny">${ch.open ? "ABERTO" : "ENCERRADO"} • ${(ch.participants || []).length} dentro</p>
      <p class="tiny">${people || "Ninguém ainda."}</p>
      ${btn}`;
  }

  function athleteName(id) {
    const a = state.ranking.find((x) => x.id === id);
    return a ? `${a.name} ${a.icon}` : id;
  }

  function renderPalpite(p) {
    const el = document.getElementById("palpite");
    if (!p) {
      el.innerHTML = `<p class="empty">Sem rodada de palpite.</p>`;
      return;
    }
    let body = "";
    if (p.open && me && !me.isAdmin) {
      body = `<form id="palpite-form" class="stack">
        <label class="tiny">QUEM SOBE</label>
        <select id="palpite-up"></select>
        <label class="tiny">QUEM DESCE</label>
        <select id="palpite-down"></select>
        <button class="btn" type="submit">MANDAR PALPITE</button>
      </form>`;
    } else if (p.open) {
      body = `<p class="tiny">Entra como atleta pra palpitar antes do Complexo atualizar o ranking oficial.</p>`;
    }
    if (p.revealed && p.tallies) {
      const ups = Object.entries(p.tallies.up || {})
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${escapeHtml(athleteName(id))} (${n})`)
        .join(" • ");
      const downs = Object.entries(p.tallies.down || {})
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${escapeHtml(athleteName(id))} (${n})`)
        .join(" • ");
      body += `<p class="tiny">A GALERA ACHOU QUE SOBE: ${ups || "—"}</p>
        <p class="tiny">A GALERA ACHOU QUE DESCE: ${downs || "—"}</p>`;
      if (p.actual) {
        body += `<p class="tiny">O QUE DEU: subiu ${p.actual.up.map(athleteName).map(escapeHtml).join(", ") || "ninguém"} • desceu ${p.actual.down.map(athleteName).map(escapeHtml).join(", ") || "ninguém"}</p>`;
      }
    } else if (!p.open) {
      body += `<p class="tiny">${p.total || 0} palpite(s) na urna. O Complexo ainda não revelou.</p>`;
    } else {
      body += `<p class="tiny">${p.total || 0} palpite(s) até agora. Resultado só depois da atualização ou do reveal.</p>`;
    }
    el.innerHTML = body;
    const up = document.getElementById("palpite-up");
    const down = document.getElementById("palpite-down");
    if (up && down) {
      athleteOptions(up, p.mine && p.mine.up);
      athleteOptions(down, p.mine && p.mine.down);
    }
  }

  function renderPoll(poll) {
    const el = document.getElementById("poll");
    if (!poll) {
      el.innerHTML = `<p class="empty">Sem enquete no momento.</p>`;
      return;
    }
    const total = poll.total || 0;
    const options = poll.options
      .map((o) => {
        const pct = total ? Math.round((o.count / total) * 100) : 0;
        const can = me && !me.isAdmin && poll.open && !muted;
        const mine = poll.mine === o.id;
        return `<button type="button" class="poll-opt ${mine ? "mine" : ""}" data-opt="${escapeHtml(o.id)}" ${can ? "" : "disabled"} aria-pressed="${mine ? "true" : "false"}">
          <span>${escapeHtml(o.text)}</span>
          <span class="tiny">${o.count} • ${pct}%</span>
          <i style="width:${pct}%"></i>
        </button>`;
      })
      .join("");
    el.innerHTML = `<h3 class="athlete-name">${escapeHtml(poll.question.toUpperCase())}</h3>
      <p class="tiny">${poll.open ? "ABERTA" : "ENCERRADA"} • ${total} voto(s)</p>
      <div class="stack">${options}</div>`;
  }

  function renderPokes(list) {
    const el = document.getElementById("pokes");
    if (!list || !list.length) {
      el.innerHTML = `<li class="empty">Ninguém provocou ainda. Manda a primeira.</li>`;
      return;
    }
    el.innerHTML = list
      .map(
        (p) => `<li class="chat-item">
          <p class="chat-text"><strong>${escapeHtml(p.fromName)}</strong> → <strong>${escapeHtml(p.toName)}</strong>: ${escapeHtml(p.text)}</p>
          <p class="tiny">${escapeHtml(formatWhen(p.createdAt))}</p>
        </li>`
      )
      .join("");
  }

  function renderDock() {
    if (!me || me.isAdmin) {
      athleteDock.hidden = true;
      return;
    }
    athleteDock.hidden = false;
    const mine = state.ranking.find((a) => a.id === me.linkedAthleteId);
    const streak = mine ? mine.streak : 0;
    streakLine.textContent = mine
      ? `${mine.name}: sequência de ${streak} dia(s)${mine.trainedToday ? " • treinou hoje" : ""}`
      : "Marca o treino. No modo Google o streak fica no teu nome; no DEV ele cola no atleta.";
    checkinBtn.disabled = Boolean(mine && mine.trainedToday);
    checkinBtn.textContent = mine && mine.trainedToday ? "JÁ MARCOU HOJE" : "TREINEI HOJE";
    checkinsToday.textContent = (state.checkinsToday || []).length
      ? `Hoje: ${state.checkinsToday.map((c) => c.name).join(", ")}`
      : "Ninguém marcou ainda hoje.";
    athleteOptions(provocaTarget, "");
    athleteOptions(rivalTarget, state.rival && state.rival.target ? state.rival.target.id : "");
    if (state.rival && state.rival.headToHead && state.rival.headToHead.target) {
      const h = state.rival.headToHead;
      if (h.me) {
        const verb = h.gap === 0 ? "empatado com" : h.gap > 0 ? `${h.gap} posição(ões) atrás de` : `${Math.abs(h.gap)} posição(ões) na frente de`;
        rivalLine.textContent = `#${h.me.rank} ${h.me.name} está ${verb} #${h.target.rank} ${h.target.name}`;
      } else {
        rivalLine.textContent = `Alvo: #${h.target.rank} ${h.target.name}. Entra como atleta do grid pra ver o mano a mano.`;
      }
    } else {
      rivalLine.textContent = "Escolhe um alvo no ranking oficial.";
    }
    if (state.inbox && state.inbox.length) {
      inboxEl.innerHTML =
        `<h3 class="mini-title">CHEGOU PRA VOCÊ</h3>` +
        state.inbox
          .slice()
          .reverse()
          .map(
            (p) => `<p class="chat-text">${escapeHtml(p.fromName)}: ${escapeHtml(p.text)} <span class="tiny">${escapeHtml(formatWhen(p.createdAt))}</span></p>`
          )
          .join("");
    } else {
      inboxEl.innerHTML = "";
    }
  }

  function applyState(next, extras = {}) {
    state = { ...state, ...next };
    renderRanking(state.ranking);
    renderChat(state.messages);
    renderHall(state.hallOfFame);
    renderWeek(state.weekPodium);
    renderChallenge(state.challenge);
    renderPalpite(state.predictions);
    renderPoll(state.poll);
    renderPokes(state.provocas);
    renderDock();
    rankingUpdated.textContent = "OFICIAL • AO VIVO";
    const newcomers = extras.enteredTop3 || next.enteredTop3;
    if (Array.isArray(newcomers) && newcomers.length) {
      celebrate(newcomers);
    } else if (lastTop3.length) {
      const old = new Set(lastTop3);
      const fresh = (state.ranking || []).slice(0, 3).filter((a) => !old.has(a.id));
      if (fresh.length) celebrate(fresh);
    }
    lastTop3 = (state.ranking || []).slice(0, 3).map((a) => a.id);
  }

  function celebrate(athletes) {
    const names = athletes.map((a) => `${a.name} ${a.icon || ""}`.trim()).join(" • ");
    const banner = document.getElementById("celebrate");
    banner.hidden = false;
    banner.textContent = `PÓDIO OFICIAL • ${names.toUpperCase()}`;
    const box = document.getElementById("confetti");
    if (!prefersReducedMotion()) {
      box.hidden = false;
      box.innerHTML = "";
      for (let i = 0; i < 48; i += 1) {
        const bit = document.createElement("i");
        bit.style.left = `${Math.random() * 100}%`;
        bit.style.animationDelay = `${Math.random() * 0.8}s`;
        bit.style.animationDuration = `${1.6 + Math.random()}s`;
        box.appendChild(bit);
      }
    }
    toast(`${names} entrou no pódio oficial`);
    setTimeout(() => {
      banner.hidden = true;
      box.hidden = true;
      box.innerHTML = "";
    }, 3200);
  }

  async function loadDevIdentities() {
    try {
      const data = await api("/api/auth/dev/identities");
      const grid = document.getElementById("dev-grid");
      if (!grid) return;
      grid.innerHTML = data.identities
        .map(
          (a) => `<button class="dev-chip" type="button" data-id="${escapeHtml(a.athleteId)}">
            <span>${escapeHtml(a.icon)}</span>
            <span>${escapeHtml(a.name)}</span>
          </button>`
        )
        .join("");
    } catch (err) {
      authBox.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  authBox.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-id]");
    if (!btn) return;
    try {
      await api("/api/auth/dev/login", {
        method: "POST",
        body: JSON.stringify({ athleteId: btn.dataset.id }),
      });
      toast("Entrou. Manda o recado.");
      await boot();
    } catch (err) {
      toast(err.message);
    }
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatText.value.trim();
    if (!text) return;
    try {
      const data = await api("/api/chat", { method: "POST", body: JSON.stringify({ text }) });
      chatText.value = "";
      if (data.message) {
        const next = [...(state.messages || []).filter((m) => m.id !== data.message.id), data.message];
        applyState({ ...state, messages: next });
      } else {
        const fresh = await api("/api/state");
        applyState(fresh);
      }
    } catch (err) {
      toast(err.message);
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    toast("Saiu do mural.");
    await boot();
  });

  chatList.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-react]");
    if (!btn) return;
    if (!me || me.isAdmin) {
      toast("Entra como atleta pra reagir.");
      return;
    }
    try {
      await api(`/api/chat/${encodeURIComponent(btn.dataset.react)}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji: btn.dataset.emoji }),
      });
    } catch (err) {
      toast(err.message);
    }
  });

  checkinBtn.addEventListener("click", async () => {
    try {
      const data = await api("/api/checkin", { method: "POST", body: "{}" });
      toast(data.checkin.already ? "Já estava marcado hoje." : `Sequência: ${data.checkin.streak}`);
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("provoca-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/provoca", {
        method: "POST",
        body: JSON.stringify({ toAthleteId: provocaTarget.value, text: provocaText.value }),
      });
      provocaText.value = "";
      toast("Provocação enviada.");
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("rival-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/rival", {
        method: "POST",
        body: JSON.stringify({ athleteId: rivalTarget.value }),
      });
      toast("Alvo marcado.");
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("week-podium").addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-week]");
    if (!btn) return;
    try {
      await api("/api/week-podium/vote", {
        method: "POST",
        body: JSON.stringify({ athleteId: btn.dataset.week }),
      });
      toast("Voto da semana anotado.");
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("challenge").addEventListener("click", async (event) => {
    if (!event.target.closest("#join-challenge")) return;
    try {
      await api("/api/challenge/join", { method: "POST", body: "{}" });
      toast("Tá dentro.");
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("palpite").addEventListener("submit", async (event) => {
    if (!event.target.closest("#palpite-form")) return;
    event.preventDefault();
    try {
      await api("/api/palpite", {
        method: "POST",
        body: JSON.stringify({
          upAthleteId: document.getElementById("palpite-up").value,
          downAthleteId: document.getElementById("palpite-down").value,
        }),
      });
      toast("Palpite na urna.");
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("poll").addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-opt]");
    if (!btn || btn.disabled) return;
    try {
      await api("/api/poll/vote", {
        method: "POST",
        body: JSON.stringify({ optionId: btn.dataset.opt }),
      });
      toast("Voto na enquete.");
    } catch (err) {
      toast(err.message);
    }
  });

  async function boot() {
    try {
      const [next, session] = await Promise.all([api("/api/state"), api("/api/me")]);
      me = session.user;
      muted = session.muted;
      renderAuth(session);
      applyState(next);
    } catch (err) {
      rankingStatus.hidden = false;
      rankingStatus.className = "error";
      rankingStatus.setAttribute("role", "alert");
      rankingStatus.textContent = err.message || "Não deu pra carregar o ranking. Recarrega a página.";
      chatStatus.hidden = false;
      chatStatus.className = "error";
      chatStatus.setAttribute("role", "alert");
      chatStatus.textContent = "Mural offline. Recarrega a página.";
    }
  }

  const authQ = new URLSearchParams(location.search).get("auth");
  if (authQ === "denied") toast("Login Google cancelado.");
  if (authQ === "error") toast("Não rolou o Google. Tenta de novo.");
  if (authQ) {
    const url = new URL(location.href);
    url.searchParams.delete("auth");
    history.replaceState({}, "", url.pathname + url.hash);
  }

  connectLive((msg) => {
    if (msg.type === "hello" || msg.type === "state") {
      applyState(msg.payload || {}, msg.payload || {});
      if (me) {
        api("/api/state")
          .then((next) => applyState(next, msg.payload || {}))
          .catch(() => {});
      }
    }
  });

  const params = new URLSearchParams(location.search);
  if (params.get("auth") === "denied") toast("Login Google cancelado.");
  if (params.get("auth") === "error") toast("Falha no Google OAuth.");

  boot();
})();
