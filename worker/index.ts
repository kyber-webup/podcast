import { createRemoteJWKSet, jwtVerify } from "jose";

const AUDIO_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*\.mp3$/; // A-02
const CACHE_CONTROL = "private, max-age=31536000, immutable"; // A-06 : contenu authentifié, jamais public

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedTeamDomain: string | undefined;

/** NF-54 : défense en profondeur, désactivable via ENFORCE_ACCESS pour le développement local. */
async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  if (env.ENFORCE_ACCESS !== "true") {
    return true;
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return false;
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    return false;
  }

  try {
    if (!cachedJWKS || cachedTeamDomain !== env.ACCESS_TEAM_DOMAIN) {
      cachedJWKS = createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
      cachedTeamDomain = env.ACCESS_TEAM_DOMAIN;
    }
    await jwtVerify(token, cachedJWKS, {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
    });
    return true;
  } catch {
    return false;
  }
}

function withSecurityHeaders(headers: Headers): Headers {
  // NF-52 / NF-53, répétés ici car le Worker répond en direct sans passer par
  // les static assets (donc sans public/_headers) pour /audio/*.
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

/** A-03 : la forme échue peut être {offset, length} ou {suffix} selon le type R2Range. */
function contentRangeFor(range: R2Range, size: number): { offset: number; length: number } {
  if ("suffix" in range && typeof range.suffix === "number") {
    const suffix = Math.min(range.suffix, size);
    return { offset: size - suffix, length: suffix };
  }
  const offset = "offset" in range && typeof range.offset === "number" ? range.offset : 0;
  const length = "length" in range && typeof range.length === "number" ? range.length : size - offset;
  return { offset, length };
}

/**
 * R2 est permissif quand on lui transmet directement l'en-tête `Range` brut
 * (une plage hors limites est silencieusement ignorée, tout le fichier est
 * renvoyé) : on parse et valide donc nous-mêmes l'en-tête avant de construire
 * un R2Range explicite, pour obtenir un vrai 416 sur une plage invalide (A-04).
 */
function parseRangeHeader(header: string | null, size: number): R2Range | undefined | "invalid" {
  if (!header) {
    return undefined;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return "invalid";
  }
  const [, startText, endText] = match;
  if (startText === "" && endText === "") {
    return "invalid";
  }

  if (startText === "") {
    const suffix = Number(endText);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      return "invalid";
    }
    return { suffix: Math.min(suffix, size) };
  }

  const start = Number(startText);
  if (!Number.isInteger(start) || start < 0 || start >= size) {
    return "invalid";
  }

  if (endText === "") {
    return { offset: start, length: size - start };
  }

  const end = Number(endText);
  if (!Number.isInteger(end) || end < start) {
    return "invalid";
  }
  const clampedEnd = Math.min(end, size - 1);
  return { offset: start, length: clampedEnd - start + 1 };
}

async function handleAudio(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: withSecurityHeaders(new Headers({ Allow: "GET, HEAD" })) }); // A-01
  }

  if (!AUDIO_KEY_PATTERN.test(key)) {
    return new Response("Not Found", { status: 404, headers: withSecurityHeaders(new Headers()) }); // A-02
  }

  if (!(await isAuthorized(request, env))) {
    return new Response("Forbidden", { status: 403, headers: withSecurityHeaders(new Headers()) });
  }

  const isHead = request.method === "HEAD";

  const meta = await env.AUDIO.head(key);
  if (meta === null) {
    return new Response("Not Found", { status: 404, headers: withSecurityHeaders(new Headers()) }); // A-04
  }

  const range = parseRangeHeader(request.headers.get("Range"), meta.size);
  if (range === "invalid") {
    const headers = withSecurityHeaders(new Headers());
    headers.set("Content-Range", `bytes */${meta.size}`);
    return new Response("Range Not Satisfiable", { status: 416, headers }); // A-04
  }

  let object: R2Object | R2ObjectBody | null;
  try {
    object = await env.AUDIO.get(key, { onlyIf: request.headers, range });
  } catch {
    // Filet de sécurité si R2 rejette malgré tout la plage déjà validée ci-dessus.
    const headers = withSecurityHeaders(new Headers());
    headers.set("Content-Range", `bytes */${meta.size}`);
    return new Response("Range Not Satisfiable", { status: 416, headers }); // A-04
  }

  if (object === null) {
    return new Response("Not Found", { status: 404, headers: withSecurityHeaders(new Headers()) }); // A-04
  }

  const headers = withSecurityHeaders(new Headers());
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "audio/mpeg"); // A-05
  headers.set("Accept-Ranges", "bytes"); // A-05 : y compris sur les 200 (Safari en dépend)
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", CACHE_CONTROL);

  if (!("body" in object)) {
    // Condition (If-None-Match) non satisfaite : ressource non modifiée.
    return new Response(null, { status: 304, headers }); // A-04
  }

  // HEAD reçoit exactement les mêmes en-têtes/statut que GET, mais jamais de corps.
  const body = isHead ? null : object.body;

  if (request.headers.has("Range") && object.range) {
    const { offset, length } = contentRangeFor(object.range, object.size);
    headers.set("Content-Length", String(length));
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(body, { status: 206, headers }); // A-04
  }

  headers.set("Content-Length", String(object.size));
  return new Response(body, { status: 200, headers }); // A-04
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const audioPrefix = "/audio/";

    if (url.pathname.startsWith(audioPrefix)) {
      let key: string;
      try {
        key = decodeURIComponent(url.pathname.slice(audioPrefix.length));
      } catch {
        return new Response("Not Found", { status: 404, headers: withSecurityHeaders(new Headers()) });
      }
      return handleAudio(request, env, key);
    }

    return env.ASSETS.fetch(request); // A-07
  },
} satisfies ExportedHandler<Env>;
