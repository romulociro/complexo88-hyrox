(() => {
  const MAN_BALD = "\u{1F468}\u{200D}\u{1F9B2}";

  const GROUPS = {
    TREINO: [
      "⚡", "🔥", "💪", "🏆", "🥇", "🥈", "🥉", "🏃", "🏃‍♂️", "🏃‍♀️", "💨",
      "🏋️", "🤸", "🧘", "🥊", "🎿", "🛷", "🚣", "⏱️", "🎯", "💀", "😤",
      "🫡", "👑", "🚀", "🐔", "🐄", "🔫", "💉", "🦐", "🏛️", "🏇", "🏕️",
      "🚑", MAN_BALD, "🦍", "🪦", "🇰🇷", "💧", "🥵", "🧊",
    ],
    ROSTOS: [
      "😀", "😁", "😂", "🤣", "😅", "😊", "😎", "🤩", "😍", "😘", "😜",
      "🤪", "🤨", "😐", "😏", "😒", "😔", "😢", "😭", "😡", "🤯", "😴",
      "🥱", "🤠", "🤡", "👻", "💀", "👽", "🤖",
    ],
    PESSOAS: [
      "👋", "🤝", "🙏", "👍", "👎", "👏", "👊", "✊", "🤘", "✌️", "🤙",
      "👀", "🧠", "👨", "👩", "🧑", "👴", "👵", "🧔", "🦸", "🥷",
    ],
    ANIMAIS: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁",
      "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦅", "🦉", "🐺",
      "🐴", "🦄", "🐝", "🦋", "🐢", "🐍", "🐙", "🦑", "🦐", "🦞", "🦀",
      "🐠", "🐬", "🐳", "🦈", "🐊", "🦍", "🐘", "🦛", "🦒", "🦘", "🐄",
      "🐎", "🐖", "🐏", "🐑", "🐐", "🦌", "🐓",
    ],
    COMIDA: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑",
      "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🌶️", "🌽", "🥕", "🥔",
      "🍞", "🧀", "🥚", "🍳", "🥞", "🥓", "🥩", "🍗", "🌭", "🍔", "🍟",
      "🍕", "🌮", "🌯", "🥗", "🍝", "🍜", "🍣", "🍱", "🍤", "🍙", "🍚",
      "🍦", "🍩", "🍪", "🎂", "☕", "🍵", "🧃", "🍺", "🍻", "🍷",
    ],
    OBJETOS: [
      "⌚", "📱", "💻", "⌨️", "📷", "📸", "🎥", "📺", "📻", "⏰", "⌛",
      "💡", "🔦", "💰", "💳", "💎", "🧰", "🔧", "🔨", "⚙️", "🧱",
    ],
    SIMBOLOS: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "⭐", "🌟",
      "✨", "⚡", "🔥", "💥", "☀️", "🌙", "❄️", "💧", "✅", "❌", "❓",
      "❗", "💯", "🔔",
    ],
    BANDEIRAS: [
      "🇧🇷", "🇰🇷", "🇺🇸", "🇵🇹", "🇦🇷", "🇺🇾", "🇯🇵", "🇮🇹", "🇫🇷", "🇩🇪",
      "🇬🇧", "🇪🇸", "🇲🇽", "🇨🇱", "🏁", "🚩",
    ],
  };

  function mount(root, { value = "⚡", onChange } = {}) {
    root.innerHTML = "";
    const tabs = document.createElement("div");
    tabs.className = "actions";
    tabs.style.flexWrap = "wrap";
    tabs.style.marginTop = "10px";

    const grid = document.createElement("div");
    grid.className = "emoji-grid";

    function paint(list) {
      grid.innerHTML = "";
      for (const emoji of list) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-btn" + (emoji === value ? " active" : "");
        btn.textContent = emoji;
        btn.addEventListener("click", () => {
          value = emoji;
          onChange?.(emoji);
          paint(list);
        });
        grid.appendChild(btn);
      }
    }

    for (const [label, list] of Object.entries(GROUPS)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn ghost";
      btn.style.minHeight = "32px";
      btn.style.fontSize = "14px";
      btn.textContent = label;
      btn.addEventListener("click", () => paint(list));
      tabs.appendChild(btn);
    }

    root.appendChild(tabs);
    root.appendChild(grid);
    paint(GROUPS.TREINO);
    return {
      set(next) {
        value = next;
        paint(GROUPS.TREINO);
      },
    };
  }

  window.C88Emoji = { mount, GROUPS };
})();
