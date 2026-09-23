import { formatTime, toSpokenTime } from "../lib/time";
import { formatChapterLabel, getCurrentChapterIndex, type Chapter } from "../lib/chapters";
import { STORAGE_KEY, parseState, updateEpisodeState, writeState, type StoredState } from "../lib/storage";
import {
  setMediaSessionHandlers,
  setMediaSessionChapterHandlers,
  updateMediaSessionMetadata,
  updateMediaSessionPositionState,
} from "./media-session";
import { createVisualizer } from "./visualizer";

type EpisodeData = {
  id: string;
  title: string;
  hosts: string[];
  date: string;
  duration: number;
  audioSrc: string;
  chapters: Chapter[];
};

const SMALL_SEEK_STEP_SECONDS = 5;
const LARGE_SEEK_STEP_SECONDS = 60;
const SKIP_SECONDS = 15;
const SAVE_THROTTLE_MS = 5000;
const COMPLETED_RATIO = 0.95;
const RESUME_END_MARGIN_SECONDS = 5;
const DURATION_MISMATCH_THRESHOLD_SECONDS = 2;
const PODCAST_NAME = "DevNote";

function readEpisodesData(): EpisodeData[] {
  const node = document.getElementById("episodes-data");
  if (!node?.textContent) {
    return [];
  }
  try {
    const data: unknown = JSON.parse(node.textContent);
    return Array.isArray(data) ? (data as EpisodeData[]) : [];
  } catch {
    return [];
  }
}

function readStoredState(): StoredState {
  try {
    return parseState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseState(null);
  }
}

function persistState(state: StoredState): void {
  writeState(state, (key, value) => localStorage.setItem(key, value));
}

function resolveInitialEpisode(episodes: EpisodeData[], stored: StoredState): EpisodeData {
  const requestedId = new URLSearchParams(window.location.search).get("e");
  const byId = (id: string) => episodes.find((episode) => episode.id === id);

  return (requestedId && byId(requestedId)) || (stored.lastEpisodeId && byId(stored.lastEpisodeId)) || episodes[0];
}

function resolveInitialPosition(position: number, duration: number, completed: boolean): number {
  if (!completed && duration > 0 && position > duration - RESUME_END_MARGIN_SECONDS) {
    return 0;
  }
  return position;
}

function computeIsCompleted(position: number, duration: number): boolean {
  return duration > 0 && position / duration > COMPLETED_RATIO;
}

