/* P.A.C.H.I.R.I.S.U. - cinématiques
 *
 *   final-face-off  tes deux Pokémon actifs à 10 % ou moins : Kira / Josuke face à face
 *                   (coupé avant les Stands, x1,25) + Josuke's theme à partir de 35 s.
 *   foe-blunder     il fait une grosse erreur (son switch meurt dans le tour, il
 *                   setup / statue / Terastallise et meurt dans le tour) : Kira (Death Note)
 *                   + « All according to keikaku » à partir de 7 s.
 *   phaze           un de ses Pokémon boostés se fait phazer : Kira.
 *   my-blunder      la même erreur, mais de ton côté : GIF blunder + jingle Weird Route.
 *   one-shot-them / one-shot-me
 *                   un Pokémon tombe en un seul coup depuis 100 % : Zhang, calé sur le
 *                   Desert Eagle à partir de 2 s.
 *   star-platinum   tu gagnes avec un seul Pokémon debout.
 *   kira-defeat     il met KO ton avant-dernier Pokémon (et ton dernier ne peut pas gagner seul).
 *   last-stand      il met KO ton avant-dernier Pokémon, mais le dernier peut gagner seul
 *                   d'après le tool : « You feel everyone on earth watching you fight »
 *                   (18 premières secondes).
 *   last-stand-win  tu gagnes après un last-stand : la suite du même clip.
 *   miss            une attaque rate : UFC, texte MISS.
 *   crit            un coup critique : Gojo, Hollow Purple.
 *   blow-for-blow   le combat arrive au tour 60 : Gojo contre Sukuna.
 *   first-blood / double-kill / triple-kill / pokemaster / monster-kill
 *                   séries de KO d'un même Pokémon (le premier KO du combat = first blood,
 *                   4 KO = l'edit TRVE POKEMASTER, 5 et plus = monster kill). Vidéo ralentie
 *                   à 75 %, son d'origine.
 *   survive         un Pokémon survit à un coup avec 1 PV : Zoro sous la pluie, posé
 *                   sur son sprite comme le buff.
 *   buff            un Pokémon (le tien ou le sien) se booste avec sa propre attaque :
 *                   clip Overlord (accéléré à 3 s) posé sur son sprite, à sa taille.
 *
 * Fichiers : assets/videos/<clip>.webm (les GIF d'origine convertis en VP9, 15x plus légers)
 * et assets/sfx/<son>.mp3. Les clips marqués `sound` jouent leur propre bande son
 * (coupée seulement si Chrome refuse le son). Une cinématique à la fois ;
 * à chaque tick, seul l'événement le plus important est joué. Ne lit que l'état du client.
 */
