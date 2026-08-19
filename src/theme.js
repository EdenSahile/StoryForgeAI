// theme.js — Design tokens StoryPilot AI
// À importer dans tous les composants styled-components

export const theme = {
  colors: {
    // Toutes les valeurs sont des custom properties CSS définies dans le
    // GlobalStyle (src/App.jsx) — :root pour le thème sombre par défaut,
    // [data-theme="light"] pour la surcharge claire. Voir la bascule de
    // thème dans App.jsx (state "storypilot-theme", data-theme sur <html>).
    background: "var(--color-background)",
    surface: "var(--color-surface)",
    surfaceContainerLowest: "var(--color-surfaceContainerLowest)",
    surfaceContainerLow: "var(--color-surfaceContainerLow)",
    surfaceContainer: "var(--color-surfaceContainer)",
    surfaceContainerHigh: "var(--color-surfaceContainerHigh)",
    surfaceContainerHighest: "var(--color-surfaceContainerHighest)",
    surfaceBright: "var(--color-surfaceBright)",

    // Primary
    primary: "var(--color-primary)",
    primaryContainer: "var(--color-primaryContainer)",
    onPrimary: "var(--color-onPrimary)",
    onPrimaryContainer: "var(--color-onPrimaryContainer)",
    inversePrimary: "var(--color-inversePrimary)",

    // Secondary
    secondary: "var(--color-secondary)",
    secondaryContainer: "var(--color-secondaryContainer)",
    onSecondary: "var(--color-onSecondary)",
    onSecondaryContainer: "var(--color-onSecondaryContainer)",

    // Tertiary
    tertiary: "var(--color-tertiary)",

    // Surface text
    onSurface: "var(--color-onSurface)",
    onSurfaceVariant: "var(--color-onSurfaceVariant)",
    onBackground: "var(--color-onBackground)",

    // Borders
    outline: "var(--color-outline)",
    outlineVariant: "var(--color-outlineVariant)",

    // Semantic
    error: "var(--color-error)",
    success: "var(--color-success)",
    amber: "var(--color-amber)",

    // Paires badge (fond teinté + texte), pour succès/avertissement/erreur
    bgSuccess: "var(--color-bgSuccess)",
    textSuccess: "var(--color-textSuccess)",
    bgWarning: "var(--color-bgWarning)",
    textWarning: "var(--color-textWarning)",
    bgError: "var(--color-bgError)",
    textError: "var(--color-textError)",

    // Halos d'état actif/en cours (génération en cours, source RAG active)
    primaryGlow: "var(--color-primary-glow)",
    successGlow: "var(--color-success-glow)",
  },

  // Zéro dégradé : fond plein, cohérent avec la palette Graphite & Émeraude.
  gradients: {
    primary: "var(--color-primary)",
    primaryContainer: "var(--color-primary)",
    subtle: "var(--color-primary)",
  },

  fonts: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', monospace",
  },

  fontSizes: {
    xs: "12px",
    sm: "14px",
    md: "16px",
    lg: "18px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "32px",
    "4xl": "48px",
  },

  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px",
    "3xl": "64px",
  },

  radii: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    full: "9999px",
  },

  shadows: {
    card: "0 2px 12px rgba(0, 0, 0, 0.3)",
  },

  breakpoints: {
    mobile: "768px",
    tablet: "1024px",
    xs: "480px",
  },
};
