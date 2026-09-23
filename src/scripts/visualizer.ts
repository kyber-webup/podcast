/**
 * Vu-mètre de l'écran : anime les barres de la forme d'onde à partir du
 * spectre réel de l'audio en cours (Web Audio API).
 *
 * L'analyse n'est possible que parce que l'audio est servi depuis la même
 * origine que la page (route /audio/* du Worker) : une source cross-origin
 * sans CORS renverrait un spectre vide.
 */

const FFT_SIZE = 2048;
const SMOOTHING = 0.75;
// Fenêtre centrée sur le fondamental de la voix (~200 Hz tombe alors au milieu
// du vu-mètre). Une plage plus large déportait toute l'activité sur les barres
// de gauche, là où une voix concentre son énergie.
const MIN_FREQUENCY_HZ = 70;
const MAX_FREQUENCY_HZ = 800;
// Fenêtre de niveaux resserrée par rapport aux valeurs par défaut (-100/-30 dB),
// qui écrasent la dynamique d'une voix parlée.
const MIN_DECIBELS = -80;
const MAX_DECIBELS = -32;
const MIN_BAR_HEIGHT = 1; // plancher pendant la lecture
// À la pause, les barres se figent puis retombent, comme l'aiguille d'un vu-mètre
// physique, au lieu de disparaître d'un coup.
const RELEASE_MS = 500;
const MAX_BAR_HEIGHT = 34; // base du vu-mètre à y = 37 (viewBox)
// Pondération par barre : léger rattrapage vers les aigus (la voix y perd de
// l'énergie) et cloche centrée, pour un pic visuel au milieu du vu-mètre.
const HIGH_FREQUENCY_TILT = 1;
const EDGE_GAIN = 0.75;
const MID_GAIN_BOOST = 0.5;

export type Visualizer = {
  start: () => void;
  stop: () => void;
};

type AudioContextConstructor = typeof AudioContext;

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

  let analyser: AnalyserNode | undefined;
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
    if (analyser) {
      return true;
    }
    if (graphFailed) {
      return false;
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      graphFailed = true;
      return false;
    }

    try {
      const context = new AudioContextCtor();
      const source = context.createMediaElementSource(audio);
      const node = context.createAnalyser();
      node.fftSize = FFT_SIZE;
      node.smoothingTimeConstant = SMOOTHING;
      node.minDecibels = MIN_DECIBELS;
      node.maxDecibels = MAX_DECIBELS;

      // Le son transite désormais par le graphe : il doit rejoindre la sortie.
      source.connect(node);
      node.connect(context.destination);
      void context.resume();

      analyser = node;
      spectrum = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
      ranges = buildBinRanges(bars.length, node.frequencyBinCount, context.sampleRate);
      return true;
    } catch {
      graphFailed = true;
      return false;
    }
  };

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
      const level = Math.min(1, (mixed / 255) * gains[index]) ** 0.85;
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
