function getById<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Lecteur : élément #${id} introuvable.`);
  }
  return element;
}

export function getPlayerElements() {
  return {
    audio: getById("player-audio", HTMLAudioElement),
    playPauseButton: getById("play-pause-button", HTMLButtonElement),
    playIcon: getById("play-icon", HTMLElement),
    pauseIcon: getById("pause-icon", HTMLElement),
    playPauseLabel: getById("play-pause-label", HTMLElement),
    skipBackButton: getById("skip-back-button", HTMLButtonElement),
    skipForwardButton: getById("skip-forward-button", HTMLButtonElement),
    previousChapterButton: getById("previous-chapter-button", HTMLButtonElement),
    nextChapterButton: getById("next-chapter-button", HTMLButtonElement),
    seekBar: getById("seek-bar", HTMLInputElement),
    elapsedTime: getById("elapsed-time", HTMLElement),
    totalDuration: getById("total-duration", HTMLElement),
    screenTime: getById("screen-time", HTMLElement),
    screenTimeGhost: getById("screen-time-ghost", HTMLElement),
    episodeTitle: getById("episode-title", HTMLElement),
    hostList: getById("host-list", HTMLElement),
    chapterTitle: getById("chapter-title", HTMLElement),
    errorMessage: getById("playback-error", HTMLElement),
    retryButton: getById("retry-button", HTMLButtonElement),
    waveformBars: Array.from(document.querySelectorAll<SVGLineElement>("#waveform line")),
    episodeRows: document.querySelectorAll<HTMLLIElement>("li[data-episode-id]"),
    episodeButtons: document.querySelectorAll<HTMLButtonElement>("button[data-episode-id]"),
  };
}