function initPlayer(): void {
  const audio = document.getElementById("audio");
  const playPauseButton = document.getElementById("btn-play-pause");
  const playIcon = document.getElementById("icon-play");
  const pauseIcon = document.getElementById("icon-pause");
  const playPauseLabel = document.getElementById("btn-play-pause-label");
  const backButton = document.getElementById("btn-back-15");
  const forwardButton = document.getElementById("btn-forward-15");
  const seek = document.getElementById("seek");
  const timeCurrentEl = document.getElementById("time-current");
  const timeBigEl = document.getElementById("time-big");
  const timeGhostEl = document.getElementById("time-ghost");
  const timeDurationEl = document.getElementById("time-duration");
  const errorBox = document.getElementById("player-error");
  const retryButton = document.getElementById("btn-retry");
  const episodeTitleEl = document.getElementById("player-episode-title");
  const hostsEl = document.getElementById("player-hosts");
  const chapterTitleEl = document.getElementById("player-chapter-title");
  const prevChapterButton = document.getElementById("btn-prev-chapter");
  const nextChapterButton = document.getElementById("btn-next-chapter");

  if (
    !(audio instanceof HTMLAudioElement) ||
    !(playPauseButton instanceof HTMLElement) ||
    !(playIcon instanceof HTMLElement) ||
    !(pauseIcon instanceof HTMLElement) ||
    !(playPauseLabel instanceof HTMLElement) ||
    !(backButton instanceof HTMLElement) ||
    !(forwardButton instanceof HTMLElement) ||
    !(seek instanceof HTMLInputElement) ||
    !(timeCurrentEl instanceof HTMLElement) ||
    !(timeBigEl instanceof HTMLElement) ||
    !(timeGhostEl instanceof HTMLElement) ||
    !(timeDurationEl instanceof HTMLElement) ||
    !(errorBox instanceof HTMLElement) ||
    !(retryButton instanceof HTMLButtonElement) ||
    !(episodeTitleEl instanceof HTMLElement) ||
    !(hostsEl instanceof HTMLElement) ||
    !(chapterTitleEl instanceof HTMLElement) ||
    !(prevChapterButton instanceof HTMLButtonElement) ||
    !(nextChapterButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  const episodes = readEpisodesData();
  if (episodes.length === 0) {
    return;
  }

  const waveformBars = Array.from(document.querySelectorAll<SVGLineElement>("#waveform line"));
  const visualizer = createVisualizer(audio, waveformBars);

  let storedState = readStoredState();
  let currentEpisode: EpisodeData | undefined;
  let duration = 0;
  let isSeeking = false;
  let lastSaveTime = 0;
  // Distingue une vraie pause d'un `pause` parasite émis par audio.load()
  // au changement d'épisode, qui ne doit pas sortir de l'état « idle ».
  let hasStartedCurrentEpisode = false;
  let currentChapterIndex = -1;

  /**
   * « idle » tant que l'épisode courant n'a pas été lancé : bouton central
   * neutre comme ses voisins.
   */
  const setPlaybackState = (state: "idle" | "playing" | "paused"): void => {
    playPauseButton.dataset.state = state;
    playPauseLabel.textContent = state === "playing" ? "Pause" : "Lecture";
    playIcon.hidden = state === "playing";
    pauseIcon.hidden = state !== "playing";
  };

  const updateTimeDisplay = (position: number): void => {
    const formatted = formatTime(position, { pad: true });
    timeCurrentEl.textContent = formatted;
    timeBigEl.textContent = formatted;
    // Segments éteints derrière le minuteur : mêmes caractères, tous à 8.
    timeGhostEl.textContent = formatted.replace(/\d/g, "8");
    seek.setAttribute("aria-valuetext", `${toSpokenTime(position)} sur ${toSpokenTime(duration)}`);
    // Peint la portion écoutée de la piste (voir #seek dans global.css).
    const percent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
    seek.style.setProperty("--seek-progress", `${percent}%`);
  };

  const clampToDuration = (seconds: number): number => {
    const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    return Math.min(Math.max(seconds, 0), max);
  };

  const hideError = (): void => {
    errorBox.hidden = true;
  };

  const showError = (): void => {
    errorBox.hidden = false;
  };

  const renderHosts = (hosts: string[]): void => {
    hostsEl.querySelectorAll<HTMLElement>("[data-host]").forEach((chip) => {
      const isHost = hosts.includes(chip.dataset.host ?? "");
      chip.dataset.active = String(isHost);
      chip.toggleAttribute("aria-hidden", !isHost);
    });
  };

  const renderChapterState = (chapters: Chapter[], currentIndex: number): void => {
    const hasChapters = chapters.length > 0;

    const currentChapter = currentIndex >= 0 ? chapters[currentIndex] : undefined;
    chapterTitleEl.hidden = !currentChapter;
    chapterTitleEl.textContent = currentChapter ? formatChapterLabel(currentIndex, currentChapter.title) : "";

    prevChapterButton.disabled = !(currentIndex > 0);
    nextChapterButton.disabled = !(hasChapters && currentIndex < chapters.length - 1);
  };

  const setActiveChapter = (chapters: Chapter[], newIndex: number): void => {
    if (newIndex === currentChapterIndex) {
      return; // F-52 : ne rien toucher au DOM quand le chapitre n'a pas changé
    }
    currentChapterIndex = newIndex;
    renderChapterState(chapters, newIndex);
  };

  const goToChapter = (chapters: Chapter[], index: number): void => {
    const chapter = chapters[index];
    if (!chapter) {
      return;
    }
    const wasPlaying = !audio.paused;
    audio.currentTime = chapter.start; // F-51
    seek.value = String(Math.round(chapter.start));
    updateTimeDisplay(chapter.start);
    setActiveChapter(chapters, index);
    if (wasPlaying) {
      audio.play().catch(showError);
    }
  };

  const applyStateChange = (nextState: StoredState): void => {
    storedState = nextState;
    persistState(storedState);
  };

  const updateEpisodeListCurrent = (episodeId: string): void => {
    document.querySelectorAll<HTMLLIElement>("li[data-episode-id]").forEach((row) => {
      if (row.dataset.episodeId === episodeId) {
        row.setAttribute("aria-current", "true");
      } else {
        row.removeAttribute("aria-current");
      }
    });
  };

  const savePosition = (position: number, options: { force?: boolean } = {}): void => {
    if (!currentEpisode) {
      return;
    }
    const now = Date.now();
    if (!options.force && now - lastSaveTime < SAVE_THROTTLE_MS) {
      return;
    }
    lastSaveTime = now;

    applyStateChange(
      updateEpisodeState(
        storedState,
        currentEpisode.id,
        { position: Math.round(position), completed: computeIsCompleted(position, duration) },
        new Date(),
      ),
    );
  };

  // Ne démarre jamais la lecture : sélectionner un épisode le charge à sa position
  // sauvegardée, l'utilisateur appuie ensuite sur Lecture (décision de Simon).
  const loadEpisode = (episode: EpisodeData): void => {
    if (currentEpisode && currentEpisode.id !== episode.id) {
      savePosition(audio.currentTime, { force: true }); // F-47
    }

    currentEpisode = episode;
    duration = episode.duration;

    episodeTitleEl.textContent = episode.title;
    renderHosts(episode.hosts);
    document.title = `${episode.title} — ${PODCAST_NAME}`;

    const stored = storedState.episodes[episode.id];
    const initialPosition = resolveInitialPosition(stored?.position ?? 0, duration, stored?.completed ?? false);

    seek.max = String(Math.round(duration));
    seek.value = String(Math.round(initialPosition));
    timeDurationEl.textContent = formatTime(duration, { pad: true });
    updateTimeDisplay(initialPosition); // F-41 : avant tout chargement audio

    currentChapterIndex = getCurrentChapterIndex(episode.chapters, initialPosition);
    renderChapterState(episode.chapters, currentChapterIndex);

    updateMediaSessionMetadata(episode.title); // F-71
    setMediaSessionChapterHandlers(
      episode.chapters.length > 0
        ? {
            onPrevious: () => goToChapter(episode.chapters, currentChapterIndex - 1),
            onNext: () => goToChapter(episode.chapters, currentChapterIndex + 1),
          }
        : null,
    ); // F-73
    updateMediaSessionPositionState(duration, initialPosition, audio.playbackRate); // F-74

    hasStartedCurrentEpisode = false;
    setPlaybackState("idle");

    hideError();
    audio.src = episode.audioSrc;
    audio.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          const gap = Math.abs(audio.duration - duration);
          if (gap > DURATION_MISMATCH_THRESHOLD_SECONDS) {
            console.warn(
              `Durée réelle différente de la durée déclarée pour "${episode.audioSrc}" : ${duration}s déclarées, ${Math.round(audio.duration)}s réelles.`,
            );
            duration = audio.duration;
            seek.max = String(Math.round(duration));
            timeDurationEl.textContent = formatTime(duration, { pad: true });
          }
        }
        audio.currentTime = initialPosition; // F-42
        updateTimeDisplay(initialPosition);
        updateMediaSessionPositionState(duration, initialPosition, audio.playbackRate); // F-74
      },
      { once: true },
    );
    audio.load();

    applyStateChange(
      updateEpisodeState(
        storedState,
        episode.id,
        { openedAt: stored?.openedAt ?? new Date().toISOString() },
        new Date(),
      ),
    );

    history.replaceState(null, "", `?e=${episode.id}`); // F-46
    updateEpisodeListCurrent(episode.id);
  };

  setMediaSessionHandlers({
    onPlay: () => {
      hideError();
      audio.play().catch(showError);
    },
    onPause: () => audio.pause(),
    onSeekBackward: (offset) => {
      audio.currentTime = clampToDuration(audio.currentTime - offset);
    },
    onSeekForward: (offset) => {
      audio.currentTime = clampToDuration(audio.currentTime + offset);
    },
    onSeekTo: (time) => {
      audio.currentTime = clampToDuration(time);
    },
  }); // F-72

  audio.addEventListener("play", () => {
    hasStartedCurrentEpisode = true;
    setPlaybackState("playing");
    visualizer.start();
  });
  audio.addEventListener("pause", () => {
    setPlaybackState(hasStartedCurrentEpisode ? "paused" : "idle");
    visualizer.stop();
    savePosition(audio.currentTime, { force: true }); // F-43
  });

  audio.addEventListener("seeked", () => {
    savePosition(audio.currentTime, { force: true }); // F-43
    updateMediaSessionPositionState(duration, audio.currentTime, audio.playbackRate); // F-74
  });

  audio.addEventListener("ratechange", () => {
    updateMediaSessionPositionState(duration, audio.currentTime, audio.playbackRate); // F-74
  });

  audio.addEventListener("timeupdate", () => {
    if (isSeeking || !currentEpisode) {
      return;
    }
    seek.value = String(Math.round(audio.currentTime));
    updateTimeDisplay(audio.currentTime);
    setActiveChapter(currentEpisode.chapters, getCurrentChapterIndex(currentEpisode.chapters, audio.currentTime));
    if (!audio.paused) {
      savePosition(audio.currentTime); // F-43, throttlé
    }
  });

  audio.addEventListener("ended", () => {
    if (!currentEpisode) {
      return;
    }
    applyStateChange(updateEpisodeState(storedState, currentEpisode.id, { position: 0, completed: true }, new Date())); // F-44
    hasStartedCurrentEpisode = false;
    setPlaybackState("idle");
    seek.value = "0";
    updateTimeDisplay(0);
  });

  audio.addEventListener("waiting", () => playPauseButton.classList.add("animate-pulse"));
  audio.addEventListener("playing", () => playPauseButton.classList.remove("animate-pulse"));
  audio.addEventListener("error", showError);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      savePosition(audio.currentTime, { force: true }); // F-43
    }
  });

  window.addEventListener("pagehide", () => {
    savePosition(audio.currentTime, { force: true }); // F-43
  });

  playPauseButton.addEventListener("click", () => {
    if (audio.paused) {
      hideError();
      audio.play().catch(showError);
    } else {
      audio.pause();
    }
  });

  backButton.addEventListener("click", () => {
    audio.currentTime = clampToDuration(audio.currentTime - SKIP_SECONDS);
  });

  forwardButton.addEventListener("click", () => {
    audio.currentTime = clampToDuration(audio.currentTime + SKIP_SECONDS);
  });

  seek.addEventListener("input", () => {
    isSeeking = true;
    updateTimeDisplay(Number(seek.value));
  });

  seek.addEventListener("change", () => {
    isSeeking = false;
    audio.currentTime = Number(seek.value);
  });

  seek.addEventListener("keydown", (event) => {
    let delta = 0;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        delta = -SMALL_SEEK_STEP_SECONDS;
        break;
      case "ArrowRight":
      case "ArrowUp":
        delta = SMALL_SEEK_STEP_SECONDS;
        break;
      case "PageDown":
        delta = -LARGE_SEEK_STEP_SECONDS;
        break;
      case "PageUp":
        delta = LARGE_SEEK_STEP_SECONDS;
        break;
      default:
        // Home / End gardent leur comportement natif (0 / durée).
        return;
    }

    event.preventDefault();
    const next = clampToDuration(Number(seek.value) + delta);
    seek.value = String(next);
    isSeeking = false;
    updateTimeDisplay(next);
    audio.currentTime = next;
  });

  retryButton.addEventListener("click", () => {
    hideError();
    audio.load();
    audio.play().catch(showError);
  });

  prevChapterButton.addEventListener("click", () => {
    if (currentEpisode) {
      goToChapter(currentEpisode.chapters, currentChapterIndex - 1);
    }
  });

  nextChapterButton.addEventListener("click", () => {
    if (currentEpisode) {
      goToChapter(currentEpisode.chapters, currentChapterIndex + 1);
    }
  });

  document.querySelectorAll<HTMLElement>(".episode-play-button").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.episodeId;
      const episode = episodes.find((candidate) => candidate.id === id);
      if (episode) {
        loadEpisode(episode); // F-34 : le focus reste sur ce bouton
      }
    });
  });

  loadEpisode(resolveInitialEpisode(episodes, storedState)); // F-20 : jamais d'autoplay
}

initPlayer();
