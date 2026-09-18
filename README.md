# Complexo 88 — Ranking Hyrox

App web do **ranking oficial dos atletas Hyrox** do Complexo 88, com mural da galera, pódio da semana (voto) e painel de admin. Visual no padrão da programação do box: fundo carvão, acento **#FFCC00**, tipografia em caixa alta (Bebas Neue / Impact) e números do ranking em quadrados amarelos.

## Separação crítica

| Superfície | Quem manda | O que é |
| --- | --- | --- |
| **Ranking oficial Hyrox** | Só o admin do Complexo (arrastar) | A fila oficial. Atleta **nunca** reordena. |
| **Pódio da Semana** | Voto da galera | Torcida da semana. Não mexe no ranking oficial. |

O admin abre/fecha a janela de voto da semana e pode resetar a semana. O pódio da torcida aparece separado, com o aviso claro.

## Rodar

```bash
npm install
npm start
```

Abre [http://127.0.0.1:43888](http://127.0.0.1:43888). Painel: [http://127.0.0.1:43888/admin](http://127.0.0.1:43888/admin).

Start command (local e Render): **`npm start`**. O processo escuta `0.0.0.0` e `process.env.PORT` (na Render a plataforma injeta a porta).

| Variável | Padrão | Função |
| --- | --- | --- |
| `PORT` | `43888` (local) | Porta. **Obrigatória na Render** (já vem pronta). |
| `ADMIN_USER` | — (obrigatório) | Usuário do painel. Só no ambiente. |
| `ADMIN_PASS` | — (obrigatório) | Senha do painel. Só no ambiente. |
| `SESSION_SECRET` | chave de dev | Segredo do cookie. No Blueprint é gerado. |
| `GOOGLE_CLIENT_ID` | vazio | OAuth do mural / atletas |
| `GOOGLE_CLIENT_SECRET` | vazio | OAuth do mural / atletas |
| `GOOGLE_CALLBACK_URL` | derivado do host | Callback. Na Render, se vazio: `https://SEU-SERVICO.onrender.com/auth/google/callback` |
| `COOKIE_SECURE` | off / `1` na Render | Cookie HTTPS |
| `DATA_PATH` | `data/store.json` | Arquivo JSON |
| `NODE_ENV` | — | `production` no Blueprint |

Defina **`ADMIN_USER` e `ADMIN_PASS` no ambiente** (arquivo `.env` local, que é gitignorado, ou Environment da Render). Sem essas variáveis o login do `/admin` é recusado. O README e o código **não** carregam usuário nem senha.

```bash
npm run reset-data
npm start
```

Volta o seed oficial dos 15 atletas.

## Deploy grátis na Render

Plano alvo: **Web Service free**. Um processo Node longo (não serverless), então o **WebSocket** de `/ws` funciona no mesmo serviço. Start: **`npm start`**. Bind: `0.0.0.0` + `process.env.PORT`.

Nada pago: sem banco, sem Redis, sem worker extra.

### GitHub → Render

Repo privado pronto para a Render:

**https://github.com/romulociro/complexo88-hyrox**

Clone: `https://github.com/romulociro/complexo88-hyrox.git`

1. Entre em [dashboard.render.com](https://dashboard.render.com) com a conta **free**.
2. **New → Blueprint** → autorize o GitHub → escolha `romulociro/complexo88-hyrox` → Apply.
3. A Render sobe o service `complexo88-hyrox` (plano free, health `/api/health`).
4. No Environment da Render, defina `ADMIN_USER` e `ADMIN_PASS` (e um `SESSION_SECRET` se o Blueprint não gerar). Sem isso o `/admin` não entra.
5. Sem Google no Environment, o mural fica em modo DEV.

**New → Web Service** (sem Blueprint) também vale: Runtime Node, Build `npm install`, Start `npm start`, plan Free. A Render injeta `PORT`; não fixe 43888.

### Disco efêmero (MVP)

O ranking, o mural e os votos ficam em **`data/store.json`**.

Na Render **free o disco some no redeploy** (e pode sumir se a instância for recriada). Isso é esperado no MVP:

- Se o arquivo não existir, o boot **recria o seed** dos 15 atletas.
- Enquanto o serviço está no ar, as mudanças do admin e da galera valem.
- Depois de um redeploy, volta o seed (a menos que você restaure o JSON).

Se um dia quiser persistência de verdade **sem pagar a Render**, dá para plugar depois um free tier de [MongoDB Atlas](https://www.mongodb.com/atlas) ou [Turso](https://turso.tech/) (SQLite remoto). Não é necessário para subir o app.

### Blueprint (um arquivo)

O repo já tem `render.yaml`.

1. Suba o código para um GitHub/GitLab.
2. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
3. Aponte o repo. A Render lê `render.yaml`: build `npm install`, start `npm start`, health `/api/health`, plano `free`.
4. Em **Environment**:
   - Defina `ADMIN_USER` e `ADMIN_PASS` no dashboard (o Blueprint não grava senha no repo).
   - `SESSION_SECRET` é gerado.
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` são opcionais. Sem eles, o mural fica em **MODO DEV**.
5. Deploy. URL típica: `https://complexo88-hyrox.onrender.com`.

### Dashboard manual (sem Blueprint)

1. **New** → **Web Service** → conecte o repo.
2. Runtime: **Node**.
3. Build: `npm install`
4. Start: `npm start`
5. Instance type: **Free**.
6. Health check: `/api/health`
7. Variáveis (Environment):

```
NODE_ENV=production
SESSION_SECRET=uma-string-longa-aleatoria
ADMIN_USER=
ADMIN_PASS=
COOKIE_SECURE=1
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://SEU-SERVICO.onrender.com/auth/google/callback
```

Deixe os Google vazios para demo DEV. Em produção de verdade, preencha o OAuth e no Console do Google adicione:

- Origin: `https://SEU-SERVICO.onrender.com`
- Redirect: `https://SEU-SERVICO.onrender.com/auth/google/callback`

### Free tier: sono e WebSocket

- O serviço **dorme ~15 min sem tráfego**. O primeiro hit depois do sono pode levar ~50s.
- WebSocket só funciona neste **web service contínuo** (é o que o Blueprint sobe). Não use serverless.
- O cliente já reconecta sozinho quando a aba volta.

`GET /api/health` responde `{ ok, persist: "json-file", ephemeralDisk }` — a Render usa isso no health check.

## Identidade do atleta

- **Produção:** Google OAuth (`GET /auth/google` → callback). O atleta posta com nome e foto.
- **DEV:** se faltar `GOOGLE_CLIENT_ID` ou `GOOGLE_CLIENT_SECRET`, a pública mostra a lista do grid. Você entra como um atleta só para demo local. O voto, o check-in e o rival grudam nesse atleta.

Crie o cliente OAuth em [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

```
GOOGLE_CLIENT_ID=seu-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-secret
GOOGLE_CALLBACK_URL=http://127.0.0.1:43888/auth/google/callback
```

Origins: `http://127.0.0.1:43888`. Redirect: `/auth/google/callback`.

## Ranking oficial + admin

1. `/admin` → entre com `ADMIN_USER` e `ADMIN_PASS` do ambiente
2. Arrasta a alça **☰** (mouse ou toque; a linha fica amarela)
3. A página pública atualiza na hora via WebSocket
4. **+ ATLETA** — nome, apelido, ícone (picker de emoji **ou cola qualquer emoji**)
5. Editar / apagar atleta
6. Quem entra no top 3 oficial ganha confete amarelo na pública
7. Quem chega a **#1** entra no **Hall da Fama** (permanece mesmo se cair)

Atleta **não** tem controle de ordem do ranking oficial.

## Interações (todas ao vivo)

1. **Reações do mural** — em cada recado: 🔥 💪 😂 👀. Atleta logado toca para ligar/desligar.
2. **Provoca** — atleta escolhe outro do grid e manda recado curto. O alvo vê no “chegou pra você”; a galera vê a faixa de provocações.
3. **Palpite da atualização** — antes do admin mexer, o atleta vota quem sobe e quem desce. Resultado aparece quando o Complexo **publica o ranking** (auto-revela) ou clica **Revelar**.
4. **Check-in + streak** — botão **TREINEI HOJE**. Sequência de dias (fuso de São Paulo). Badge 🔥 no atleta do grid no modo DEV.
5. **Desafio da semana** — admin publica título + WOD. Atleta clica **TÔ DENTRO**. Lista de quem entrou.
6. **Pódio animado** — se alguém **entra** no top 3 oficial depois do drag do admin, a pública solta confete amarelo e faixa.
7. **Recado fixado** — admin clica **FIXAR** num recado (em geral do Complexo). Fica no topo do mural. Clicar de novo desfixa.
8. **Hall da fama** — todo mundo que já foi #1 oficial fica na seção. Dedé já nasce lá pelo seed.
9. **Enquete rápida** — admin cria pergunta + 2–4 opções. Atleta toca. Resultado ao vivo.
10. **Rivalidade** — atleta escolhe um alvo no ranking oficial. A página mostra o mano a mano de posições.
11. **Pódio da Semana** — voto separado. Cada atleta escolhe 1 nome. Top 3 por votos = pódio da torcida. Admin: abrir / fechar / resetar semana.

## Mural e moderação

- Atleta identifica com Google (ou DEV)
- Complexo posta como **COMPLEXO 88**
- Admin: apagar, esconder/mostrar, mutar / tirar do banco, fixar
- Mutado não posta, não reage, não vota

## Tempo real

HTTP + **WebSocket** em `/ws`. Eventos:

- `state` — ranking, mural, votos, desafio, enquete, hall, provocas
- `admin` — estado completo do painel
- `enteredTop3` via `state` quando alguém sobe ao pódio oficial

## Seed do ranking oficial

1. Dedé — O Rei 👑
2. Bruno — Frango 🐔
3. Gerson — Gordinho 🚀
4. Allanzin — Coeano 🇰🇷
5. Romim — Doctor 💉
6. Luan — Fazendeiro 🐄
7. Jan — Snip 🔫
8. Osinha — Corridinha 🏃‍♂️💨
9. Rodrigo — Camarão 🦐
10. Gerry — Arquitetuzim 🏛️
11. Augusto — Vaqueito 🏇
12. Felipe — Caçador 🏕️
13. Hallyson — Dos Venenos 🚑
14. Dancley — Careca 👨‍🦲
15. Adriano — Gorila 🦍🪦

## Stack

Node.js 18+, Express, `express-session`, `ws`. Um processo. JSON em `data/store.json`.

```
server.js          HTTP + sessão + OAuth + WebSocket
src/store.js       persistência atômica
src/play.js        voto, streak, hall, palpite
src/seed.js        atletas iniciais
public/            ranking, admin, CSS, JS
```
