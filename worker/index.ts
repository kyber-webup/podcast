import { handleAudio } from "../server/audio";

/**
 * Entrée Cloudflare Workers — **inutilisée aujourd'hui** : le site est déployé
 * sur Cloudflare Pages (voir functions/audio/[name].ts et le README). Conservée
 * telle quelle pour pouvoir revenir aux Workers si le domaine de l'agence passe
 * un jour sur Cloudflare, ce qu'exige Access.
 *
 * Se déploie avec `npx wrangler deploy -c wrangler.workers.jsonc`.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const audioPrefix = "/audio/";

    if (url.pathname.startsWith(audioPrefix)) {
      let key: string;
      try {
        key = decodeURIComponent(url.pathname.slice(audioPrefix.length));
      } catch {
        return new Response("Not Found", { status: 404 });
      }
      return handleAudio(request, env, key);
    }

    return env.ASSETS.fetch(request); // A-07
  },
} satisfies ExportedHandler<Env>;
