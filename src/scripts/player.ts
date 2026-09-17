import { formatTime, toSpokenTime } from "../lib/time";
import { getCurrentChapterIndex, type Chapter } from "../lib/chapters";
import { getEpisodeBadge } from "../lib/badges";
import { STORAGE_KEY, parseState, updateEpisodeState, writeState, type StoredState } from "../lib/storage";
import {
  setMediaSessionHandlers,
  setMediaSessionChapterHandlers,
  updateMediaSessionMetadata,
  updateMediaSessionPositionState,
} from "./media-session";

type EpisodeData = {
  id: string;
  title: string;
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

const PLAY_ICON_PATH = "M8 5v14l11-7z";
const PAUSE_ICON_PATH = "M7 5h4v14H7zM13 5h4v14h-4z";
const CHAPTER_BUTTON_CLASS =
  "flex w-full min-h-11 items-center gap-3 rounded-control px-3 py-2 text-left text-slate-700 aria-[current=true]:bg-accent aria-[current=true]:font-semibold aria-[current=true]:text-accent-contrast hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";
const BADGE_COMPLETED_CLASS =
  "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
const BADGE_IN_PROGRESS_CLASS = "flex items-center gap-2 text-xs font-medium text-accent";
const BADGE_NEW_CLASS =
  "inline-flex items-center rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-contrast";

const buildCompletedBadge = (): HTMLElement => {
  const p = document.createElement("p");
  p.className = BADGE_COMPLETED_CLASS;
  p.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 20 20" class="h-4 w-4" fill="currentColor"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clip-rule="evenodd"></path></svg>Écouté';
  return p;
};

const buildInProgressBadge = (percent: number): HTMLElement => {
  const p = document.createElement("p");
  p.className = BADGE_IN_PROGRESS_CLASS;
  const track = document.createElement("span");
  track.setAttribute("aria-hidden", "true");
  track.className = "h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700";
  const fill = document.createElement("span");
  fill.className = "block h-full bg-accent";
  fill.style.width = `${percent}%`;
  track.append(fill);
  p.append(track, `En cours, ${percent} %`);
  return p;
};

const buildNewBadge = (): HTMLElement => {
  const p = document.createElement("p");
  p.className = BADGE_NEW_CLASS;
  p.textContent = "Nouveau";
  return p;
};

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
  const playPauseIcon = document.getElementById("btn-play-pause-icon");
  const playPauseLabel = document.getElementById("btn-play-pause-label");
  const backButton = document.getElementById("btn-back-15");
  const forwardButton = document.getElementById("btn-forward-15");
  const seek = document.getElementById("seek");
  const timeCurrentEl = document.getElementById("time-current");
  const timeDurationEl = document.getElementById("time-duration");
  const errorBox = document.getElementById("player-error");
  const retryButton = document.getElementById("btn-retry");
  const episodeTitleEl = document.getElementById("player-episode-title");
  const chapterTitleEl = document.getElementById("player-chapter-title");
  const chapterNavEl = document.getElementById("chapters");
  const chapterListEl = document.getElementById("chapter-list-items");
  const chapterButtonsWrapperEl = document.getElementById("chapter-nav");
  const prevChapterButton = document.getElementById("btn-prev-chapter");
  const nextChapterButton = document.getElementById("btn-next-chapter");

  if (
    !(audio instanceof HTMLAudioElement) ||
    !(playPauseButton instanceof HTMLElement) ||
    !(playPauseIcon instanceof SVGPathElement) ||
    !(playPauseLabel instanceof HTMLElement) ||
    !(backButton instanceof HTMLElement) ||
    !(forwardButton instanceof HTMLElement) ||
    !(seek instanceof HTMLInputElement) ||
    !(timeCurrentEl instanceof HTMLElement) ||
    !(timeDurationEl instanceof HTMLElement) ||
    !(errorBox instanceof HTMLElement) ||
    !(episodeTitleEl instanceof HTMLElement) ||
    !(chapterTitleEl instanceof HTMLElement) ||
    !(chapterNavEl instanceof HTMLElement) ||
    !(chapterListEl instanceof HTMLElement) ||
    !(chapterButtonsWrapperEl instanceof HTMLElement) ||
    !(prevChapterButton instanceof HTMLButtonElement) ||
    !(nextChapterButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  const episodes = readEpisodesData();
  if (episodes.length === 0) {
    return;
  }

  let storedState = readStoredState();
  let currentEpisode: EpisodeData | undefined;
  let duration = 0;
  let isSeeking = false;
  let lastSaveTime = 0;
  let currentChapterIndex = -1;

  const setPlayingState = (isPlaying: boolean): void => {
    playPauseLabel.textContent = isPlaying ? "Pause" : "Lecture";
    playPauseIcon.setAttribute("d", isPlaying ? PAUSE_ICON_PATH : PLAY_ICON_PATH);
  };

  const updateTimeDisplay = (position: number): void => {
    timeCurrentEl.textContent = formatTime(position);
    seek.setAttribute("aria-valuetext", `${toSpokenTime(position)} sur ${toSpokenTime(duration)}`);
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

  const renderChapterList = (chapters: Chapter[], currentIndex: number): void => {
    chapterListEl.innerHTML = "";
    chapters.forEach((chapter, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.chapterIndex = String(index);
      button.className = CHAPTER_BUTTON_CLASS;
      if (index === currentIndex) {
        button.setAttribute("aria-current", "true");
      }
      button.setAttribute(
        "aria-label",
        `Aller au chapitre ${index + 1} : ${chapter.title}, à ${toSpokenTime(chapter.start)}`,
      );

      const timeSpan = document.createElement("span");
      timeSpan.setAttribute("aria-hidden", "true");
      timeSpan.className = "tabular-nums text-sm opacity-80";
      timeSpan.textContent = formatTime(chapter.start);

      const titleSpan = document.createElement("span");
      titleSpan.textContent = chapter.title;

      button.append(timeSpan, titleSpan);
      li.append(button);
      chapterListEl.append(li);
    });
  };

  const renderChapterState = (chapters: Chapter[], currentIndex: number): void => {
    const hasChapters = chapters.length > 0;
    chapterNavEl.hidden = !hasChapters;
    chapterButtonsWrapperEl.hidden = !hasChapters;

    const currentChapter = currentIndex >= 0 ? chapters[currentIndex] : undefined;
    chapterTitleEl.hidden = !currentChapter;
    chapterTitleEl.textContent = currentChapter ? `Chapitre : ${currentChapter.title}` : "";

    prevChapterButton.disabled = !(currentIndex > 0);
    nextChapterButton.disabled = !(hasChapters && currentIndex < chapters.length - 1);
  };

  const setActiveChapter = (chapters: Chapter[], newIndex: number): void => {
    if (newIndex === currentChapterIndex) {
      return; // F-52 : ne rien toucher au DOM quand le chapitre n'a pas changé
    }
    currentChapterIndex = newIndex;

    chapterListEl.querySelectorAll<HTMLButtonElement>("button[data-chapter-index]").forEach((button) => {
      if (Number(button.dataset.chapterIndex) === newIndex) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });

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

  const renderEpisodeBadge = (episode: EpisodeData): void => {
    const li = document.querySelector<HTMLElement>(`li[data-episode-id="${episode.id}"]`);
    const slot = li?.querySelector<HTMLElement>("[data-episode-badge-slot]");
    if (!slot) {
      return;
    }

    const badge = getEpisodeBadge(
      { date: new Date(episode.date), duration: episode.duration },
      storedState.episodes[episode.id],
      new Date(),
    );

    slot.replaceChildren();
    if (badge?.type === "completed") {
      slot.append(buildCompletedBadge());
    } else if (badge?.type === "in-progress") {
      slot.append(buildInProgressBadge(badge.percent));
    } else if (badge?.type === "new") {
      slot.append(buildNewBadge());
    }
  };

  const renderToggleButton = (episode: EpisodeData): void => {
    const button = document.querySelector<HTMLButtonElement>(
      `.episode-toggle-completed[data-episode-id="${episode.id}"]`,
    );
    if (!button) {
      return;
    }
    const completed = storedState.episodes[episode.id]?.completed ?? false;
    button.textContent = completed ? "Marquer comme non écouté" : "Marquer comme écouté";
    button.hidden = false;
  };

  const renderAllBadges = (): void => {
    episodes.forEach((episode) => {
      renderEpisodeBadge(episode); // F-60, F-64, F-65
      renderToggleButton(episode);
    });
  };

  const applyStateChange = (nextState: StoredState): void => {
    storedState = nextState;
    persistState(storedState);
    renderAllBadges();
  };

  const updateEpisodeListCurrent = (episodeId: string): void => {
    document.querySelectorAll<HTMLElement>("[data-episode-id]").forEach((el) => {
      if (el.tagName !== "LI") {
        return;
      }
      const isCurrent = el.dataset.episodeId === episodeId;
      if (isCurrent) {
        el.setAttribute("aria-current", "true");
      } else {
        el.removeAttribute("aria-current");
      }
      const marker = el.querySelector<HTMLElement>(".episode-current-marker");
      if (marker) {
        marker.hidden = !isCurrent;
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

  const loadEpisode = (episode: EpisodeData, options: { autoplay: boolean }): void => {
    if (currentEpisode && currentEpisode.id !== episode.id) {
      savePosition(audio.currentTime, { force: true }); // F-47
    }

    currentEpisode = episode;
    duration = episode.duration;

    episodeTitleEl.textContent = episode.title;
    document.title = `${episode.title} — ${PODCAST_NAME}`;

    const stored = storedState.episodes[episode.id];
    const initialPosition = resolveInitialPosition(stored?.position ?? 0, duration, stored?.completed ?? false);

    seek.max = String(Math.round(duration));
    seek.value = String(Math.round(initialPosition));
    timeDurationEl.textContent = formatTime(duration);
    updateTimeDisplay(initialPosition); // F-41 : avant tout chargement audio

    currentChapterIndex = getCurrentChapterIndex(episode.chapters, initialPosition);
    renderChapterList(episode.chapters, currentChapterIndex);
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
            timeDurationEl.textContent = formatTime(duration);
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
      updateEpisodeState(storedState, episode.id, { openedAt: stored?.openedAt ?? new Date().toISOString() }, new Date()),
    );

    history.replaceState(null, "", `?e=${episode.id}`); // F-46
    updateEpisodeListCurrent(episode.id);

    if (options.autoplay) {
      audio.play().catch(showError);
    }
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

  audio.addEventListener("play", () => setPlayingState(true));
  audio.addEventListener("pause", () => {
    setPlayingState(false);
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

  retryButton?.addEventListener("click", () => {
    hideError();
    audio.load();
    audio.play().catch(showError);
  });

  chapterListEl.addEventListener("click", (event) => {
    if (!currentEpisode) {
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-chapter-index]");
    if (!button) {
      return;
    }
    goToChapter(currentEpisode.chapters, Number(button.dataset.chapterIndex));
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
        loadEpisode(episode, { autoplay: true }); // F-32, F-34 (le focus reste sur ce bouton)
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".episode-toggle-completed").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.episodeId;
      if (!id) {
        return;
      }
      const wasCompleted = storedState.episodes[id]?.completed ?? false;
      const nextCompleted = !wasCompleted;

      applyStateChange(
        updateEpisodeState(
          storedState,
          id,
          nextCompleted ? { completed: true } : { completed: false, position: 0 }, // F-66
          new Date(),
        ),
      );

      if (currentEpisode?.id === id && !nextCompleted) {
        audio.currentTime = 0;
        seek.value = "0";
        updateTimeDisplay(0);
      }
    });
  });

  loadEpisode(resolveInitialEpisode(episodes, storedState), { autoplay: false }); // F-20 : jamais autoplay
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlayer);
} else {
  initPlayer();
}
