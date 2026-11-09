/**
 * Vu-mètre de l'écran : anime les barres de la forme d'onde à partir du
 * spectre réel de l'audio en cours (Web Audio API).
 *
 * L'analyse n'est possible que parce que l'audio est servi depuis la même
 * origine que la page (route /audio/* du Worker) : une source cross-origin
 * sans CORS renverrait un spectre vide.
 *
 * Le graphe Web Audio n'analyse qu'une copie du flux : la lecture, elle, ne
 * passe jamais par lui (voir captureAudioStream).
 */

const FFT_SIZE = 2048;
const SMOOTHING = 0.75;
// Fenêtre centrée sur le fondamental de la voix (~200 Hz tombe alors au milieu
// du vu-mètre). Une plage plus large déportait toute l'activité sur les barres
// de gauche, là où une voix concentre son énergie.
const MIN_FREQUENCY_HZ = 70;
const MAX_FREQUENCY_HZ = 600;
// Fenêtre de niveaux calibrée sur l'épisode 002 (mixage de référence, proche de
// -16 LUFS), mesurée sur 20 s de parole : médiane des bandes -48,8 dB, p90 -40,8,
// p99 -36,3. Résultat visé et vérifié : barres à ~40 % en parole courante, 87 %
// au p90, plafond atteint environ 4 % du temps. Un mixage nettement plus bas
// (l'épisode 001) restera donc près du plancher : c'est voulu, le vu-mètre
// montre le niveau réel.
const MIN_DECIBELS = -58;
const MAX_DECIBELS = -35;
const MIN_BAR_HEIGHT = 1; // plancher pendant la lecture
// À la pause, les barres se figent puis retombent, comme l'aiguille d'un vu-mètre
// physique, au lieu de disparaître d'un coup.
const RELEASE_MS = 500;
const MAX_BAR_HEIGHT = 34; // base du vu-mètre à y = 37 (viewBox)
// Pondération par barre : léger rattrapage vers les aigus (la voix y perd de
// l'énergie) et cloche centrée, pour un pic visuel au milieu du vu-mètre.
// Valeurs réduites avec la nouvelle fenêtre : au-delà, les barres saturent.
const HIGH_FREQUENCY_TILT = 0.45;
const EDGE_GAIN = 0.8;
const MID_GAIN_BOOST = 0.15;

export type Visualizer = {
  start: () => void;
  stop: () => void;
};

type AudioContextConstructor = typeof AudioContext;

/** `captureStream` n'est pas encore dans les types DOM pour les éléments média. */
type CapturableMedia = HTMLAudioElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

/**
 * Copie du flux audio de l'élément, pour l'analyser sans toucher à sa sortie.
 *
 * L'approche précédente (`createMediaElementSource`) faisait passer tout le son
 * par le graphe Web Audio : quand le téléphone met l'écran en veille, le
 * navigateur suspend ce graphe et la lecture devient muette au bout de quelques
 * secondes. Avec une copie, l'élément continue de jouer normalement en arrière-plan
 * et seul le vu-mètre se fige.
 *
 * Safari ne sait pas encore copier un flux : il n'aura pas de vu-mètre, mais la
 * lecture, elle, fonctionne (F-70 à F-74).
 */
