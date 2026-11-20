// Accès des utilisateurs externes (même principe qu'App Budget, liste propre à app-prog).
// Une personne demande l'accès (nom, prénom, adresse mail). Son navigateur garde un secret aléatoire « k » ;
// le serveur n'en garde que l'empreinte (kh). L'administrateur accepte, refuse, révoque ou supprime,
// et attribue des droits. La personne s'identifie ensuite avec « Authorization: Bearer <id>.<k> ».

// Catalogue des droits attribuables (à compléter au fil des besoins)
export const DROITS = [
  { key: 'brouillons', label: 'Consulter le calendrier non publié' },
];
const DROIT_KEYS = DROITS.map(d => d.key);

const JSONH = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSONH });
const bad = (msg, status = 400) => json({ error: msg }, status);
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = async t => b64u(await crypto.subtle.digest('SHA-256', enc.encode(t)));
const rid = (n = 12) => { const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(x => a[x % a.length]).join(''); };
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const KRE = /^[A-Za-z0-9_-]{20,100}$/;

export const ACCES_SQL = 'CREATE TABLE IF NOT EXISTS acces (id TEXT PRIMARY KEY, nom TEXT NOT NULL, prenom TEXT NOT NULL, email TEXT NOT NULL, kh TEXT NOT NULL, status TEXT NOT NULL, droits TEXT NOT NULL, at TEXT NOT NULL, decided_at TEXT, last TEXT)';

const pub = r => ({ id: r.id, nom: r.nom, prenom: r.prenom, email: r.email, status: r.status, droits: JSON.parse(r.droits || '[]'), at: r.at, decidedAt: r.decided_at, last: r.last });

// Personne autorisée (jeton « id.k »), ou null
export async function delegue(request, env) {
  const h = request.headers.get('authorization') || '';
  const m = h.match(/^Bearer ([a-z0-9]{12})\.([A-Za-z0-9_-]{20,100})$/);
  if (!m) return null;
  const r = await env.DB.prepare('SELECT * FROM acces WHERE id = ?1').bind(m[1]).first();
  if (!r || r.kh !== await sha(m[2])) return null;
  return pub(r);
}

// Routes publiques : POST /api/acces (demande), GET /api/acces/moi (état de sa demande)
export async function accesPublic(request, env, seg) {
  const m = request.method;
  if (seg[0] !== 'acces') return null;
  if (!seg[1] && m === 'POST') {
    const b = await request.json().catch(() => ({}));
    const nom = str(b.nom, 80), prenom = str(b.prenom, 80), email = str(b.email, 200).toLowerCase(), k = String(b.k || '');
    if (!nom || !prenom) return bad('Nom et prénom obligatoires.');
    if (!EMAIL.test(email)) return bad('Adresse mail invalide.');
    if (!KRE.test(k)) return bad('Demande invalide.');
    const c = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(status = 'attente') AS a FROM acces").first();
    if ((c.n || 0) >= 200) return bad('Trop de demandes enregistrées.', 429);
    if ((c.a || 0) >= 20) return bad('Trop de demandes en attente, réessaie plus tard.', 429);
    const id = rid();
    await env.DB.prepare('INSERT INTO acces (id, nom, prenom, email, kh, status, droits, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(id, nom, prenom, email, await sha(k), 'attente', '[]', new Date().toISOString()).run();
    return json({ id, status: 'attente' });
  }
  if (seg[1] === 'moi' && m === 'GET') {
    const d = await delegue(request, env);
    if (!d) return bad('Demande introuvable.', 404);
    return json({ id: d.id, nom: d.nom, prenom: d.prenom, email: d.email, status: d.status, droits: d.status === 'active' ? d.droits : [], catalogue: DROITS });
  }
  return null;
}

// Routes de l'administrateur (APP_TOKEN déjà vérifié) : GET /api/acces, POST /api/acces/<id>
export async function accesAdmin(request, env, seg) {
  const m = request.method;
  if (seg[0] !== 'acces') return null;
  if (!seg[1] && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM acces ORDER BY at DESC').all();
    return json({ demandes: results.map(pub), catalogue: DROITS });
  }
  if (/^[a-z0-9]{12}$/.test(seg[1] || '') && m === 'POST') {
    const r = await env.DB.prepare('SELECT * FROM acces WHERE id = ?1').bind(seg[1]).first();
    if (!r) return bad('Demande introuvable.', 404);
    const b = await request.json().catch(() => ({}));
    if (b.action === 'supprimer') { await env.DB.prepare('DELETE FROM acces WHERE id = ?1').bind(r.id).run(); return json({ ok: true }); }
    if (b.action === 'droits') {
      const droits = Array.isArray(b.droits) ? [...new Set(b.droits.filter(x => DROIT_KEYS.includes(x)))] : [];
      await env.DB.prepare('UPDATE acces SET droits = ?2 WHERE id = ?1').bind(r.id, JSON.stringify(droits)).run();
      return json({ ok: true, demande: pub({ ...r, droits: JSON.stringify(droits) }) });
    }
    const st = { accepter: 'active', refuser: 'refusee', revoquer: 'revoquee' }[b.action];
    if (!st) return bad('Action inconnue.');
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE acces SET status = ?2, decided_at = ?3 WHERE id = ?1').bind(r.id, st, now).run();
    return json({ ok: true, demande: pub({ ...r, status: st, decided_at: now }) });
  }
  return null;
}
