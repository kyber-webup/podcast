export function parseTimecode(input: number | string): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error(`Invalid timecode: ${input}`);
    }
    return Math.round(input);
  }

  const trimmed = input.trim();
  const match = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid timecode: "${input}"`);
  }

  const [, first, second, third] = match;
  if (third !== undefined) {
    const hours = Number(first);
    const minutes = Number(second);
    const seconds = Number(third);
    return hours * 3600 + minutes * 60 + seconds;
  }

  const minutes = Number(first);
  const seconds = Number(second);
  return minutes * 60 + seconds;
}

export function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function toSpokenTime(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(pluralize(hours, "heure", "heures"));
  }
  if (hours > 0 || minutes > 0) {
    parts.push(pluralize(minutes, "minute", "minutes"));
  }
  parts.push(pluralize(seconds, "seconde", "secondes"));

  return parts.join(" ");
}

function pluralize(value: number, singular: string, plural: string): string {
  return `${value} ${value <= 1 ? singular : plural}`;
}
