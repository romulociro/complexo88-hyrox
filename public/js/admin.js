(() => {
  const { api, toast, escapeHtml, rankClass, rankPlace, formatWhen, connectLive } = window.C88;

  const loginView = document.getElementById("login-view");
  const dashView = document.getElementById("dash-view");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");
  const listEl = document.getElementById("admin-ranking");
  const rankStatus = document.getElementById("admin-rank-status");
  const chatEl = document.getElementById("admin-chat");
  const muteEl = document.getElementById("mute-list");
  const addBtn = document.getElementById("add-btn");
  const modal = document.getElementById("athlete-modal");
  const form = document.getElementById("athlete-form");
  const modalTitle = document.getElementById("modal-title");
  const idInput = document.getElementById("athlete-id");
  const nameInput = document.getElementById("athlete-name");
  const nickInput = document.getElementById("athlete-nick");
  const iconInput = document.getElementById("athlete-icon");
  const iconPreview = document.getElementById("icon-preview");
  const athleteError = document.getElementById("athlete-error");
  const cancelModal = document.getElementById("cancel-modal");
  const complexoForm = document.getElementById("complexo-form");
  const complexoText = document.getElementById("complexo-text");

  let ranking = [];
  let sortable;
  let picker;
  let dragging = false;

  function setIcon(value) {
    const icon = String(value || "").trim() || "⚡";
    iconInput.value = icon;
    iconPreview.textContent = icon;
  }

  function openModal(athlete) {
    athleteError.hidden = true;
    if (athlete) {
      modalTitle.textContent = "EDITAR ATLETA";
      idInput.value = athlete.id;
      nameInput.value = athlete.name;
      nickInput.value = athlete.nickname || "";
      setIcon(athlete.icon);
    } else {
      modalTitle.textContent = "NOVO ATLETA";
      idInput.value = "";
      nameInput.value = "";
      nickInput.value = "";
      setIcon("⚡");
    }
    modal.classList.add("open");
    nameInput.focus();
    picker?.set(iconInput.value);
  }

  function closeModal() {
    modal.classList.remove("open");
  }

  try {
    picker = window.C88Emoji?.mount(document.getElementById("emoji-picker"), {
      value: "⚡",
      onChange: setIcon,
    });
  } catch (err) {
    console.warn("emoji picker unavailable", err);
  }

  iconInput.addEventListener("input", () => setIcon(iconInput.value));
  iconInput.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") || "";
    if (text.trim()) {
      event.preventDefault();
      setIcon(text.trim());
    }
  });

  const handleSvg =
    '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="6" cy="4" r="1.5"/><circle cx="12" cy="4" r="1.5"/><circle cx="6" cy="9" r="1.5"/><circle cx="12" cy="9" r="1.5"/><circle cx="6" cy="14" r="1.5"/><circle cx="12" cy="14" r="1.5"/></svg>';

  async function persistOrder(ids, okText) {
    const data = await api("/api/admin/ranking", {
      method: "PUT",
      body: JSON.stringify({ ids }),
    });
    renderRanking(data.ranking);
    toast(okText || "Ranking atualizado ao vivo.");
    return data;
  }

  function renderRanking(items) {
    ranking = items || [];
    if (rankStatus) rankStatus.hidden = true;
    if (!ranking.length) {
      if (sortable) {
        sortable.destroy();
        sortable = null;
      }
      listEl.innerHTML = "";
      if (rankStatus) {
        rankStatus.hidden = false;
        rankStatus.className = "empty";
        rankStatus.textContent = "Nenhum atleta no ranking. Clica em + ATLETA pra começar.";
      }
      return;
    }
    listEl.innerHTML = ranking
      .map((a, index) => {
        const klass = rankClass(a.rank);
        const place = rankPlace(a.rank);
        return `<li class="admin-row" data-id="${escapeHtml(a.id)}">
          <button class="handle" type="button" aria-label="Arrastar ${escapeHtml(a.name)} para reordenar">${handleSvg}</button>
          <span class="rank-sq ${klass}" aria-hidden="true">${a.rank}</span>
          <div class="rank-main">
            <p class="athlete-name">${escapeHtml(a.name.toUpperCase())} <span class="rank-icon">${escapeHtml(a.icon)}</span></p>
            <p class="athlete-nick">${escapeHtml(a.nickname || "SEM APELIDO")}</p>
            <p class="rank-place">${escapeHtml(place)}</p>
          </div>
          <div class="tiny-actions">
            <button class="btn ghost" data-up="${escapeHtml(a.id)}" type="button" ${index === 0 ? "disabled" : ""} aria-label="Subir ${escapeHtml(a.name)}">SUBIR</button>
            <button class="btn ghost" data-down="${escapeHtml(a.id)}" type="button" ${index === ranking.length - 1 ? "disabled" : ""} aria-label="Descer ${escapeHtml(a.name)}">DESCER</button>
            <button class="btn ghost" data-edit="${escapeHtml(a.id)}" type="button">EDITAR</button>
            <button class="btn danger" data-del="${escapeHtml(a.id)}" type="button">APAGAR</button>
          </div>
        </li>`;
      })
      .join("");

    if (sortable) sortable.destroy();
    if (typeof Sortable === "undefined") {
      console.warn("Sortable unavailable");
      return;
    }
    sortable = Sortable.create(listEl, {
      animation: 150,
      handle: ".handle",
      delay: 120,
      delayOnTouchOnly: true,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "is-dragging",
      onStart: () => {
        dragging = true;
      },
      onEnd: async () => {
        const rows = [...listEl.querySelectorAll("[data-id]")];
        const ids = rows.map((el) => el.dataset.id);
        rows.forEach((row, index) => {
          const rank = index + 1;
          const box = row.querySelector(".rank-sq");
          if (box) {
            box.textContent = String(rank);
            box.className = `rank-sq ${rankClass(rank)}`;
          }
        });
        try {
          await persistOrder(ids, "Ranking atualizado ao vivo.");
        } catch (err) {
          toast(err.message);
          if (err.status === 401) {
            showLogin();
            return;
          }
          await refresh();
        } finally {
          dragging = false;
        }
      },
    });
  }

  function renderChat(messages, muted) {
    chatEl.innerHTML = (messages || [])
      .slice()
      .reverse()
      .map((m) => {
        const hidden = m.hidden ? " hidden-msg" : "";
        return `<li class="chat-item${hidden}">
          <div class="chat-meta">
            <span class="chat-author">${escapeHtml(m.authorName)}</span>
            ${m.authorType === "complexo" ? '<span class="badge">BOX</span>' : ""}
            <span class="chat-time">${escapeHtml(formatWhen(m.createdAt))}</span>
          </div>
          <p class="chat-text">${escapeHtml(m.text)}</p>
          <div class="tiny-actions" style="margin-top:8px">
            <button class="btn ghost" data-hide="${escapeHtml(m.id)}" data-hidden="${m.hidden ? "1" : "0"}" type="button">${m.hidden ? "MOSTRAR" : "ESCONDER"}</button>
            <button class="btn danger" data-kill="${escapeHtml(m.id)}" type="button">APAGAR</button>
            <button class="btn ghost" data-pin="${escapeHtml(m.id)}" type="button">${m.pinned ? "DESFIXAR" : "FIXAR"}</button>
            ${m.authorType !== "complexo" ? `<button class="btn ghost" data-mute="${escapeHtml(m.authorId)}" data-name="${escapeHtml(m.authorName)}" type="button">MUTAR</button>` : ""}
          </div>
        </li>`;
      })
      .join("") || `<li class="empty">Nenhum recado ainda.</li>`;

    muteEl.innerHTML = (muted || []).length
      ? muted
          .map(
            (m) => `<li class="chat-item">
              <div class="chat-meta">
                <span class="chat-author">${escapeHtml(m.name || m.userId)}</span>
                <button class="btn ghost" data-unmute="${escapeHtml(m.userId)}" type="button">TIRAR DO BANCO</button>
              </div>
            </li>`
          )
          .join("")
      : `<li class="empty">Ninguém mutado.</li>`;
  }

  function renderPlay(state) {
    const week = state.weekPodium || {};
    const pred = state.predictions || {};
    const ch = state.challenge;
    const poll = state.poll;
    document.getElementById("week-status").textContent = `${week.open ? "ABERTA" : "FECHADA"} • ${week.weekKey || ""} • ${week.total || 0} voto(s)`;
    document.getElementById("palpite-status").textContent = `${pred.open ? "COLETANDO" : pred.revealed ? "REVELADO" : "FECHADO"} • ${pred.total || 0} palpite(s)`;
    document.getElementById("challenge-status").textContent = ch
      ? `${ch.title} • ${ch.open ? "ABERTO" : "ENCERRADO"} • ${(ch.participants || []).length} dentro`
      : "Nenhum desafio publicado.";
    document.getElementById("poll-status").textContent = poll
      ? `${poll.question} • ${poll.open ? "ABERTA" : "ENCERRADA"} • ${poll.total || 0} voto(s)`
      : "Nenhuma enquete.";
  }

  async function refresh() {
    try {
      if (rankStatus && !ranking.length) {
        rankStatus.hidden = false;
        rankStatus.className = "loading";
        rankStatus.textContent = "Carregando o ranking…";
      }
      const state = await api("/api/admin/state");
      renderRanking(state.ranking);
      renderChat(state.messages, state.muted);
      renderPlay(state);
    } catch (err) {
      if (err.status === 401) showLogin();
      if (rankStatus) {
        rankStatus.hidden = false;
        rankStatus.className = "error";
        rankStatus.textContent = err.message || "Não deu pra carregar o painel. Tenta de novo.";
      }
      throw err;
    }
  }

  async function showDash() {
    loginView.hidden = true;
    loginView.setAttribute("hidden", "");
    dashView.hidden = false;
    dashView.removeAttribute("hidden");
    logoutBtn.hidden = false;
    logoutBtn.removeAttribute("hidden");
    document.body.classList.add("is-admin");
    document.getElementById("user").value = "";
    document.getElementById("pass").value = "";
    try {
      await refresh();
    } catch (err) {
      if (err.status === 401) throw err;
      toast(err.message || "Painel parcialmente carregado.");
    }
  }

  function showLogin() {
    loginView.hidden = false;
    loginView.removeAttribute("hidden");
    dashView.hidden = true;
    dashView.setAttribute("hidden", "");
    logoutBtn.hidden = true;
    logoutBtn.setAttribute("hidden", "");
    document.body.classList.remove("is-admin");
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          user: document.getElementById("user").value,
          pass: document.getElementById("pass").value,
        }),
      });
      await showDash();
    } catch (err) {
      loginError.hidden = false;
      loginError.textContent = err.message || "Não deu pra entrar. Confere usuário e senha.";
      loginError.focus();
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    showLogin();
  });

  addBtn.addEventListener("click", () => openModal(null));
  cancelModal.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) closeModal();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    athleteError.hidden = true;
    const payload = {
      name: nameInput.value,
      nickname: nickInput.value,
      icon: iconInput.value,
    };
    try {
      if (idInput.value) {
        await api(`/api/admin/athletes/${encodeURIComponent(idInput.value)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast("Atleta atualizado.");
      } else {
        await api("/api/admin/athletes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast("Atleta no grid.");
      }
      closeModal();
      await refresh();
    } catch (err) {
      athleteError.hidden = false;
      athleteError.textContent = err.message;
      athleteError.focus();
      if (err.status === 401) {
        closeModal();
        showLogin();
      }
    }
  });

  listEl.addEventListener("click", async (event) => {
    if (event.target.closest(".handle")) return;
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-del]");
    const up = event.target.closest("[data-up]");
    const down = event.target.closest("[data-down]");
    if (up || down) {
      const id = (up || down).dataset.up || (up || down).dataset.down;
      const ids = ranking.map((a) => a.id);
      const index = ids.indexOf(id);
      const next = index + (up ? -1 : 1);
      if (index < 0 || next < 0 || next >= ids.length) return;
      const swapped = [...ids];
      [swapped[index], swapped[next]] = [swapped[next], swapped[index]];
      try {
        await persistOrder(swapped, "Posição atualizada.");
      } catch (err) {
        toast(err.message);
        if (err.status === 401) showLogin();
      }
      return;
    }
    if (edit) {
      const athlete = ranking.find((a) => a.id === edit.dataset.edit);
      if (athlete) openModal(athlete);
    }
    if (del) {
      const athlete = ranking.find((a) => a.id === del.dataset.del);
      if (!athlete) return;
      if (!confirm(`Tira ${athlete.name} do ranking?`)) return;
      try {
        await api(`/api/admin/athletes/${encodeURIComponent(athlete.id)}`, { method: "DELETE" });
        toast("Saiu do ranking.");
        await refresh();
      } catch (err) {
        toast(err.message);
      }
    }
  });

  chatEl.addEventListener("click", async (event) => {
    const hide = event.target.closest("[data-hide]");
    const kill = event.target.closest("[data-kill]");
    const mute = event.target.closest("[data-mute]");
    const pin = event.target.closest("[data-pin]");
    try {
      if (pin) {
        await api(`/api/admin/chat/${encodeURIComponent(pin.dataset.pin)}/pin`, {
          method: "POST",
          body: "{}",
        });
        toast("Fixado no topo do mural.");
      }
      if (hide) {
        const hidden = hide.dataset.hidden !== "1";
        await api(`/api/admin/chat/${encodeURIComponent(hide.dataset.hide)}/hide`, {
          method: "POST",
          body: JSON.stringify({ hidden }),
        });
      }
      if (kill) {
        if (!confirm("Apaga esse recado de vez?")) return;
        await api(`/api/admin/chat/${encodeURIComponent(kill.dataset.kill)}`, { method: "DELETE" });
        toast("Recado apagado.");
      }
      if (mute) {
        await api("/api/admin/mute", {
          method: "POST",
          body: JSON.stringify({ userId: mute.dataset.mute, name: mute.dataset.name }),
        });
        toast("Foi pro banco.");
      }
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  });

  muteEl.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-unmute]");
    if (!btn) return;
    try {
      await api("/api/admin/unmute", {
        method: "POST",
        body: JSON.stringify({ userId: btn.dataset.unmute }),
      });
      toast("Voltou a falar.");
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  });

  complexoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = complexoText.value.trim();
    if (!text) return;
    try {
      await api("/api/admin/chat", { method: "POST", body: JSON.stringify({ text }) });
      complexoText.value = "";
      toast("Complexo falou.");
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("week-open").addEventListener("click", () => post("/api/admin/week-podium/open", "Votação da semana aberta."));
  document.getElementById("week-close").addEventListener("click", () => post("/api/admin/week-podium/close", "Votação da semana fechada."));
  document.getElementById("week-reset").addEventListener("click", () => post("/api/admin/week-podium/reset", "Semana zerada. A galera vota de novo."));
  document.getElementById("palpite-open").addEventListener("click", () => post("/api/admin/palpite/open", "Nova urna de palpite."));
  document.getElementById("palpite-reveal").addEventListener("click", () => post("/api/admin/palpite/reveal", "Palpites revelados."));
  document.getElementById("challenge-close").addEventListener("click", () => post("/api/admin/challenge/close", "Desafio encerrado."));
  document.getElementById("poll-close").addEventListener("click", () => post("/api/admin/poll/close", "Enquete encerrada."));

  document.getElementById("challenge-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/challenge", {
        method: "POST",
        body: JSON.stringify({
          title: document.getElementById("challenge-title").value,
          wod: document.getElementById("challenge-wod").value,
        }),
      });
      document.getElementById("challenge-title").value = "";
      document.getElementById("challenge-wod").value = "";
      toast("Desafio no ar.");
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("poll-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const options = ["poll-opt1", "poll-opt2", "poll-opt3"]
      .map((id) => document.getElementById(id).value.trim())
      .filter(Boolean);
    try {
      await api("/api/admin/poll", {
        method: "POST",
        body: JSON.stringify({
          question: document.getElementById("poll-question").value,
          options,
        }),
      });
      toast("Enquete aberta.");
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  });

  async function post(path, okText) {
    try {
      await api(path, { method: "POST", body: "{}" });
      toast(okText);
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  }

  connectLive((msg) => {
    if ((msg.type === "admin" || msg.type === "state") && !dashView.hidden && !dragging) {
      refresh().catch(() => {});
    }
  });

  api("/api/admin/me")
    .then(showDash)
    .catch(showLogin);
})();
