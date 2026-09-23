/**
 * Bascule clair / sombre.
 *
 * Par défaut, aucun choix n'est enregistré et le thème suit le système : c'est
 * le média `prefers-color-scheme` de global.css qui décide, sans JavaScript.
 * Dès que l'utilisateur clique, son choix est écrit dans `data-theme` sur
 * <html> — ce que la variante `dark` de Tailwind sait aussi lire — et mémorisé
 * dans localStorage.
 */

const STORAGE_KEY = "podcast:theme";

type Theme = "light" | "dark";

const isTheme = (value: string | null): value is Theme => value === "light" || value === "dark";

const readStoredTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null; // localStorage indisponible (mode privé, cookies bloqués)
  }
};

const persistTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Choix non mémorisé : sans importance, l'affichage reste correct.
  }
};

const systemTheme = (): Theme =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

// Couleur de la barre du navigateur sur mobile. Les deux balises <meta> du
// document sont conditionnées au thème du système : on les aligne toutes les
// deux sur le choix de l'utilisateur. Valeurs reprises de --color-page.
const BROWSER_BAR_COLOR: Record<Theme, string> = { light: "#ffeee5", dark: "#101828" };

const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", BROWSER_BAR_COLOR[theme]);
  });
};

function initThemeToggle(): void {
  const button = document.getElementById("btn-theme");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const stored = readStoredTheme();
  if (stored) {
    applyTheme(stored);
  }

  button.addEventListener("click", () => {
    const current = isTheme(document.documentElement.dataset.theme ?? null)
      ? (document.documentElement.dataset.theme as Theme)
      : systemTheme();
    const next: Theme = current === "dark" ? "light" : "dark";
    applyTheme(next);
    persistTheme(next);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initThemeToggle, { once: true });
} else {
  initThemeToggle();
}
