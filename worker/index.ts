// Implémenté à l'étape 9 : route /audio/<fichier> servie depuis R2 (binding AUDIO),
// avec Range requests et vérification du JWT Cloudflare Access (NF-54).
export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response("Not implemented yet", { status: 501 });
  },
};
