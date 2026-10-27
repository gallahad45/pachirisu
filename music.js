/* P.A.C.H.I.R.I.S.U. - musique de combat
 *
 * Joue assets/music/battle.mp3 en boucle pendant tes combats (en tant que
 * joueur, pas en spectateur), le coupe en fondu a la fin du combat ou quand
 * tu quittes la salle, et reprend au debut au combat suivant. A partir du
 * tour 40, elle passe en fondu sur assets/music/turn40.webm.
 *
 * Chrome ne laisse jouer du son qu'apres une interaction avec la page: si la
 * lecture est refusee, elle repart au premier clic ou a la premiere touche.
 *
 * Reglages: bouton note dans la fenetre Pachirisu, ou PACHIRISU.musique(0.5)
 * dans la console. Ne touche pas a la musique de Showdown.
 */
(() => {
  'use strict';

  const FADE_IN_MS = 800;
  const FADE_OUT_MS = 1500;
  const TRACKS = { battle: 'music/battle.mp3', late: 'music/turn40.webm' };
  const LATE_TURN = 40;
  const trackFor = (s) => ((s && s.turn >= LATE_TURN) ? 'late' : 'battle');

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  let muted = lsGet('agc.music.muted') === '1';
  let volume = clamp01(parseFloat(lsGet('agc.music.vol') || '0.35') || 0.35);

  let audio = null;
  let fadeTimer = null;
  let playing = false;    // we want it audible right now
  let blocked = false;    // autoplay refused, waiting for a gesture
  let lastRoom = null;
  let restart = false;
  let held = false;       // a cinematic is playing its own sound
  let track = 'battle';   // which file `audio` holds
  const listeners = [];

  /* Pure: should the music be on for this state? */
  function wanted(s) {
    return !!(s && s.current && s.player && !s.ended && !muted && !held);
  }

  /* Pause for a cinematic, then pick up where it was. */
  function hold(on) {
    held = !!on;
    if (lastState) update(lastState);
  }

  function ensure() {
    if (audio) return audio;
    const base = document.documentElement.dataset.agcAssets;
    if (!base || typeof Audio === 'undefined') return null;
    audio = new Audio(base + TRACKS[track]);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    return audio;
  }

  function fadeTo(target, ms, done) {
    clearInterval(fadeTimer);
    const a = audio;
    if (!a) return;
    const from = a.volume, steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    fadeTimer = setInterval(() => {
      i++;
      a.volume = clamp01(from + ((target - from) * i) / steps);
      if (i >= steps) { clearInterval(fadeTimer); fadeTimer = null; if (done) done(); }
    }, 50);
  }

  function start() {
    const a = ensure();
    if (!a) return;
    if (restart) { try { a.currentTime = 0; } catch (e) { /* not loaded yet */ } restart = false; }
    if (playing && !a.paused) return;
    if (blocked) return; // the gesture listener will retry
    playing = true;
    const p = a.play();
    const ok = () => { blocked = false; fadeTo(volume, FADE_IN_MS); };
    if (p && typeof p.then === 'function') {
      p.then(ok).catch(() => { playing = false; blocked = true; armGesture(); });
    } else ok();
  }

  function stop(reset) {
    if (reset) restart = true;
    if (!playing) return;
    playing = false;
    if (!audio || audio.paused) return;
    fadeTo(0, FADE_OUT_MS, () => { if (!playing) audio.pause(); });
  }

  let armed = false;
  function armGesture() {
    if (armed) return;
    armed = true;
    const retry = () => {
      armed = false;
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
      blocked = false;
      if (lastState && wanted(lastState)) start();
    };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
  }

  /* Change file: the old one fades out on its own, the new one starts from the top. */
  function switchTrack(next) {
    if (next === track) return;
    track = next;
    const old = audio;
    audio = null;
    clearInterval(fadeTimer); fadeTimer = null;
    if (old) {
      const t = setInterval(() => {
        old.volume = clamp01(old.volume - 0.05);
        if (old.volume <= 0.01) { clearInterval(t); old.pause(); }
      }, 50);
    }
    const was = playing;
    playing = false;
    if (was) start();
  }

  let lastState = null;
  /* s = { roomId, current, player, ended, turn } - called on every tick. */
  function update(s) {
    lastState = s;
    if (s && s.roomId && s.roomId !== lastRoom) {
      if (lastRoom !== null) restart = true; // new battle: from the top
      lastRoom = s.roomId;
    }
    if (s && s.roomId) switchTrack(trackFor(s));
    if (wanted(s)) start();
    else stop(!!(s && s.ended));
  }

  function setMuted(on) {
    muted = !!on;
    lsSet('agc.music.muted', muted ? '1' : '0');
    if (lastState) update(lastState);
    listeners.forEach((f) => { try { f(muted); } catch (e) { /* ignore */ } });
    return muted;
  }

  function setVolume(v) {
    volume = clamp01(+v);
    lsSet('agc.music.vol', String(volume));
    if (audio && playing && !fadeTimer) audio.volume = volume;
    return volume;
  }

  window.AG_MUSIC = {
    update, wanted, setMuted, setVolume, hold,
    isMuted: () => muted,
    volume: () => volume,
    onMute(f) { listeners.push(f); },
    state: () => ({ muted, volume, playing, blocked, track, paused: audio ? audio.paused : true, time: audio ? Math.round(audio.currentTime) : 0 })
  };
})();
