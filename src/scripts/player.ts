import { formatTime, toGhostTime, toSpokenTime } from "../lib/time";
import { formatChapterLabel, getCurrentChapterIndex, type Chapter } from "../lib/chapters";
import {
  findInitialEpisode,
  getResumePosition,
  getSeekKeyStep,
  isCompleted,
  type PlayerEpisode,
} from "../lib/playback";
import { updateEpisodeState, type StoredState } from "../lib/storage";
import {
  setMediaSessionHandlers,
  setMediaSessionChapterHandlers,
  updateMediaSessionMetadata,
  updateMediaSessionPositionState,
} from "./media-session";
import { getPlayerElements } from "./player-elements";
import { readEpisodes, readStoredState, writeStoredState } from "./player-data";
import { createVisualizer } from "./visualizer";

const SKIP_SECONDS = 15;
const SAVE_THROTTLE_MS = 5000;
const DURATION_MISMATCH_THRESHOLD_SECONDS = 2;
const PODCAST_NAME = "DevNote";

function initPlayer(): void {
  const {
    audio,
    playPauseButton,
    playIcon,
    pauseIcon,
    playPauseLabel,
    skipBackButton,
    skipForwardButton,
    previousChapterButton,
    nextChapterButton,
    seekBar,
    elapsedTime,
    totalDuration,
    screenTime,
    screenTimeGhost,
    episodeTitle,
    hostList,
    chapterTitle,
    errorMessage,
    retryButton,
    waveformBars,
    episodeRows,
    episodeButtons,
  } = getPlayerElements();

  const episodes = readEpisodes();
  if (episodes.length === 0) {
    return;
  }

  const visualizer = createVisualizer(audio, waveformBars);

  let storedState = readStoredState();
  let currentEpisode: PlayerEpisode | undefined;
  let duration = 0;
  let isSeeking = false;
  let lastSaveTime = 0;
  // Distingue une vraie pause d'un `pause` parasite émis par audio.load()
  // au changement d'épisode, qui ne doit pas sortir de l'état « idle ».
  let hasStartedCurrentEpisode = false;
  let currentChapterIndex = -1;

  /** « idle » tant que l'épisode courant n'a pas été lancé : bouton central neutre comme ses voisins. */
  const setPlaybackState = (state: "idle" | "playing" | "paused"): void => {
    playPauseButton.dataset.state = state;
    playPauseLabel.textContent = state === "playing" ? "Pause" : "Lecture";
    playIcon.hidden = state === "playing";
    pauseIcon.hidden = state !== "playing";
  };

  const updateTimeDisplay = (position: number): void => {
    const formatted = formatTime(position, { pad: true });
    elapsedTime.textContent = formatted;
    screenTime.textContent = formatted;
    screenTimeGhost.textContent = toGhostTime(formatted);
    seekBar.setAttribute("aria-valuetext", `${toSpokenTime(position)} sur ${toSpokenTime(duration)}`);
    const percent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
    seekBar.style.setProperty("--seek-progress", `${percent}%`);
  };

  const clampToDuration = (seconds: number): number => {
    const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    return Math.min(Math.max(seconds, 0), max);
  };

  const hideError = (): void => {
    errorMessage.hidden = true;
  };

  const showError = (): void => {
    errorMessage.hidden = false;
  };

  const play = (): void => {
    hideError();
    audio.play().catch(showError);
  };

  const renderHosts = (hosts: string[]): void => {
    hostList.querySelectorAll<HTMLElement>("[data-host]").forEach((chip) => {
      const isHost = hosts.includes(chip.dataset.host ?? "");
      chip.dataset.active = String(isHost);
      chip.toggleAttribute("aria-hidden", !isHost);
    });
  };

  const renderChapterState = (chapters: Chapter[], currentIndex: number): void => {
    const currentChapter = currentIndex >= 0 ? chapters[currentIndex] : undefined;
    chapterTitle.hidden = !currentChapter;
    chapterTitle.textContent = currentChapter ? formatChapterLabel(currentIndex, currentChapter.title) : "";

    previousChapterButton.disabled = currentIndex <= 0;
    nextChapterButton.disabled = currentIndex >= chapters.length - 1;
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
    seekBar.value = String(Math.round(chapter.start));
    updateTimeDisplay(chapter.start);
    setActiveChapter(chapters, index);
    if (wasPlaying) {
      audio.play().catch(showError);
    }
  };

  /** Seul point d'écriture de l'état sauvegardé : en mémoire et dans localStorage. */
  const saveState = (nextState: StoredState): void => {
    storedState = nextState;
    writeStoredState(storedState);
  };

  const markCurrentEpisodeRow = (episodeId: string): void => {
    episodeRows.forEach((row) => {
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

    saveState(
      updateEpisodeState(
        storedState,
        currentEpisode.id,
        { position: Math.round(position), completed: isCompleted(position, duration) },
        new Date(),
      ),
    );
  };

  const setDisplayedDuration = (seconds: number): void => {
    duration = seconds;
    seekBar.max = String(Math.round(duration));
    totalDuration.textContent = formatTime(duration, { pad: true });
  };

  // Ne démarre jamais la lecture : sélectionner un épisode le charge à sa position
  // sauvegardée, l'utilisateur appuie ensuite sur Lecture (décision de Simon).
  const loadEpisode = (episode: PlayerEpisode): void => {
    if (currentEpisode && currentEpisode.id !== episode.id) {
      savePosition(audio.currentTime, { force: true }); // F-47
    }

    currentEpisode = episode;

    episodeTitle.textContent = episode.title;
    renderHosts(episode.hosts);
    document.title = `${episode.title} — ${PODCAST_NAME}`;

    const stored = storedState.episodes[episode.id];
    const initialPosition = getResumePosition(stored?.position ?? 0, episode.duration, stored?.completed ?? false);

    setDisplayedDuration(episode.duration);
    seekBar.value = String(Math.round(initialPosition));
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
            setDisplayedDuration(audio.duration); // F-48
          }
        }
        audio.currentTime = initialPosition; // F-42
        updateTimeDisplay(initialPosition);
        updateMediaSessionPositionState(duration, initialPosition, audio.playbackRate); // F-74
      },
      { once: true },
    );
    audio.load();

    saveState(
      updateEpisodeState(
        storedState,
        episode.id,
        { openedAt: stored?.openedAt ?? new Date().toISOString() },
        new Date(),
      ),
    );

    history.replaceState(null, "", `?e=${episode.id}`); // F-46
    markCurrentEpisodeRow(episode.id);
  };

  setMediaSessionHandlers({
    onPlay: play,
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
    seekBar.value = String(Math.round(audio.currentTime));
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
    saveState(updateEpisodeState(storedState, currentEpisode.id, { position: 0, completed: true }, new Date())); // F-44
    hasStartedCurrentEpisode = false;
    setPlaybackState("idle");
    seekBar.value = "0";
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
      play();
    } else {
      audio.pause();
    }
  });

  skipBackButton.addEventListener("click", () => {
    audio.currentTime = clampToDuration(audio.currentTime - SKIP_SECONDS);
  });

  skipForwardButton.addEventListener("click", () => {
    audio.currentTime = clampToDuration(audio.currentTime + SKIP_SECONDS);
  });

  seekBar.addEventListener("input", () => {
    isSeeking = true;
    updateTimeDisplay(Number(seekBar.value));
  });

  seekBar.addEventListener("change", () => {
    isSeeking = false;
    audio.currentTime = Number(seekBar.value);
  });

  seekBar.addEventListener("keydown", (event) => {
    const step = getSeekKeyStep(event.key);
    if (step === null) {
      return;
    }

    event.preventDefault();
    const position = clampToDuration(Number(seekBar.value) + step);
    seekBar.value = String(position);
    isSeeking = false;
    updateTimeDisplay(position);
    audio.currentTime = position;
  });

  retryButton.addEventListener("click", () => {
    hideError();
    audio.load();
    audio.play().catch(showError);
  });

  previousChapterButton.addEventListener("click", () => {
    if (currentEpisode) {
      goToChapter(currentEpisode.chapters, currentChapterIndex - 1);
    }
  });

  nextChapterButton.addEventListener("click", () => {
    if (currentEpisode) {
      goToChapter(currentEpisode.chapters, currentChapterIndex + 1);
    }
  });

  episodeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const episode = episodes.find((candidate) => candidate.id === button.dataset.episodeId);
      if (episode) {
        loadEpisode(episode); // F-34 : le focus reste sur ce bouton
      }
    });
  });

  const requestedId = new URLSearchParams(window.location.search).get("e");
  loadEpisode(findInitialEpisode(episodes, requestedId, storedState.lastEpisodeId)); // F-20 : jamais d'autoplay
}

initPlayer();
