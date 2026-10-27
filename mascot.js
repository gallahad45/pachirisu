/* AG Copilot - mascotte Pachirisu
 *
 * Une petite fenetre a part, calee en coin (deplacable, reductible), qui
 * change d'humeur quand il se passe quelque chose:
 *   happy : un Pokemon adverse vient d'etre mis KO
 *   sad   : un de tes Pokemon vient de tomber
 *   win / lose : fin du combat
 *   idle  : le reste du temps
 *
 * Images: assets/pachirisu/<humeur>.png (PNG transparent, n'importe quelle
 * taille). Si un fichier manque, on retombe sur idle.png, puis sur un
 * Pachirisu provisoire dessine ici.
 *
 * Quand un de tes Pokemon tombe ou que tu perds, la roue de Mahoraga
 * apparait ~2 s au centre de l'ecran et tourne : P.A.C.H.I.R.I.S.U.
 * s'en souviendra (et le dataset aussi).
 *
 * Ne lit que l'etat du client. N'envoie rien.
 */
(() => {
  'use strict';

  const MOODS = {
    idle:  {},
    happy: { ms: 3500 },
    sad:   { ms: 3500 },
    win:   {},
    lose:  {}
  };

  const LINES = {
    happy: ['One down!', 'Nice.', 'Pachi pachi!', 'Off to the backstage.'],
    sad:   ['Ouch.', 'We take it and move on.', 'We\'ll pay that one back.', 'Minor technical issue.'],
    win:   ['That\'s a wrap!', 'GG. Curtain.', 'Applause!'],
    lose:  ['End of the show… run it back?', 'Zzz… rematch tomorrow.', 'GG anyway.'],
    tie:   ['A tie?!']
  };

  /* Reactions to the big moments (cinematics.js): the 3D asset gets bent and
   * thrown around like Mr Tenna's wacky TV-host animations. */
  const REACT = {
    'final-face-off': { anim: 'jitter', tv: true, lines: ['Ladies and gentlemen… the final blow!', 'Nobody breathe.', 'Now or never.'] },
    'foe-blunder':    { anim: 'spin', lines: ['It took the bait!', 'Thanks for the gift!', 'All according to plan.'] },
    phaze:            { anim: 'boing', lines: ['Bye bye boosts!', 'Back to the locker room!', 'Not on my watch.'] },
    'my-blunder':     { anim: 'melt', tv: true, lines: ['… cut that in editing?', 'That was not in the script.', 'We saw nothing. Nothing.'] },
    'one-shot-them':  { anim: 'boing', lines: ['In one hit!', 'No time to blink.', 'Boom.'] },
    'one-shot-me':    { anim: 'melt', lines: ['Who turned off the lights?', 'In one hit… really?', 'Ouch ouch ouch.'] },
    'star-platinum':  { anim: 'spin', tv: true, lines: ['Just one, and that\'s enough!', 'Victory on the last breath!', 'ORA!'] },
    'kira-defeat':    { anim: 'wobble', lines: ['Just the two of us now…', 'We stay on air.', 'This will be tight.'] },
    'last-stand':     { anim: 'jitter', tv: true, lines: ['The whole world is watching you.', 'Alone, so what?', 'It\'s not over.'] },
    'last-stand-win': { anim: 'spin', tv: true, lines: ['IT DID IT!', 'One against all!', 'Curtain!'] },
    miss:             { anim: 'boing', lines: ['Missed!', 'Into thin air.', 'Not even touched.'] },
    crit:             { anim: 'jitter', lines: ['Critical!', 'That one stings.', 'Purple!'] },
    'blow-for-blow':  { anim: 'jitter', tv: true, lines: ['Turn 60 and still swinging.', 'Nobody gives in.', 'Blow for blow!'] },
    'first-blood':    { anim: 'boing', lines: ['First blood!', 'Here we go.', 'One down.'] },
    'double-kill':    { anim: 'spin', lines: ['That\'s two!', 'Double!', 'It wants more.'] },
    'triple-kill':    { anim: 'spin', tv: true, lines: ['That\'s three!', 'Triple!', 'Nothing can stop it.'] },
    pokemaster:       { anim: 'spin', tv: true, lines: ['Four. FOUR.', 'TRVE POKEMASTER.', 'Legendary.'] },
    'monster-kill':   { anim: 'jitter', tv: true, lines: ['Monstrous.', 'Anyone left?', 'Carnage.'] }
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function countFainted(side) {
    return ((side && side.pokemon) || []).filter((p) => p && p.fainted).length;
  }

  /* 'win' | 'lose' | 'tie' | null. Battle.winner() only logs "|win|NAME",
   * so read it back from the end of the step queue. */
  function resultOf(battle, mine) {
    if (!battle || !battle.ended) return null;
    const q = battle.stepQueue || [];
    for (let i = q.length - 1; i >= 0 && i >= q.length - 60; i--) {
      const l = String(q[i] || '');
      if (l.startsWith('|tie')) return 'tie';
      if (l.startsWith('|win|')) {
        const w = l.slice(5).trim();
        return (mine && mine.name && w === mine.name) ? 'win' : 'lose';
      }
    }
    return null;
  }

  /* Pure: compares the new battle state with the previous snapshot.
   * The first snapshot of a room never fires (no spam on page reload). */
  function detect(prev, battle, mine, foe) {
    const snap = { my: countFainted(mine), foe: countFainted(foe), result: resultOf(battle, mine) };
    let event = null;
    if (prev) {
      if (snap.result && !prev.result) event = snap.result;
      else if (snap.foe > prev.foe) event = 'happy';
      else if (snap.my > prev.my) event = 'sad';
    }
    return { snap, event };
  }

  /* ---------------------------------------------------------------- */
  /* Last-resort placeholder, only used if the PNGs are missing        */
  /* ---------------------------------------------------------------- */

  const PLACEHOLDER = [
    '................', '..BB........BB..', '..BWB......BWB..', '...BWWWBBWWWB...',
    '...WWWWBBWWWW...', '..WWWWWBBWWWWW..', '..WWKWWWWWWKWW..', '..WYYWWWWWWYYW..',
    '..WYYWWPPWWYYW..', '...WWWWWWWWWW...', '....WWWWWWWW....', '...BWWWWWWWWB...',
    '...WWWWWWWWWW.BB', '...WWWWWWWWWWBWB', '....WW....WW.BB.', '................'
  ];
  const PALETTE = { B: '#3b6fd6', W: '#f4f6fb', K: '#1b1b2a', Y: '#ffd84a', P: '#f28aa0' };
  let _placeholderURL = null;
  function placeholderURL() {
    if (_placeholderURL) return _placeholderURL;
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    PLACEHOLDER.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = PALETTE[row[x]];
        if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
      }
    });
    _placeholderURL = c.toDataURL();
    return _placeholderURL;
  }

  /* ---------------------------------------------------------------- */
  /* Corner widget                                                    */
  /* ---------------------------------------------------------------- */

  const CSS = `
  .agc-pet{position:fixed;right:24px;bottom:56px;width:210px;z-index:1000000;
    font:13px/1.4 "Avenir Next","Avenir","Segoe UI Variable Text","Segoe UI","Ubuntu","Cantarell","Noto Sans",system-ui,sans-serif;color:#e6e9ef;user-select:none}
  .agc-pet-card{position:relative;border-radius:18px;overflow:visible;
    background:radial-gradient(120% 90% at 50% 100%,#2b3a63 0%,#151a26 70%);
    border:1px solid #2f3a55;box-shadow:0 10px 30px rgba(0,0,0,.45);transition:background .4s}
  .agc-pet[data-mood=happy] .agc-pet-card{background:radial-gradient(120% 90% at 50% 100%,#6b5512 0%,#1c1a12 72%);border-color:#8a6d16}
  .agc-pet[data-mood=sad] .agc-pet-card{background:radial-gradient(120% 90% at 50% 100%,#2a3140 0%,#14171e 72%);border-color:#3a4252}
  .agc-pet[data-mood=win] .agc-pet-card{background:radial-gradient(120% 90% at 50% 100%,#7a5a0c 0%,#2a1d06 60%,#140f05 100%);border-color:#fcd34d}
  .agc-pet[data-mood=lose] .agc-pet-card{background:radial-gradient(120% 90% at 50% 100%,#2c2450 0%,#110f1f 72%);border-color:#3e3570}
  .agc-pet-head{display:flex;align-items:center;justify-content:space-between;
    padding:7px 10px 0 12px;cursor:move}
  .agc-pet-name{font-weight:800;font-size:12px;letter-spacing:.6px;color:#fcd34d}
  .agc-pet-name span{color:#8b95ad;font-weight:600;letter-spacing:0;margin-left:4px}
  .agc-pet-min{all:unset;cursor:pointer;color:#8b95ad;font-weight:800;padding:0 4px;font-size:14px}
  .agc-pet-min:hover{color:#fff}
  .agc-pet-mute{color:#fcd34d;margin-right:2px}
  .agc-pet-mute.off{color:#6b7488;text-decoration:line-through}
  .agc-pet-stage{position:relative;height:190px;display:flex;align-items:flex-end;justify-content:center;
    padding:0 10px 12px}
  .agc-pet-img{max-width:100%;max-height:170px;object-fit:contain;transform-origin:50% 100%;
    filter:drop-shadow(0 6px 8px rgba(0,0,0,.45))}
  .agc-pet-img.pixel{image-rendering:pixelated;width:96px;height:96px;max-height:none}
  .agc-pet-shadow{position:absolute;bottom:10px;left:50%;width:110px;height:14px;margin-left:-55px;
    border-radius:50%;background:rgba(0,0,0,.35);filter:blur(3px)}
  .agc-pet-bubble{position:absolute;left:50%;top:-14px;transform:translate(-50%,-6px) scale(.85);
    white-space:nowrap;background:#fcd34d;color:#1b1b2a;font-weight:800;font-size:13px;
    padding:6px 12px;border-radius:14px;box-shadow:0 4px 10px rgba(0,0,0,.4);
    opacity:0;transition:.2s;pointer-events:none;z-index:2}
  .agc-pet-bubble:after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-6px;
    border:6px solid transparent;border-top-color:inherit;border-bottom:0}
  .agc-pet-bubble{border-top-color:#fcd34d}
  .agc-pet.talking .agc-pet-bubble{opacity:1;transform:translate(-50%,-100%) scale(1)}
  .agc-pet[data-mood=sad] .agc-pet-bubble,.agc-pet[data-mood=lose] .agc-pet-bubble{background:#a5b4d4;border-top-color:#a5b4d4}
  .agc-pet-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:18px}
  .agc-pet-fx i{position:absolute;font-style:normal;opacity:0}

  @keyframes agcBreathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.02,.98)}}
  @keyframes agcHop{0%,100%{transform:translateY(0) scale(1)}15%{transform:translateY(0) scale(1.06,.92)}
    40%{transform:translateY(-28px) scale(.96,1.05)}65%{transform:translateY(0) scale(1.04,.96)}80%{transform:translateY(-8px)}}
  @keyframes agcShake{0%,100%{transform:translateX(0) rotate(0)}15%{transform:translateX(-7px) rotate(-4deg)}
    30%{transform:translateX(7px) rotate(4deg)}45%{transform:translateX(-5px) rotate(-3deg)}60%{transform:translateX(5px) rotate(2deg)}75%{transform:translateX(-2px)}}
  @keyframes agcJump{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-22px) rotate(-6deg)}
    50%{transform:translateY(-26px) rotate(4deg)}75%{transform:translateY(0) scale(1.05,.95)}}
  @keyframes agcSleep{0%,100%{transform:scale(1,1)}50%{transform:scale(1.015,1.035)}}
  @keyframes agcRise{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:1}
    100%{opacity:0;transform:translate(18px,-70px) scale(1.2)}}
  @keyframes agcPop{0%{opacity:0;transform:scale(.2) rotate(0)}30%{opacity:1}
    100%{opacity:0;transform:scale(1.3) rotate(90deg)}}
  @keyframes agcDrip{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(26px)}}

  /* Mr Tenna-style rubber-hose motion: big squash & stretch, skews, overshoot. */
  @keyframes tennaBoing{0%{transform:scale(1,1)}12%{transform:scale(1.45,.55)}30%{transform:translateY(-34px) scale(.62,1.55) rotate(-6deg)}
    48%{transform:translateY(0) scale(1.3,.7)}62%{transform:translateY(-10px) scale(.88,1.16) rotate(4deg)}78%{transform:scale(1.08,.94)}100%{transform:scale(1,1)}}
  @keyframes tennaMelt{0%{transform:scale(1,1)}25%{transform:scale(1.9,.32) skewX(8deg)}45%{transform:scale(1.7,.38) skewX(-10deg)}
    65%{transform:scale(1.8,.34) skewX(6deg)}82%{transform:scale(.8,1.35)}100%{transform:scale(1,1)}}
  @keyframes tennaSpin{0%{transform:rotate(0) scale(1)}30%{transform:rotate(-200deg) scale(1.35,.8)}60%{transform:rotate(-540deg) scale(.75,1.4)}
    85%{transform:rotate(-700deg) scale(1.15,.9)}100%{transform:rotate(-720deg) scale(1)}}
  @keyframes tennaJitter{0%{transform:translate(0,0) rotate(0) scale(1)}10%{transform:translate(-6px,2px) rotate(-7deg) scale(1.08,.94)}
    20%{transform:translate(5px,-3px) rotate(6deg) scale(.94,1.1)}30%{transform:translate(-4px,-1px) skewX(14deg)}40%{transform:translate(6px,3px) skewX(-16deg) scale(1.12,.9)}
    50%{transform:translate(-2px,-4px) rotate(9deg)}60%{transform:translate(3px,2px) rotate(-5deg) scale(.9,1.15)}70%{transform:translate(-5px,0) skewX(10deg)}
    80%{transform:translate(4px,-2px) rotate(4deg)}90%{transform:translate(-2px,1px) scale(1.04,.97)}100%{transform:translate(0,0)}}
  @keyframes tennaWobble{0%,100%{transform:skewX(0) scale(1,1)}20%{transform:skewX(24deg) scale(.92,1.12)}40%{transform:skewX(-22deg) scale(1.1,.9)}
    60%{transform:skewX(16deg) scale(.95,1.06)}80%{transform:skewX(-10deg) scale(1.04,.97)}}
  @keyframes tennaIdle{0%,100%{transform:scale(1,1) rotate(0)}25%{transform:scale(1.04,.96) rotate(-2deg)}50%{transform:scale(.97,1.05) rotate(1deg)}75%{transform:scale(1.03,.98) rotate(2deg)}}
  @keyframes tennaTV{0%,100%{opacity:0}10%,30%,50%{opacity:.55}20%,40%{opacity:.15}}

  .agc-pet[data-mood=idle] .agc-pet-img{animation:tennaIdle 2.6s ease-in-out infinite}
  .agc-pet[data-mood=happy] .agc-pet-img{animation:tennaBoing .9s cubic-bezier(.3,1.5,.5,1) 3}
  .agc-pet[data-mood=sad] .agc-pet-img{animation:tennaMelt 1.1s ease-in-out 2;filter:grayscale(.45) brightness(.9) drop-shadow(0 6px 8px rgba(0,0,0,.45))}
  .agc-pet[data-mood=win] .agc-pet-img{animation:tennaSpin 1.4s cubic-bezier(.4,1.3,.5,1) infinite}
  .agc-pet[data-mood=lose] .agc-pet-img{animation:tennaWobble 3.2s ease-in-out infinite}
  /* reactions override the mood for ~3 s */
  .agc-pet.react-boing .agc-pet-img{animation:tennaBoing .8s cubic-bezier(.3,1.5,.5,1) 3!important}
  .agc-pet.react-melt .agc-pet-img{animation:tennaMelt 1s ease-in-out 3!important}
  .agc-pet.react-spin .agc-pet-img{animation:tennaSpin 1s cubic-bezier(.4,1.3,.5,1) 3!important}
  .agc-pet.react-jitter .agc-pet-img{animation:tennaJitter .35s steps(10) 8!important}
  .agc-pet.react-wobble .agc-pet-img{animation:tennaWobble 1.2s ease-in-out 2!important}
  .agc-pet-card:after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;
    background:repeating-linear-gradient(0deg,rgba(255,255,255,.12) 0 1px,transparent 1px 3px),linear-gradient(90deg,rgba(255,0,80,.12),rgba(0,200,255,.12))}
  .agc-pet.tv .agc-pet-card:after{animation:tennaTV .9s steps(6) 3}

  .agc-pet[data-mood=lose] .agc-pet-fx i{animation:agcRise 3s ease-out infinite;color:#c7d2fe;font-weight:800}
  .agc-pet[data-mood=win] .agc-pet-fx i,.agc-pet[data-mood=happy] .agc-pet-fx i{animation:agcPop 1.4s ease-out infinite;color:#fde68a}
  .agc-pet[data-mood=sad] .agc-pet-fx i{animation:agcDrip 1.6s ease-in infinite;color:#93c5fd}

  /* minimized: a round avatar in the corner */
  .agc-pet.min{width:64px}
  .agc-pet.min .agc-pet-card{border-radius:50%;width:64px;height:64px;overflow:hidden;cursor:pointer}
  .agc-pet.min .agc-pet-head,.agc-pet.min .agc-pet-shadow,.agc-pet.min .agc-pet-fx{display:none}
  .agc-pet.min .agc-pet-stage{height:64px;padding:4px;align-items:center}
  .agc-pet.min .agc-pet-img{max-height:56px;animation:none!important}
  .agc-pet.min .agc-pet-bubble{top:-4px}
  `;

  const FX = {
    idle: [],
    happy: [['✦', 18, 30, 0], ['✧', 150, 46, .4], ['✦', 40, 90, .8]],
    sad: [['•', 130, 70, 0], ['•', 62, 84, .8]],
    win: [['✦', 16, 26, 0], ['★', 150, 30, .3], ['✧', 26, 110, .6], ['★', 160, 100, .9]],
    lose: [['Z', 128, 96, 0], ['z', 142, 84, 1], ['Z', 120, 100, 2]]
  };

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  function create() {
    if (!document.getElementById('agc-pet-style')) {
      const st = document.createElement('style');
      st.id = 'agc-pet-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    const el = document.createElement('div');
    el.className = 'agc-pet';
    el.innerHTML = `<div class="agc-pet-card">
        <div class="agc-pet-head"><span class="agc-pet-name">PACHIRISU<span></span></span>
          <span><button class="agc-pet-min agc-pet-mute" title="Battle music">&#9835;</button>
          <button class="agc-pet-min agc-pet-hide" title="Minimize">&minus;</button></span></div>
        <div class="agc-pet-stage"><div class="agc-pet-shadow"></div>
          <img class="agc-pet-img" alt="Pachirisu"><div class="agc-pet-bubble"></div></div>
        <div class="agc-pet-fx"></div>
      </div>`;
    document.body.appendChild(el);

    const img = el.querySelector('.agc-pet-img');
    const bubble = el.querySelector('.agc-pet-bubble');
    const fx = el.querySelector('.agc-pet-fx');
    const label = el.querySelector('.agc-pet-name span');
    const card = el.querySelector('.agc-pet-card');

    // Position & minimized state survive reloads.
    try {
      const pos = JSON.parse(lsGet('agc.pet.pos') || 'null');
      if (pos && typeof pos.left === 'number') {
        el.style.left = Math.min(pos.left, window.innerWidth - 80) + 'px';
        el.style.top = Math.min(pos.top, window.innerHeight - 80) + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
      }
    } catch (e) { /* ignore */ }
    if (lsGet('agc.pet.min') === '1') el.classList.add('min');

    const setMin = (on) => { el.classList.toggle('min', on); lsSet('agc.pet.min', on ? '1' : '0'); };
    el.querySelector('.agc-pet-hide').addEventListener('click', (e) => { e.stopPropagation(); setMin(true); });
    const muteBtn = el.querySelector('.agc-pet-mute');
    const M = window.AG_MUSIC;
    if (M) {
      const paintMute = (m) => { muteBtn.classList.toggle('off', m); muteBtn.title = m ? 'Music muted (click to unmute)' : 'Battle music (click to mute)'; };
      paintMute(M.isMuted());
      M.onMute(paintMute);
      muteBtn.addEventListener('click', (e) => { e.stopPropagation(); M.setMuted(!M.isMuted()); });
    } else muteBtn.style.display = 'none';

    let drag = null, moved = false;
    el.addEventListener('mousedown', (e) => {
      if (!el.classList.contains('min') && !e.target.closest('.agc-pet-head')) return;
      if (e.target.closest('.agc-pet-min')) return;
      const r = el.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; moved = false;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      moved = true;
      el.style.left = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - drag.dx)) + 'px';
      el.style.top = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - drag.dy)) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      if (!drag) return;
      drag = null;
      if (moved) lsSet('agc.pet.pos', JSON.stringify({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10) }));
    });
    card.addEventListener('click', () => { if (el.classList.contains('min') && !moved) setMin(false); });

    // Preload every mood so switching is instant.
    const assets = document.documentElement.dataset.agcAssets;
    const base = (assets || '') + 'pachirisu/';
    const ok = {};
    if (assets) {
      for (const m of Object.keys(MOODS)) {
        const im = new Image();
        im.onload = () => { ok[m] = im.src; if (m === mood || (m === 'idle' && !ok[mood])) paint(); };
        im.src = base + m + '.png';
      }
    }

    let mood = 'idle', revertTimer = null, sayTimer = null, reactTimer = null;
    const NAMES = { idle: 'on air', happy: 'thrilled', sad: 'shaken', win: 'champion', lose: 'off air' };

    function paint() {
      el.dataset.mood = mood;
      const src = ok[mood] || ok.idle;
      if (src) { img.src = src; img.classList.remove('pixel'); }
      else { img.src = placeholderURL(); img.classList.add('pixel'); }
      // restart the CSS animation on every mood change
      img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
      label.textContent = NAMES[mood] || '';
      fx.innerHTML = (FX[mood] || []).map(([c, x, y, d]) =>
        `<i style="left:${x}px;top:${y}px;animation-delay:${d}s">${c}</i>`).join('');
    }

    function setMood(m, line) {
      clearTimeout(revertTimer);
      mood = m;
      paint();
      bubble.textContent = line || '';
      el.classList.toggle('talking', !!line);
      if (line && MOODS[m] && !MOODS[m].ms) {
        // persistent moods: the bubble fades after a while, the mood stays
        revertTimer = setTimeout(() => el.classList.remove('talking'), 6000);
      }
      if (MOODS[m] && MOODS[m].ms) {
        revertTimer = setTimeout(() => setMood('idle', ''), MOODS[m].ms);
      }
    }

    setMood('idle', '');

    return {
      el,
      show(on) { el.style.display = on ? '' : 'none'; },
      react(key) {
        const r = REACT[key];
        if (!r) return false;
        clearTimeout(reactTimer);
        el.classList.remove('react-boing', 'react-melt', 'react-spin', 'react-jitter', 'react-wobble', 'tv');
        void el.offsetWidth; // restart the animations
        const three = ok.idle || ok.sad; // idle.png / sad.png are the 3D render
        if (three) { img.src = three; img.classList.remove('pixel'); }
        el.classList.add('react-' + r.anim);
        if (r.tv) el.classList.add('tv');
        bubble.textContent = pick(r.lines);
        el.classList.add('talking');
        reactTimer = setTimeout(() => {
          el.classList.remove('react-' + r.anim, 'tv', 'talking');
          paint();
        }, 3200);
        return true;
      },
      say(line) {
        bubble.textContent = line;
        el.classList.add('talking');
        clearTimeout(sayTimer);
        sayTimer = setTimeout(() => el.classList.remove('talking'), 7000);
      },
      update(roomId, battle, mine, foe) {
        const { snap, event } = detect(prevByRoom[roomId], battle, mine, foe);
        prevByRoom[roomId] = snap;
        if (event === 'tie') setMood('lose', pick(LINES.tie));
        else if (event) setMood(event, pick(LINES[event]));
        if (event === 'lose') spinFor(roomId + ':end');
        else if (WHEEL_EVENTS.includes(event)) spinWheel(roomId, false);
        else if (!snap.result && (mood === 'win' || mood === 'lose')) setMood('idle', '');
      },
      state(roomId) { return { mood, snapshot: prevByRoom[roomId] || null, fenetre: el.style.display !== 'none' }; },
      get mood() { return mood; }
    };
  }
  const prevByRoom = {};

  /* ---------------------------------------------------------------- */
  /* Mahoraga's wheel                                                  */
  /* ---------------------------------------------------------------- */

  const WHEEL_EVENTS = ['sad', 'lose'];
  const WHEEL_TEXT = 'P.A.C.H.I.R.I.S.U. will remember this.';
  /* The five Mahoraga edits, in story order (chained by their first / last frames):
   * each of your KOs turns the wheel once more, the defeat plays the last one. */
  const WHEEL_CLIPS = [
    { clip: 'mahoraga-1', ms: 2240 }, { clip: 'mahoraga-2', ms: 2020 }, { clip: 'mahoraga-3', ms: 2850 },
    { clip: 'mahoraga-4', ms: 2010 }, { clip: 'mahoraga-5', ms: 2220 }
  ];
  const WHEEL_MS = Math.max(...WHEEL_CLIPS.map((c) => c.ms));

  const WHEEL_CSS = `
  .agc-wheel{position:fixed;inset:0;z-index:1000002;pointer-events:none;display:flex;
    align-items:center;justify-content:center;background:rgba(6,5,10,.6);animation:agcWheelIn .15s ease-out}
  .agc-wheel video{max-width:min(82vw,980px);max-height:66vh;border-radius:4px;
    box-shadow:0 0 0 3px #0c0a14,0 18px 60px rgba(0,0,0,.7)}
  .agc-wheel-text{position:fixed;left:0;right:0;bottom:7vh;text-align:center;
    font:800 clamp(18px,3.2vw,30px)/1.2 Georgia,"Times New Roman",serif;letter-spacing:3px;
    color:#f6e7c6;text-shadow:0 2px 10px #000,0 0 22px rgba(255,186,76,.65)}
  .agc-wheel.out{animation:agcWheelOut .25s ease-in forwards}
  @keyframes agcWheelIn{from{opacity:0}to{opacity:1}}
  @keyframes agcWheelOut{to{opacity:0}}
  `;

  /* Which clip: the n-th KO of this battle plays clip n (the 4th one repeats
   * after that), the defeat always plays the last. Pure, for the tests. */
  const turnsByRoom = {};
  function wheelClip(roomId, final) {
    if (final) return WHEEL_CLIPS[WHEEL_CLIPS.length - 1];
    const k = roomId || 'room';
    const n = (turnsByRoom[k] = (turnsByRoom[k] || 0) + 1);
    return WHEEL_CLIPS[Math.min(n, WHEEL_CLIPS.length - 1) - 1];
  }

  let wheelTimer = null;
  function spinWheel(roomId, final) {
    if (typeof document === 'undefined' || !document.body) return null;
    // A JoJo cinematic (cinematics.js) already covers the screen: let it play alone.
    if (window.AG_CINE && window.AG_CINE.isPlaying && window.AG_CINE.isPlaying()) return null;
    const base = document.documentElement.dataset.agcAssets;
    if (!base) return null;
    const c = wheelClip(roomId, final);
    if (!document.getElementById('agc-wheel-style')) {
      const st = document.createElement('style');
      st.id = 'agc-wheel-style';
      st.textContent = WHEEL_CSS;
      document.head.appendChild(st);
    }
    // A second KO during the clip replaces it instead of stacking.
    const old = document.querySelector('.agc-wheel');
    if (old) old.remove();
    clearTimeout(wheelTimer);
    const el = document.createElement('div');
    el.className = 'agc-wheel';
    const v = document.createElement('video');
    const quiet = (() => { try { return localStorage.getItem('agc.sfx.muted') === '1'; } catch (e) { return false; } })();
    v.muted = quiet; v.autoplay = true; v.playsInline = true;
    v.src = `${base}videos/${c.clip}.webm`;
    el.appendChild(v);
    el.insertAdjacentHTML('beforeend', `<div class="agc-wheel-text">${WHEEL_TEXT}</div>`);
    document.body.appendChild(el);
    if (!v.muted && typeof v.play === 'function') {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => { v.muted = true; v.play().catch(() => {}); });
    }
    if (window.AG_MUSIC && window.AG_MUSIC.hold) window.AG_MUSIC.hold(true);
    wheelTimer = setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        if (window.AG_MUSIC && window.AG_MUSIC.hold && !(window.AG_CINE && window.AG_CINE.isPlaying && window.AG_CINE.isPlaying())) window.AG_MUSIC.hold(false);
      }, 250);
    }, c.ms);
    return c.clip;
  }

  /* The defeat wheel can be triggered twice (live detection, then the loss log
   * being saved): only the first one per battle spins. Returns true if it spun. */
  const spun = new Set();
  function spinFor(key) {
    if (spun.has(key)) return false;
    spun.add(key);
    spinWheel(String(key).replace(/:end$/, ''), true);
    return true;
  }

  window.AG_MASCOT = { detect, resultOf, create, MOODS, REACT, spinWheel, spinFor, wheelClip, WHEEL_EVENTS, WHEEL_TEXT, WHEEL_CLIPS, WHEEL_MS };
})();