(() => {
  'use strict';

  /* clip, ms (durée affichée), texte, ton (couleurs), son { fichier, à partir de (s) }, loop si le clip est plus court */
  const CINE = {
    'final-face-off': { clip: 'final-face-off', ms: 9400, text: 'FINAL FACE OFF', tone: 'faceoff', menace: true, sfx: { file: 'josuke', from: 35 } },
    'foe-blunder':    { clip: 'kira', ms: 4240, text: 'KEIKAKU DŌRI', tone: 'keikaku', sfx: { file: 'keikaku', from: 7 } },
    phaze:            { clip: 'kira', ms: 4240, text: 'BOOSTS GONE', tone: 'phaze' },
    'my-blunder':     { clip: 'my-blunder', ms: 2530, loop: true, text: 'BLUNDER', tone: 'blunder', sfx: { file: 'weird-route', from: 0 } },
    'one-shot-them':  { clip: 'one-shot', ms: 3010, text: 'ONE SHOT', tone: 'oneshot-good', sfx: { file: 'deagle', from: 2 } },
    'one-shot-me':    { clip: 'one-shot', ms: 3010, text: 'ONE SHOT', tone: 'oneshot-bad', sfx: { file: 'deagle', from: 2 } },
    'star-platinum':  { clip: 'star-platinum', ms: 2050, text: 'ORA ORA ORA', tone: 'ora', menace: true },
    'kira-defeat':    { clip: 'kira-defeat', ms: 7100, text: 'LAST ONE', tone: 'defeat', menace: true },
    'last-stand':     { clip: 'last-stand', ms: 18000, sound: true },
    'last-stand-win': { clip: 'last-stand-win', ms: 24780, sound: true },
    miss:             { clip: 'miss', ms: 3380, text: 'MISS', tone: 'miss', sound: true },
    crit:             { clip: 'crit', ms: 7570, sound: true },
    'blow-for-blow':  { clip: 'blow-for-blow', ms: 8300, text: 'BLOW FOR BLOW', tone: 'blow', sound: true },
    'first-blood':    { clip: 'first-blood', ms: 1960, sound: true },
    'double-kill':    { clip: 'double-kill', ms: 1740, sound: true },
    'triple-kill':    { clip: 'triple-kill', ms: 1960, sound: true },
    pokemaster:       { clip: 'pokemaster', ms: 8350, text: 'TRVE POKEMASTER', tone: 'pokemaster', sound: true },
    'monster-kill':   { clip: 'monster-kill', ms: 1690, sound: true }
  };
  /* Overlays posed on a sprite (several can run at once, next to the cinematics). */
  const OVERLAY = {
    buff:    { clip: 'buff', ms: 3000, ratio: 203 / 360 },
    survive: { clip: 'survive', ms: 5020, ratio: 480 / 640, sound: true }
  };
  const KILL_STREAK = { 2: 'double-kill', 3: 'triple-kill', 4: 'pokemaster' };
  const PRIORITY = {
    'last-stand-win': 10, 'star-platinum': 9, 'kira-defeat': 8, 'last-stand': 8, 'final-face-off': 7,
    'my-blunder': 6, 'foe-blunder': 5, 'one-shot-them': 4, 'one-shot-me': 4, crit: 3.5, phaze: 3,
    'blow-for-blow': 2.5, miss: 2,
    pokemaster: 7.5, 'monster-kill': 7.5, 'triple-kill': 6.5, 'double-kill': 4.5, 'first-blood': 3.8
  };
  const BLOW_TURN = 60;
  const PHAZE = ['whirlwind', 'roar', 'dragontail', 'circlethrow'];
  const id = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  const alive = (side) => ((side && side.pokemon) || []).filter((p) => p && !p.fainted).length;
  const hpPct = (p) => (p && p.maxhp > 0 && typeof p.hp === 'number' ? (100 * p.hp) / p.maxhp : 100);
  const actv = (side) => (side && side.active && side.active[0]) || null;
  const parseHp = (s) => {
    const t = String(s || '').split(' ')[0];
    if (t === '0') return 0;
    const m = t.match(/^(\d+)\/(\d+)$/);
    return m && +m[2] > 0 ? (100 * +m[1]) / +m[2] : null;
  };

  function resultOf(battle, mine) {
    if (!battle || !battle.ended) return null;
    const q = battle.stepQueue || [];
    for (let i = q.length - 1; i >= 0 && i >= q.length - 80; i--) {
      const l = String(q[i] || '');
      if (l.startsWith('|tie')) return 'tie';
      if (l.startsWith('|win|')) return (mine && mine.name && l.slice(5).trim() === mine.name) ? 'win' : 'lose';
    }
    return null;
  }

  function freshTurn() { return { p1: { sw: [], st: [], tera: [] }, p2: { sw: [], st: [], tera: [] } }; }

  /* Reads the protocol lines added since the last tick (state carried in `st`). */
  function scan(lines, from, st, me) {
    const events = [];
    const foeSide = me === 'p1' ? 'p2' : 'p1';
    const who = (s) => { const m = String(s || '').match(/^(p\d)[a-z]?:\s*(.*)$/); return m ? { side: m[1], nick: m[2].trim() } : null; };
    for (let i = from; i < lines.length; i++) {
      const parts = String(lines[i] || '').slice(1).split('|');
      const cmd = parts[0];
      const w = who(parts[1]);
      const key = w ? w.side + ':' + w.nick : '';
      switch (cmd) {
        case 'turn': st.turn = freshTurn(); if (+parts[1] === BLOW_TURN) events.push('blow-for-blow'); break;
        case '-miss': events.push('miss'); break;
        case '-crit': events.push('crit'); break;
        case 'start': st.started = true; break;
        case 'move': {
          if (!w) break;
          st.lastMover = w.side; st.lastMoverKey = key; st.lastMove = id(parts[2]); st.use++;
          const md = window.BattleMovedex && window.BattleMovedex[id(parts[2])];
          if (md && md.category === 'Status' && st.turn[w.side]) st.turn[w.side].st.push(w.nick);
          break;
        }
        case 'switch': case 'drag': {
          if (!w) break;
          const h = parseHp(parts[3]);
          if (h !== null) st.hp[key] = h;
          if (w.side === foeSide) {
            if (cmd === 'drag' && st.foeBoost > 0 && st.lastMover === me && PHAZE.includes(st.lastMove)) events.push('phaze');
            st.foeBoost = 0;
          }
          if (cmd === 'switch' && st.started && st.turn[w.side]) st.turn[w.side].sw.push(w.nick);
          break;
        }
        case '-damage': {
          if (!w) break;
          const after = parseHp(parts[2]);
          const fromTag = parts.slice(3).some((p) => p.startsWith('[from]'));
          // HP at the start of this move use, the first time it touches this target
          if (!fromTag && st.useHp[key] === undefined) st.useHp[key] = { use: st.use, hp: st.hp[key] === undefined ? 100 : st.hp[key] };
          if (!fromTag && st.useHp[key].use !== st.use) st.useHp[key] = { use: st.use, hp: st.hp[key] === undefined ? 100 : st.hp[key] };
          if (after !== null) st.hp[key] = after;
          // Left on exactly 1 HP by an attack (Sash, Sturdy, or a lucky roll).
          if (!fromTag && /^1\/\d+/.test(String(parts[2] || ''))) events.push('survive:' + w.side);
          break;
        }
        case '-heal': case '-sethp': { const h = w && parseHp(parts[2]); if (h !== null && h !== undefined) st.hp[key] = h; break; }
        case '-boost': {
          if (w && w.side === foeSide) st.foeBoost += +parts[3] || 1;
          // Self-boost from its own move (Swords Dance, Dragon Dance...), not from an item.
          const fromItem = parts.slice(4).some((p) => p.startsWith('[from]'));
          if (w && !fromItem && st.lastMoverKey === key && !st.buffedUse[key + '#' + st.use]) {
            st.buffedUse[key + '#' + st.use] = true;
            events.push('buff:' + w.side);
          }
          break;
        }
        case '-unboost': if (w && w.side === foeSide) st.foeBoost -= +parts[3] || 1; break;
        case '-clearallboost': st.foeBoost = 0; break;
        case '-clearboost': case '-clearpositiveboost': if (w && w.side === foeSide) st.foeBoost = 0; break;
        case '-terastallize': if (w && st.turn[w.side]) st.turn[w.side].tera.push(w.nick); break;
        case 'faint': {
          if (!w) break;
          const t = st.turn[w.side] || { sw: [], st: [], tera: [] };
          const byOther = st.lastMover && st.lastMover !== w.side;
          // A mon that entered, set up, used a status move or Terastallized this turn and
          // died to the other side's move in the same turn: that's a blunder.
          if (byOther && (t.sw.includes(w.nick) || t.st.includes(w.nick) || t.tera.includes(w.nick))) {
            events.push(w.side === foeSide ? 'foe-blunder' : 'my-blunder');
          }
          // One hit from full HP (not a self-KO like Explosion).
          const u = st.useHp[key];
          if (byOther && st.lastMoverKey !== key && u && u.use === st.use && u.hp >= 99.5) {
            events.push(w.side === foeSide ? 'one-shot-them' : 'one-shot-me');
          }
          // Kill streaks: KOs scored by the same mon (keyed by side + nickname).
          if (byOther && st.lastMoverKey && st.lastMoverKey !== key) {
            st.kills = st.kills || {};
            st.kos = (st.kos || 0) + 1;
            const n = (st.kills[st.lastMoverKey] = (st.kills[st.lastMoverKey] || 0) + 1);
            if (n >= 5) events.push('monster-kill');
            else if (KILL_STREAK[n]) events.push(KILL_STREAK[n]);
            else if (st.kos === 1) events.push('first-blood');
          }
          st.hp[key] = 0;
          break;
        }
        default: break;
      }
    }
    return events;
  }

  /* Pure: previous snapshot + current battle -> { snap, events }. The first look at a
   * room only reads the past silently (no replay of an old game). */
  function detect(prev, battle, mine, foe, ctx) {
    const q = (battle && battle.stepQueue) || [];
    const me = (mine && mine.sideid) || 'p1';
    const a = actv(mine), b = actv(foe);
    const faceoff = !!(a && b && !a.fainted && !b.fainted && hpPct(a) <= 10 && hpPct(b) <= 10);
    const st = prev ? JSON.parse(JSON.stringify(prev.st))
      : { foeBoost: 0, turn: freshTurn(), lastMover: null, lastMoverKey: '', lastMove: '', use: 0, hp: {}, useHp: {}, buffedUse: {}, started: false, kills: {}, kos: 0 };
    const logEvents = scan(q, prev ? prev.qi : 0, st, me);
    st.buffedUse = {}; // only needed within one scan
    const sideOf = (tag) => logEvents.filter((e) => e.startsWith(tag)).map((e) => (e.slice(tag.length) === me ? 'mine' : 'foe'));
    const buffs = prev ? sideOf('buff:') : [];
    const survivors = prev ? sideOf('survive:') : [];
    const snap = { my: alive(mine), foe: alive(foe), faceoff, result: resultOf(battle, mine), qi: q.length, st,
      lastStand: !!(prev && prev.lastStand) };
    const events = [];
    if (prev) {
      if (snap.result === 'win' && !prev.result) {
        if (snap.lastStand) events.push('last-stand-win');
        else if (snap.my === 1) events.push('star-platinum');
      }
      if (!snap.result && prev.my === 2 && snap.my === 1) {
        // The tool thinks the last one can win alone: the hype clip, else Kira.
        if (ctx && ctx.soloWin) { events.push('last-stand'); snap.lastStand = true; } else events.push('kira-defeat');
      }
      if (faceoff && !prev.faceoff) events.push('final-face-off');
      events.push(...logEvents.filter((e) => !e.startsWith('buff:') && !e.startsWith('survive:')));
    }
    return { snap, buffs, survivors, events: [...new Set(events)].sort((x, y) => PRIORITY[y] - PRIORITY[x]) };
  }

  /* ---------------------------------------------------------------- */
  /* Player                                                           */
  /* ---------------------------------------------------------------- */

  const CSS = `
  .agc-cine{position:fixed;inset:0;z-index:1000003;pointer-events:none;display:flex;flex-direction:column;
    align-items:center;justify-content:center;background:rgba(6,5,12,.74);animation:agcCineIn .22s ease-out}
  .agc-cine video{max-width:min(78vw,900px);max-height:68vh;border-radius:4px;
    box-shadow:0 0 0 3px #0c0a14,0 18px 60px rgba(0,0,0,.7)}
  .agc-cine-text{position:fixed;left:0;right:0;bottom:6vh;text-align:center;
    font:900 italic clamp(30px,6.4vw,78px)/1 "Avenir Next Condensed","Futura","Impact","Bahnschrift","Ubuntu Condensed","DejaVu Sans Condensed","Arial Narrow",sans-serif;
    letter-spacing:.06em;text-transform:uppercase;transform:skewX(-8deg);
    animation:agcCineText .9s cubic-bezier(.2,1.4,.4,1) both}
  .agc-cine-menace{position:fixed;font:900 clamp(28px,5vw,64px)/1 "Hiragino Kaku Gothic StdN","Hiragino Sans","Yu Gothic","Meiryo","Noto Sans CJK JP","Noto Sans JP",sans-serif;
    color:#a855f7;opacity:.85;text-shadow:0 0 12px rgba(168,85,247,.7);animation:agcMenace 1.2s ease-in-out infinite}
  .agc-cine-menace.l{left:6vw;top:18vh}.agc-cine-menace.r{right:6vw;top:24vh;animation-delay:.4s}
  .agc-cine.out{animation:agcCineOut .3s ease-in forwards}
  @keyframes agcCineIn{from{opacity:0}to{opacity:1}}
  @keyframes agcCineOut{to{opacity:0}}
  @keyframes agcCineText{from{opacity:0;transform:skewX(-8deg) scale(1.6)}to{opacity:1;transform:skewX(-8deg) scale(1)}}
  @keyframes agcMenace{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6px) scale(1.08)}}

  /* colour code per situation */
  .tone-faceoff{color:#f5d0fe;-webkit-text-stroke:2px #3b0764;text-shadow:0 0 18px rgba(217,70,239,.85),0 6px 0 #1e1b4b}
  .tone-keikaku{color:#fff;-webkit-text-stroke:2px #7f1d1d;text-shadow:0 0 22px rgba(220,38,38,.9),0 6px 0 #000;
    font-family:"Didot","Bodoni 72","Bodoni MT","Times New Roman","Liberation Serif","DejaVu Serif",serif;font-style:italic;letter-spacing:.12em}
  .tone-phaze{color:#cffafe;-webkit-text-stroke:2px #164e63;text-shadow:0 0 18px rgba(34,211,238,.85),0 6px 0 #083344}
  .tone-blunder{color:#fde047;-webkit-text-stroke:2px #7c2d12;text-shadow:0 0 16px rgba(249,115,22,.9),4px 4px 0 #dc2626;
    animation:agcCineText .9s cubic-bezier(.2,1.4,.4,1) both,agcGlitch .18s steps(2) infinite .9s}
  .tone-oneshot-good{color:#fef3c7;-webkit-text-stroke:2px #78350f;text-shadow:0 0 18px rgba(251,191,36,.95),0 6px 0 #451a03}
  .tone-oneshot-bad{color:#fee2e2;-webkit-text-stroke:2px #450a0a;text-shadow:0 0 18px rgba(239,68,68,.95),0 6px 0 #1c0505}
  .tone-ora{color:#fef08a;-webkit-text-stroke:2px #1e3a8a;text-shadow:0 0 20px rgba(59,130,246,.9),0 6px 0 #172554}
  .tone-miss{color:#f8fafc;-webkit-text-stroke:2px #111827;text-shadow:0 0 16px rgba(148,163,184,.8),0 6px 0 #000}
  .tone-blow{color:#fecaca;-webkit-text-stroke:2px #1e1b4b;text-shadow:0 0 18px rgba(129,140,248,.9),0 0 30px rgba(239,68,68,.6),0 6px 0 #0f0a1e}
  .tone-pokemaster{color:#fff;-webkit-text-stroke:2px #450a0a;text-shadow:0 0 22px rgba(220,38,38,.95),0 6px 0 #000;letter-spacing:.14em}
  .tone-defeat{color:#e9d5ff;-webkit-text-stroke:2px #312e81;text-shadow:0 0 16px rgba(139,92,246,.7),0 6px 0 #1e1b4b}
  @keyframes agcGlitch{0%{transform:skewX(-8deg) translate(0,0)}50%{transform:skewX(-14deg) translate(-3px,2px)}100%{transform:skewX(-4deg) translate(3px,-1px)}}
  `;

  /* A <video> for one clip. Clips with their own sound try to play it (the page has
   * had clicks, so Chrome usually allows it) and fall back to silent if refused. */
  function makeVideo(base, clip, opts) {
    const v = document.createElement('video');
    v.muted = !(opts.sound && !sfxMuted());
    v.autoplay = true; v.playsInline = true;
    if (opts.loop) v.loop = true;
    if (opts.sound && !v.muted) v.volume = 0.8;
    v.src = `${base}videos/${clip}.webm`;
    if (!v.muted && typeof v.play === 'function') {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => { v.muted = true; v.play().catch(() => {}); });
    }
    return v;
  }

  /* Overlays on a mon's sprite (the client keeps each battle sprite at
   * pokemon.sprite.$el): the Overlord buff, Zoro when it survives on 1 HP.
   * They run alongside cinematics. */
  const BUFF_MS = OVERLAY.buff.ms;
  function showOverlay(clientMon, kind) {
    const o = OVERLAY[kind];
    if (!o || typeof document === 'undefined' || !document.body) return false;
    const base = document.documentElement.dataset.agcAssets;
    const sp = clientMon && clientMon.sprite && clientMon.sprite.$el && clientMon.sprite.$el[0];
    if (!base || !sp || !sp.getBoundingClientRect) return false;
    const r = sp.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (!document.getElementById('agc-buff-style')) {
      const st = document.createElement('style'); st.id = 'agc-buff-style';
      st.textContent = `.agc-buff{position:fixed;z-index:1000001;pointer-events:none;border-radius:8px;object-fit:cover;
        box-shadow:0 0 0 2px #b91c1c,0 0 18px 4px rgba(220,38,38,.65);animation:agcBuffIn .18s ease-out,agcBuffPulse .5s ease-in-out .2s infinite alternate}
        .agc-buff.survive{box-shadow:0 0 0 2px #1e3a8a,0 0 18px 4px rgba(96,165,250,.6);animation:agcBuffIn .18s ease-out}
        .agc-buff.out{animation:agcBuffOut .25s ease-in forwards}
        @keyframes agcBuffIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
        @keyframes agcBuffPulse{to{box-shadow:0 0 0 2px #f87171,0 0 26px 8px rgba(248,113,113,.75)}}
        @keyframes agcBuffOut{to{opacity:0;transform:scale(1.15)}}`;
      document.head.appendChild(st);
    }
    // a bit larger than the sprite so it is covered, keeping the clip's shape
    const w = Math.max(90, r.width * 1.35), h = w * o.ratio;
    const v = makeVideo(base, o.clip, { sound: o.sound });
    v.className = 'agc-buff' + (kind === 'buff' ? '' : ' ' + kind);
    Object.assign(v.style, { width: w + 'px', height: h + 'px',
      left: (r.left + r.width / 2 - w / 2) + 'px', top: (r.top + r.height / 2 - h / 2) + 'px' });
    document.body.appendChild(v);
    setTimeout(() => { v.classList.add('out'); setTimeout(() => v.remove(), 260); }, o.ms);
    return true;
  }
  const showBuff = (clientMon) => showOverlay(clientMon, 'buff');

  const queue = [];
  let playing = false;
  const prevByRoom = {};
  const listeners = [];

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const sfxMuted = () => lsGet('agc.sfx.muted') === '1';

  function playSfx(base, sfx, ms) {
    if (!sfx || sfxMuted() || typeof Audio === 'undefined') return null;
    const a = new Audio(base + 'sfx/' + sfx.file + '.mp3');
    a.volume = 0.75;
    const go = () => { try { a.currentTime = sfx.from || 0; } catch (e) { /* not seekable yet */ } a.play().catch(() => {}); };
    if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
    // fade out at the end of the clip
    setTimeout(() => {
      const t = setInterval(() => { a.volume = Math.max(0, a.volume - 0.15); if (a.volume <= 0.01) { clearInterval(t); a.pause(); } }, 40);
    }, Math.max(0, ms - 250));
    return a;
  }

  function play(key) {
    const c = CINE[key];
    if (!c || typeof document === 'undefined' || !document.body) return false;
    const base = document.documentElement.dataset.agcAssets;
    if (!base) return false;
    if (playing) {
      if (!queue.includes(key)) { queue.push(key); queue.sort((x, y) => PRIORITY[y] - PRIORITY[x]); }
      return true;
    }
    if (!document.getElementById('agc-cine-style')) {
      const st = document.createElement('style'); st.id = 'agc-cine-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    playing = true;
    if (window.AG_MUSIC && window.AG_MUSIC.hold) window.AG_MUSIC.hold(true);
    const el = document.createElement('div');
    el.className = 'agc-cine';
    // Old clips are silent (their sound is the separate sfx track); new ones carry their own.
    el.appendChild(makeVideo(base, c.clip, { sound: c.sound, loop: c.loop }));
    el.insertAdjacentHTML('beforeend', ''
      + (c.menace ? '<div class="agc-cine-menace l">ゴ ゴ ゴ</div><div class="agc-cine-menace r">ゴ ゴ</div>' : '')
      + (c.text ? `<div class="agc-cine-text tone-${c.tone}">${c.text}</div>` : ''));
    document.body.appendChild(el);
    playSfx(base, c.sfx, c.ms);
    listeners.forEach((f) => { try { f(key); } catch (e) { /* ignore */ } });
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => {
        el.remove(); playing = false;
        const next = queue.shift();
        if (next) play(next);
        else if (window.AG_MUSIC && window.AG_MUSIC.hold) window.AG_MUSIC.hold(false);
      }, 300);
    }, c.ms);
    return true;
  }

  window.AG_CINE = {
    detect, scan, play, showBuff, showOverlay, CINE, OVERLAY, PRIORITY, BUFF_MS,
    isPlaying: () => playing,
    onPlay(f) { listeners.push(f); },
    /* Plays the most important event of this tick; returns it (or null). */
    update(roomId, battle, mine, foe, ctx) {
      const { snap, events, buffs, survivors } = detect(prevByRoom[roomId], battle, mine, foe, ctx);
      prevByRoom[roomId] = snap;
      for (const b of new Set(buffs)) showBuff(actv(b === 'mine' ? mine : foe));
      for (const b of new Set(survivors)) showOverlay(actv(b === 'mine' ? mine : foe), 'survive');
      const top = events[0] || null;
      if (top) play(top);
      return top;
    }
  };
})();
