import { handleAudio, type AudioEnv } from "../../server/audio";

/**
 * Cloudflare Pages : `/audio/<fichier>.mp3`. Pages ne lit pas `wrangler.jsonc`
 * pour les liaisons — le bucket R2 doit être déclaré comme liaison `AUDIO` dans
 * les réglages du projet (voir README, section « Mise en ligne »).
 */
export const onRequest: PagesFunction<AudioEnv, "name"> = (context) =>
  handleAudio(context.request, context.env, String(context.params.name));
