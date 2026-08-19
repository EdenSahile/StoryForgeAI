// App.jsx — StoryPilot AI v2
// Remplace l'App.jsx existant

import { useState, useEffect, useRef } from "react";
import { saveGeneration } from "./utils/libraryStorage";
import { listDocuments } from "./components/services/ragService";
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
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

  :root {
    --color-background: #0c0a09;
    --color-surface: #0c0a09;
    --color-surfaceContainerLowest: #0c0a09;
    --color-surfaceContainerLow: #171412;
    --color-surfaceContainer: #221f1d;
    --color-surfaceContainerHigh: #2c2825;
    --color-surfaceContainerHighest: #363130;
    --color-surfaceBright: #423c39;

    --color-primary: #2563eb;
    --color-primaryContainer: #2563eb;
    --color-onPrimary: #ffffff;
    --color-onPrimaryContainer: #ffffff;
    --color-inversePrimary: #2563eb;

    --color-secondary: #78716c;
    --color-secondaryContainer: #78716c;
    --color-onSecondary: #ffffff;
    --color-onSecondaryContainer: #ffffff;

    --color-tertiary: #78716c;

    --color-onSurface: #f5f4f2;
    --color-onSurfaceVariant: #a8a29e;
    --color-onBackground: #f5f4f2;

    --color-outline: #57534e;
    --color-outlineVariant: #292524;

    --color-error: #f87171;
    --color-success: #4ade80;
    --color-amber: #fbbf24;

    --color-bgSuccess: #052e16;
    --color-textSuccess: #4ade80;
    --color-bgWarning: #451a03;
    --color-textWarning: #fbbf24;
    --color-bgError: #450a0a;
    --color-textError: #f87171;
  }

  [data-theme="light"] {
    --color-background: #f5f4f2;
    --color-surface: #f5f4f2;
    --color-surfaceContainerLowest: #f5f4f2;
    --color-surfaceContainerLow: #efeeeb;
    --color-surfaceContainer: #ffffff;
    --color-surfaceContainerHigh: #fbfaf9;
    --color-surfaceContainerHighest: #f5f4f2;
    --color-surfaceBright: #ffffff;

    --color-primary: #2563eb;
    --color-primaryContainer: #2563eb;
    --color-onPrimary: #ffffff;
    --color-onPrimaryContainer: #ffffff;
    --color-inversePrimary: #2563eb;

    --color-secondary: #78716c;
    --color-secondaryContainer: #78716c;
    --color-onSecondary: #ffffff;
    --color-onSecondaryContainer: #ffffff;

    --color-tertiary: #78716c;

    --color-onSurface: #1c1917;
    --color-onSurfaceVariant: #78716c;
    --color-onBackground: #1c1917;

    --color-outline: #d6d3d1;
    --color-outlineVariant: #e7e5e4;

    --color-error: #dc2626;
    --color-success: #16a34a;
    --color-amber: #b45309;

    --color-bgSuccess: #f0fdf4;
    --color-textSuccess: #15803d;
    --color-bgWarning: #fffbeb;
    --color-textWarning: #b45309;
    --color-bgError: #fef2f2;
    --color-textError: #b91c1c;
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


const THEME_STORAGE_KEY = "storypilot-theme";

function App() {
  const [currentScreen, setCurrentScreen] = useState("dashboard");
  const [brief, setBrief] = useState("");
  const [stories, setStories] = useState("");
  const [ragChunks, setRagChunks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [keepBrief, setKeepBrief] = useState(false);
  const [themeMode, setThemeMode] = useState(
    () => localStorage.getItem(THEME_STORAGE_KEY) || "dark"
  );
  const savedFingerprintRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
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
        return <Dashboard onNavigate={handleNavigate} />;
      case "forge":
        return <Forge onNavigate={setCurrentScreen} brief={brief} setBrief={setBrief} stories={stories} setStories={setStories} ragChunks={ragChunks} setRagChunks={setRagChunks} documents={documents} setDocuments={setDocuments} setTruncated={setTruncated} keepBrief={keepBrief} onClearKeepBrief={() => setKeepBrief(false)} />;
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
          />
        );
      case "library":
        return <Library onNavigate={handleNavigate} />;
      case "settings":
        return <Settings themeMode={themeMode} onThemeChange={setThemeMode} />;
      default:
        return <Dashboard onNavigate={setCurrentScreen} />;
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
