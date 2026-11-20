// Point d'entrée du Worker : /api/* → API, le reste → fichiers statiques de public/
import { handleApi } from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env); }
      catch (e) { return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: { 'content-type': 'application/json' } }); }
    }
    return env.ASSETS.fetch(request);
  },
};
