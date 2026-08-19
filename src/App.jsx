// App.jsx — StoryPilot AI v2
// Remplace l'App.jsx existant

import { useState, useEffect, useRef } from "react";
import { saveGeneration } from "./utils/libraryStorage";
import { listDocuments } from "./components/services/ragService";
import { getStoredTheme, saveTheme } from "./logic/themeStorage";
import styled, { createGlobalStyle } from "styled-components";
import { theme } from "./theme";
import Sidebar from "./components/layout/Sidebar";
import BottomNav from "./components/layout/BottomNav";
import Dashboard from "./screens/Dashboard";
import Forge from "./screens/Forge";
import Results from "./screens/Results";
import ErrorBoundary from "./components/ErrorBoundary";

import Library from "./screens/Library";
import Settings from "./screens/Settings";

const GlobalStyle = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

  :root {
    /* Palette "Graphite & Émeraude" — cf. artefact de comparaison,
       ratios WCAG 2.1 vérifiés par calcul (pas estimés). */
    --color-background: #0d1210;
    --color-surface: #0d1210;
    --color-surfaceContainerLowest: #0d1210;
    --color-surfaceContainerLow: #141a17;
    --color-surfaceContainer: #141a17;
    --color-surfaceContainerHigh: #141a17;
    --color-surfaceContainerHighest: #141a17;
    --color-surfaceBright: #141a17;

    --color-primary: #4fbf8b;
    --color-primaryContainer: #4fbf8b;
    --color-onPrimary: #0d1210;
    --color-onPrimaryContainer: #0d1210;
    --color-inversePrimary: #4fbf8b;

    --color-secondary: #78716c;
    --color-secondaryContainer: #78716c;
    --color-onSecondary: #ffffff;
    --color-onSecondaryContainer: #ffffff;

    --color-tertiary: #78716c;

    --color-onSurface: #eef2f0;
    --color-onSurfaceVariant: #9fada6;
    --color-onBackground: #eef2f0;

    --color-outline: #57635c;
    --color-outlineVariant: #57635c;

    --color-error: #f5a3a3;
    --color-success: #7fdba6;
    --color-amber: #f3c568;

    --color-bgSuccess: #0d2b1c;
    --color-textSuccess: #7fdba6;
    --color-bgWarning: #332205;
    --color-textWarning: #f3c568;
    --color-bgError: #3a0f0f;
    --color-textError: #f5a3a3;

    /* Halos d'état actif/en cours (rare, réservé aux indicateurs légitimes :
       génération en cours, source RAG active) — jamais une teinte figée. */
    --color-primary-glow: rgba(79, 191, 139, 0.35);
    --color-success-glow: rgba(127, 219, 166, 0.6);
  }

  [data-theme="light"] {
    --color-background: #f4f6f4;
    --color-surface: #f4f6f4;
    --color-surfaceContainerLowest: #f4f6f4;
    --color-surfaceContainerLow: #ffffff;
    --color-surfaceContainer: #ffffff;
    --color-surfaceContainerHigh: #ffffff;
    --color-surfaceContainerHighest: #ffffff;
    --color-surfaceBright: #ffffff;

    --color-primary: #1f7a52;
    --color-primaryContainer: #1f7a52;
    --color-onPrimary: #ffffff;
    --color-onPrimaryContainer: #ffffff;
    --color-inversePrimary: #1f7a52;

    --color-secondary: #78716c;
    --color-secondaryContainer: #78716c;
    --color-onSecondary: #ffffff;
    --color-onSecondaryContainer: #ffffff;

    --color-tertiary: #78716c;

    --color-onSurface: #161a18;
    --color-onSurfaceVariant: #5c655f;
    --color-onBackground: #161a18;

    --color-outline: #707a74;
    --color-outlineVariant: #707a74;

    --color-error: #b42323;
    --color-success: #166534;
    --color-amber: #92610a;

    --color-bgSuccess: #e9f7ef;
    --color-textSuccess: #166534;
    --color-bgWarning: #fdf3dc;
    --color-textWarning: #92610a;
    --color-bgError: #fbe9e9;
    --color-textError: #b42323;

    --color-primary-glow: rgba(31, 122, 82, 0.35);
    --color-success-glow: rgba(22, 101, 52, 0.5);
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html, body {
    background: ${theme.colors.background};
    color: ${theme.colors.onSurface};
    font-family: ${theme.fonts.sans};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    min-height: 100vh;
    overflow-x: hidden;
    max-width: 100vw;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: ${theme.colors.surfaceContainerLow}; }
  ::-webkit-scrollbar-thumb {
    background: ${theme.colors.surfaceContainerHighest};
    border-radius: 10px;
  }
  ::-webkit-scrollbar-thumb:hover { background: ${theme.colors.outlineVariant}; }

  /* Material Symbols */
  .material-symbols-outlined,
  span[class="icon"] {
    font-family: 'Material Symbols Outlined';
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
    font-style: normal;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
  }
`;


function App() {
  const [currentScreen, setCurrentScreen] = useState("dashboard");
  const [brief, setBrief] = useState("");
  const [stories, setStories] = useState("");
  const [ragChunks, setRagChunks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [keepBrief, setKeepBrief] = useState(false);
  const [themeMode, setThemeMode] = useState(getStoredTheme);
  const savedFingerprintRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    saveTheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (currentScreen === "results" && stories && !truncated) {
      if (savedFingerprintRef.current === stories) return;
      savedFingerprintRef.current = stories;
      const sources = [...new Set(ragChunks.map((c) => c.filename))];
      const storiesCount = (stories.match(/\*\*User Story \d+\*\*/g) || []).length;
      saveGeneration({ brief, stories, sourcesUsed: sources, storiesCount });
      setAutoSaved(true);
    }
  }, [currentScreen, stories, truncated]);

  useEffect(() => {
    listDocuments()
      .then((docs) =>
        setDocuments(
          docs.map((d) => ({
            id: d.filename,
            name: d.filename,
            chunks: d.totalChunks,
            uploadedAt: d.uploadedAt,
            status: "indexed",
          }))
        )
      )
      .catch((err) => console.warn("[list-docs] Failed to load documents:", err));
  }, []);

  const handleNavigate = (screen) => {
    if (screen === "forge" && autoSaved) {
      setBrief("");
      setStories("");
      setRagChunks([]);
      setTruncated(false);
      setAutoSaved(false);
      savedFingerprintRef.current = null;
    }
    setCurrentScreen(screen);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case "dashboard":
        return <Dashboard onNavigate={handleNavigate} themeMode={themeMode} onThemeChange={setThemeMode} />;
      case "forge":
        return <Forge onNavigate={setCurrentScreen} brief={brief} setBrief={setBrief} stories={stories} setStories={setStories} ragChunks={ragChunks} setRagChunks={setRagChunks} documents={documents} setDocuments={setDocuments} setTruncated={setTruncated} keepBrief={keepBrief} onClearKeepBrief={() => setKeepBrief(false)} themeMode={themeMode} onThemeChange={setThemeMode} />;
      case "results":
        return (
          <Results
            brief={brief}
            stories={stories}
            ragChunks={ragChunks}
            truncated={truncated}
            autoSaved={autoSaved}
            onNewGeneration={() => { setBrief(""); setStories(""); setRagChunks([]); setTruncated(false); setAutoSaved(false); setKeepBrief(false); savedFingerprintRef.current = null; setCurrentScreen("forge"); }}
            onRegenerate={() => { setStories(""); setRagChunks([]); setTruncated(false); setAutoSaved(false); setKeepBrief(true); savedFingerprintRef.current = null; setCurrentScreen("forge"); }}
            onNavigate={setCurrentScreen}
            themeMode={themeMode}
            onThemeChange={setThemeMode}
          />
        );
      case "library":
        return <Library onNavigate={handleNavigate} themeMode={themeMode} onThemeChange={setThemeMode} />;
      case "settings":
        return <Settings themeMode={themeMode} onThemeChange={setThemeMode} />;
      default:
        return <Dashboard onNavigate={setCurrentScreen} themeMode={themeMode} onThemeChange={setThemeMode} />;
    }
  };

  return (
    <ErrorBoundary>
      <GlobalStyle />
      <Sidebar activeItem={currentScreen} onNavigate={handleNavigate} />
      {renderScreen()}
      <BottomNav activeItem={currentScreen} onNavigate={setCurrentScreen} />
    </ErrorBoundary>
  );
}

export default App;
