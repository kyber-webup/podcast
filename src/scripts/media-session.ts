const PODCAST_NAME = "DevNote";
const DEFAULT_SEEK_OFFSET_SECONDS = 15;

export type MediaSessionHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onSeekBackward: (offsetSeconds: number) => void;
  onSeekForward: (offsetSeconds: number) => void;
  onSeekTo: (timeSeconds: number) => void;
};

export type ChapterHandlers = {
  onPrevious: () => void;
  onNext: () => void;
} | null;

function isMediaSessionSupported(): boolean {
  return "mediaSession" in navigator; // F-70
}

export function setMediaSessionHandlers(handlers: MediaSessionHandlers): void {
  if (!isMediaSessionSupported()) {
    return;
  }
  const mediaSession = navigator.mediaSession;

  mediaSession.setActionHandler("play", handlers.onPlay);
  mediaSession.setActionHandler("pause", handlers.onPause);
  mediaSession.setActionHandler("seekbackward", (details) => {
    handlers.onSeekBackward(details.seekOffset ?? DEFAULT_SEEK_OFFSET_SECONDS);
  });
  mediaSession.setActionHandler("seekforward", (details) => {
    handlers.onSeekForward(details.seekOffset ?? DEFAULT_SEEK_OFFSET_SECONDS);
  });
  mediaSession.setActionHandler("seekto", (details) => {
    if (typeof details.seekTime === "number") {
      handlers.onSeekTo(details.seekTime);
    }
  });
}

export function setMediaSessionChapterHandlers(handlers: ChapterHandlers): void {
  if (!isMediaSessionSupported()) {
    return;
  }
  // F-73 : uniquement si l'épisode a des chapitres, sinon les actions ne sont pas enregistrées.
  navigator.mediaSession.setActionHandler("previoustrack", handlers ? handlers.onPrevious : null);
  navigator.mediaSession.setActionHandler("nexttrack", handlers ? handlers.onNext : null);
}

export function updateMediaSessionMetadata(title: string): void {
  if (!isMediaSessionSupported()) {
    return;
  }
  // F-71 : pochette 512×512 et variante 256×256.
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: PODCAST_NAME,
    artwork: [
      { src: "/cover-256.png", sizes: "256x256", type: "image/png" },
      { src: "/cover-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
}

export function updateMediaSessionPositionState(duration: number, position: number, playbackRate: number): void {
  if (!isMediaSessionSupported() || !("setPositionState" in navigator.mediaSession)) {
    return;
  }
  try {
    // F-74 : dans un try/catch, la position peut être temporairement incohérente
    // (durée pas encore connue, position momentanément hors bornes pendant un seek).
    navigator.mediaSession.setPositionState({
      duration: Math.max(0, duration),
      playbackRate,
      position: Math.min(Math.max(0, position), Math.max(0, duration)),
    });
  } catch {
    // Ignoré volontairement : un état de position manqué n'est pas critique.
  }
}