function captureAudioStream(element: HTMLAudioElement): MediaStream | undefined {
  const media = element as CapturableMedia;
  try {
    return media.captureStream?.() ?? media.mozCaptureStream?.();
  } catch {
    return undefined;
  }
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  return window.AudioContext ?? (window as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
}

/**
 * Répartit les barres sur une échelle logarithmique entre MIN_FREQUENCY_HZ et
 * MAX_FREQUENCY_HZ, comme le fait l'oreille — sinon les graves écrasent tout et
 * les barres de droite restent plates.
 */
function buildBinRanges(barCount: number, binCount: number, sampleRate: number): Array<[number, number]> {
  const binWidth = sampleRate / (binCount * 2);
  const toBin = (frequency: number) => Math.min(binCount - 1, Math.max(0, Math.round(frequency / binWidth)));
  const ratio = MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ;

  const ranges: Array<[number, number]> = [];
  let previousEnd = toBin(MIN_FREQUENCY_HZ);

  for (let index = 0; index < barCount; index += 1) {
    const upperFrequency = MIN_FREQUENCY_HZ * ratio ** ((index + 1) / barCount);
    const start = previousEnd;
    const end = Math.min(binCount, Math.max(start + 1, toBin(upperFrequency)));
    ranges.push([start, end]);
    previousEnd = end;
  }

  return ranges;
}

/** Gain par barre : pente croissante vers les aigus × cloche centrée. */
function buildGains(barCount: number): number[] {
  return Array.from({ length: barCount }, (_, index) => {
    const position = barCount > 1 ? index / (barCount - 1) : 0;
    const tilt = 1 + HIGH_FREQUENCY_TILT * position;
    const bell = EDGE_GAIN + MID_GAIN_BOOST * Math.sin((Math.PI * (index + 0.5)) / barCount);
    return tilt * bell;
  });
}

export function createVisualizer(audio: HTMLAudioElement, bars: SVGLineElement[]): Visualizer {
  const baseline = Number(bars[0]?.getAttribute("y1") ?? 0);
  const gains = buildGains(bars.length);
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  let context: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  /** Vrai tant que le flux du fichier en cours n'a pas été capté. */
  let needsSource = true;
  let spectrum: Uint8Array<ArrayBuffer> | undefined;
  let ranges: Array<[number, number]> = [];
  let frameId = 0;
  let graphFailed = false;

  const setHeights = (heights: number[]): void => {
    bars.forEach((bar, index) => {
      bar.setAttribute("y2", String(baseline - heights[index]));
    });
  };

  /**
   * Branche l'élément audio sur un analyseur, une seule fois. En cas d'échec on
   * abandonne définitivement le vu-mètre : la lecture, elle, n'est pas affectée.
   */
  const ensureGraph = (): boolean => {
    if (graphFailed) {
      return false;
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      graphFailed = true;
      return false;
    }

    try {
      if (!context || !analyser) {
        context = new AudioContextCtor();
        const node = context.createAnalyser();
        node.fftSize = FFT_SIZE;
        node.smoothingTimeConstant = SMOOTHING;
        node.minDecibels = MIN_DECIBELS;
        node.maxDecibels = MAX_DECIBELS;
        analyser = node;
        spectrum = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
        ranges = buildBinRanges(bars.length, node.frequencyBinCount, context.sampleRate);
      }

      // Une copie de flux ne vaut que pour le fichier en cours : au changement
      // d'épisode, sa piste se termine et l'analyseur ne reçoit plus rien. On la
      // reprend donc à chaque nouvelle source (voir l'écouteur "loadstart").
      if (needsSource) {
        const stream = captureAudioStream(audio);
        if (!stream) {
          graphFailed = true;
          return false;
        }
        source?.disconnect();
        source = context.createMediaStreamSource(stream);
        // Analyse seulement : le son sort par l'élément <audio>, pas par le
        // graphe. Rien n'est donc branché sur context.destination.
        source.connect(analyser);
        needsSource = false;
      }

      void context.resume();
      return true;
    } catch {
      graphFailed = true;
      return false;
    }
  };

  // Nouveau fichier chargé dans l'élément : la copie de flux précédente est morte.
  audio.addEventListener("loadstart", () => {
    needsSource = true;
  });

  /** Retombée des barres après la pause : de leur hauteur figée jusqu'à zéro. */
  const release = (from: number[], startedAt: number): void => {
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, 1 - elapsed / RELEASE_MS);

    setHeights(from.map((height) => height * remaining));

    if (remaining > 0) {
      frameId = requestAnimationFrame(() => release(from, startedAt));
    } else {
      frameId = 0;
    }
  };

  const render = (): void => {
    if (!analyser || !spectrum) {
      return;
    }

    analyser.getByteFrequencyData(spectrum);

    const heights = ranges.map(([start, end], index) => {
      // Crête plutôt que moyenne : les barres de droite couvrent beaucoup de
      // bandes, une moyenne y écraserait toute la dynamique.
      let peak = 0;
      let total = 0;
      for (let bin = start; bin < end; bin += 1) {
        const value = spectrum![bin];
        total += value;
        if (value > peak) {
          peak = value;
        }
      }
      const average = total / Math.max(1, end - start);
      const mixed = peak * 0.75 + average * 0.25;
      const level = Math.min(1, (mixed / 255) * gains[index]);
      return MIN_BAR_HEIGHT + level * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
    });

    setHeights(heights);
    frameId = requestAnimationFrame(render);
  };

  return {
    start: () => {
      if (prefersReducedMotion || bars.length === 0 || !ensureGraph()) {
        return;
      }
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(render);
    },
    stop: () => {
      cancelAnimationFrame(frameId);
      frameId = 0;

      const frozen = bars.map((bar) => baseline - Number(bar.getAttribute("y2") ?? baseline));
      if (prefersReducedMotion || frozen.every((height) => height <= 0)) {
        setHeights(bars.map(() => 0)); // au repos : barres à zéro, donc invisibles
        return;
      }
      release(frozen, performance.now());
    },
  };
}
