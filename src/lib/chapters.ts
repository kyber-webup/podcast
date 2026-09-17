export type Chapter = {
  start: number;
  title: string;
};

export function getCurrentChapterIndex(chapters: Chapter[], time: number): number {
  let index = -1;
  for (const chapter of chapters) {
    if (chapter.start <= time) {
      index += 1;
    } else {
      break;
    }
  }
  return index;
}

export function validateChapters(chapters: Chapter[], duration: number): string | null {
  if (chapters.length === 0) {
    return null;
  }

  if (chapters[0].start !== 0) {
    return "Le premier chapitre doit commencer à 0.";
  }

  for (let i = 0; i < chapters.length; i += 1) {
    const chapter = chapters[i];

    if (!chapter.title.trim()) {
      return `Le titre du chapitre ${i + 1} est vide.`;
    }

    if (chapter.start >= duration) {
      return `Le chapitre "${chapter.title}" commence après la fin de l'épisode.`;
    }

    if (i > 0 && chapter.start <= chapters[i - 1].start) {
      return `Les débuts de chapitre doivent être strictement croissants (chapitre ${i + 1}).`;
    }
  }

  return null;
}
