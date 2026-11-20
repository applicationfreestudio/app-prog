// API de l'application « le Programme » — Cloudflare Pages Functions + D1.
// Liaisons attendues : D1 « DB », variable secrète « ADMIN_PASSWORD ».
import SEED from '../_seed.js';

const JSONH = { 'content-type': 'application/json; charset=utf-8' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSONH, ...extra } });
const bad = (msg, status = 400) => json({ error: msg }, status);

// Chemins autorisés : config/settings, config/library, drafts/AAAA-MM-JJ, public/AAAA-MM-JJ
const OK_PATH = /^(config\/(settings|library)|(drafts|public)\/\d{4}-\d{2}-\d{2})$/;

let ready = null;
async function init(env) {
  if (!ready) ready = (async () => {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, type TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)'),
    ]);
    const now = new Date().toISOString();
    await env.DB.batch(Object.entries(SEED).map(([p, d]) =>
      env.DB.prepare('INSERT OR IGNORE INTO docs (path, data, updated_at) VALUES (?1, ?2, ?3)').bind(p, JSON.stringify(d), now)));
  })().catch(e => { ready = null; throw e; });
  return ready;
}

// ---- Jeton de session signé (HMAC-SHA256 avec le mot de passe administrateur) ----
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode('ej-session:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function makeToken(env) { const exp = Date.now() + 30 * 864e5; return exp + '.' + await hmac(env.ADMIN_PASSWORD, String(exp)); }
async function isAdmin(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const t = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  return safeEq(sig, await hmac(env.ADMIN_PASSWORD, exp));
}

async function allDocs(env, prefixes) {
  const { results } = await env.DB.prepare('SELECT path, data FROM docs').all();
  const out = { settings: null, library: null, drafts: {}, public: {} };
  for (const r of results) {
    const d = JSON.parse(r.data);
    if (r.path === 'config/settings') out.settings = d;
    else if (r.path === 'config/library') out.library = d;
    else { const [c, k] = r.path.split('/'); if (out[c]) out[c][k] = d; }
  }
  if (prefixes) for (const k of Object.keys(out)) if (!prefixes.includes(k)) delete out[k];
  return out;
}

export async function onRequest({ request, env, params }) {
  if (!env.DB) return bad('Base D1 non liée (liaison « DB » manquante dans Cloudflare).', 500);
  await init(env);
  const seg = [].concat(params.path || []);
  const route = seg[0] || '';
  const m = request.method;

  // ----- Public -----
  if (route === 'public' && m === 'GET') {
    const d = await allDocs(env, ['settings', 'public']);
    const s = d.settings || {};
    return json({ days: d.public, settings: { info: s.info || {}, periods: s.periods || [] } }, 200, { 'cache-control': 'public, max-age=30' });
  }
  if (route === 'img' && m === 'GET' && seg[1]) {
    const r = await env.DB.prepare('SELECT type, data FROM images WHERE id = ?1').bind(seg[1]).first();
    if (!r) return new Response('Introuvable', { status: 404 });
    const bin = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
    return new Response(bin, { headers: { 'content-type': r.type, 'cache-control': 'public, max-age=31536000, immutable' } });
  }
  if (route === 'login' && m === 'POST') {
    if (!env.ADMIN_PASSWORD) return bad('Mot de passe administrateur non configuré (variable ADMIN_PASSWORD).', 500);
    const { password } = await request.json().catch(() => ({}));
    await new Promise(r => setTimeout(r, 400)); // freine les essais à répétition
    if (typeof password !== 'string' || !safeEq(password, env.ADMIN_PASSWORD)) return bad('Mot de passe incorrect.', 401);
    return json({ token: await makeToken(env) });
  }

  // ----- Créateur (authentifié) -----
  if (!(await isAdmin(request, env))) return bad('Connexion requise.', 401);

  if (route === 'me' && m === 'GET') return json({ ok: true });
  if (route === 'all' && m === 'GET') return json(await allDocs(env), 200, { 'cache-control': 'no-store' });
  if (route === 'doc' && m === 'PUT') {
    const { path, data } = await request.json().catch(() => ({}));
    if (typeof path !== 'string' || !OK_PATH.test(path)) return bad('Chemin invalide.');
    if (data === null) {
      await env.DB.prepare('DELETE FROM docs WHERE path = ?1').bind(path).run();
    } else {
      if (typeof data !== 'object' || Array.isArray(data)) return bad('Document invalide.');
      const txt = JSON.stringify(data);
      if (txt.length > 900000) return bad('Document trop volumineux.', 413);
      await env.DB.prepare('INSERT INTO docs (path, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
        .bind(path, txt, new Date().toISOString()).run();
    }
    return json({ ok: true });
  }
  if (route === 'img' && m === 'POST') {
    const { type, data } = await request.json().catch(() => ({}));
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type || '') || typeof data !== 'string') return bad('Image invalide.');
    if (data.length > 1400000) return bad('Image trop lourde (1 Mo maximum après réduction).', 413);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO images (id, type, data, created_at) VALUES (?1, ?2, ?3, ?4)').bind(id, type, data, new Date().toISOString()).run();
    return json({ id });
  }
  if (route === 'backup' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT path, data, updated_at FROM docs ORDER BY path').all();
    const body = { app: 'le-programme', exportedAt: new Date().toISOString(), docs: results.map(r => ({ path: r.path, updated_at: r.updated_at, data: JSON.parse(r.data) })) };
    const name = 'sauvegarde-programme-' + new Date().toISOString().slice(0, 10) + '.json';
    return new Response(JSON.stringify(body, null, 1), { headers: { ...JSONH, 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
  }
  if (route === 'restore' && m === 'POST') {
    const b = await request.json().catch(() => null);
    if (!b || b.app !== 'le-programme' || !Array.isArray(b.docs)) return bad('Fichier de sauvegarde non reconnu.');
    const docs = b.docs.filter(d => OK_PATH.test(d.path) && d.data && typeof d.data === 'object');
    const now = new Date().toISOString();
    await env.DB.batch([env.DB.prepare('DELETE FROM docs'),
      ...docs.map(d => env.DB.prepare('INSERT INTO docs (path, data, updated_at) VALUES (?1, ?2, ?3)').bind(d.path, JSON.stringify(d.data), now))]);
    return json({ ok: true, restored: docs.length });
  }
  return bad('Route inconnue.', 404);
}
