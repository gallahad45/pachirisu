/* P.A.C.H.I.R.I.S.U. - pont vers l'extension.
 * Les scripts principaux tournent dans le monde MAIN (pour lire window.app)
 * et n'ont pas acces a chrome.*. Ce script, lui, tourne dans le monde isole:
 *  - il publie l'URL du dossier assets/ sur <html>;
 *  - il range le carnet des defaites et le dataset des combats dans
 *    chrome.storage.local, qui survit au nettoyage des donnees du site.
 *    Un combat par cle ("b:<id>") + un index ("b:index"), pour ne jamais
 *    reecrire tout le dataset a chaque partie.
 */
document.documentElement.dataset.agcAssets = chrome.runtime.getURL('assets/');
document.documentElement.dataset.agcBridge = '1';

const KEY = 'losses';
const MAX = 300;
const INDEX = 'b:index';

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const m = e.data;
  if (!m || m.agc !== 'req' || typeof m.id !== 'number') return;
  const reply = (ok, data, error) => window.postMessage({ agc: 'res', id: m.id, ok, data, error }, location.origin);
  try {
    if (m.op === 'losses:get') {
      const got = await chrome.storage.local.get(KEY);
      reply(true, got[KEY] || []);
    } else if (m.op === 'losses:add') {
      const rec = m.data;
      if (!rec || typeof rec.id !== 'string') return reply(false, null, 'bad record');
      const got = await chrome.storage.local.get(KEY);
      const all = (got[KEY] || []).filter((r) => r.id !== rec.id);
      all.unshift(rec);
      await chrome.storage.local.set({ [KEY]: all.slice(0, MAX) });
      reply(true, true);
    } else if (m.op === 'losses:clear') {
      await chrome.storage.local.set({ [KEY]: [] });
      reply(true, true);
    } else if (m.op === 'battles:add') {
      const rec = m.data;
      if (!rec || typeof rec.id !== 'string') return reply(false, null, 'bad record');
      const got = await chrome.storage.local.get(INDEX);
      const index = (got[INDEX] || []).filter((r) => r.id !== rec.id);
      index.unshift({ id: rec.id, date: rec.date, result: rec.result, format: rec.format, opponent: rec.opponent, turns: rec.turns, tool: rec.tool || null });
      await chrome.storage.local.set({ ['b:' + rec.id]: rec, [INDEX]: index });
      reply(true, true);
    } else if (m.op === 'battles:index') {
      const got = await chrome.storage.local.get(INDEX);
      reply(true, got[INDEX] || []);
    } else if (m.op === 'battles:all') {
      const got = await chrome.storage.local.get(INDEX);
      const keys = (got[INDEX] || []).map((r) => 'b:' + r.id);
      const recs = keys.length ? await chrome.storage.local.get(keys) : {};
      reply(true, keys.map((k) => recs[k]).filter(Boolean));
    } else if (m.op === 'battles:clear') {
      const got = await chrome.storage.local.get(INDEX);
      await chrome.storage.local.remove((got[INDEX] || []).map((r) => 'b:' + r.id).concat(INDEX));
      reply(true, true);
    }
  } catch (err) {
    reply(false, null, String(err && err.message || err));
  }
});
