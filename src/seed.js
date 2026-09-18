/** Seed oficial do ranking Hyrox — Complexo 88 */

function slugify(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const MAN_BALD = "\u{1F468}\u{200D}\u{1F9B2}";
const RUNNER_DUST = "\u{1F3C3}\u{200D}\u{2642}\u{FE0F}\u{1F4A8}";
const GORILLA_TOMB = "\u{1F98D}\u{1FAA6}";

const SEED_ATHLETES = [
  { name: "Dedé", nickname: "O Rei", icon: "👑" },
  { name: "Bruno", nickname: "Frango", icon: "🐔" },
  { name: "Gerson", nickname: "Gordinho", icon: "🚀" },
  { name: "Allanzin", nickname: "Coeano", icon: "🇰🇷" },
  { name: "Romim", nickname: "Doctor", icon: "💉" },
  { name: "Luan", nickname: "Fazendeiro", icon: "🐄" },
  { name: "Jan", nickname: "Snip", icon: "🔫" },
  { name: "Osinha", nickname: "Corridinha", icon: RUNNER_DUST },
  { name: "Rodrigo", nickname: "Camarão", icon: "🦐" },
  { name: "Gerry", nickname: "Arquitetuzim", icon: "🏛️" },
  { name: "Augusto", nickname: "Vaqueito", icon: "🏇" },
  { name: "Felipe", nickname: "Caçador", icon: "🏕️" },
  { name: "Hallyson", nickname: "Dos Venenos", icon: "🚑" },
  { name: "Dancley", nickname: "Careca", icon: MAN_BALD },
  { name: "Adriano", nickname: "Gorila", icon: GORILLA_TOMB },
];

module.exports = { slugify, SEED_ATHLETES };
