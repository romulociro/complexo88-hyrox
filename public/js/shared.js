(() => {
  const toastEl = document.getElementById("toast");

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(path, {
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        ...options,
      });
    } catch {
      const err = new Error("Servidor offline. Tenta de novo.");
      err.status = 0;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Algo falhou. Tenta de novo.");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rankClass(rank) {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    return "";
  }

  function formatWhen(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatToday() {
    const now = new Date();
    const weekday = now
      .toLocaleDateString("pt-BR", { weekday: "long" })
      .toUpperCase();
    const day = now.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
    }).toUpperCase();
    return { weekday, day };
  }

  function connectLive(onMessage) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    let ws;
    let tries = 0;
    let timer;

    function open() {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.addEventListener("open", () => {
        tries = 0;
      });
      ws.addEventListener("message", (event) => {
        try {
          onMessage(JSON.parse(event.data));
        } catch {
          /* ignore */
        }
      });
      ws.addEventListener("close", retry);
      ws.addEventListener("error", () => ws.close());
    }

    function retry() {
      tries += 1;
      const wait = Math.min(8000, 400 * tries);
      timer = setTimeout(open, wait);
    }

    open();
    return () => {
      clearTimeout(timer);
      if (ws) ws.close();
    };
  }

  window.C88 = { toast, api, escapeHtml, rankClass, formatWhen, formatToday, connectLive };
})();
