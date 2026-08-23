// src/screens/Results.jsx
import { useState, useEffect } from "react";
import { getGenerations } from "../utils/libraryStorage";
import { parseStories } from "../logic/storyParser";
import { storiesToJiraCSV } from "../logic/csvExport";
import styled, { keyframes } from "styled-components";
import { theme } from "../theme";

// ─── Animations ───────────────────────────────────────────
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const cardEntrance = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ─── Layout ───────────────────────────────────────────────
const PageWrapper = styled.div`
  margin-left: 240px;
  min-height: 100vh;
  background: ${theme.colors.background};
  animation: ${fadeInUp} 0.4s ease;
  overflow-x: hidden;

  @media (max-width: ${theme.breakpoints.mobile}) {
    margin-left: 0;
    padding-bottom: 100px;
  }
`;

const TopBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 ${theme.spacing.lg};
  background: color-mix(in srgb, ${theme.colors.surface} 85%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid ${theme.colors.outlineVariant};
`;

const TopBarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex: 1;
  min-width: 0;
  overflow: hidden;

  .title {
    font-size: ${theme.fontSizes.xl};
    font-weight: 800;
    color: ${theme.colors.onSurface};
    white-space: nowrap;
  }

  .sep {
    color: ${theme.colors.outline};
    flex-shrink: 0;
  }

  .sub {
    font-size: ${theme.fontSizes.md};
    color: ${theme.colors.onSurfaceVariant};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    .sep, .sub { display: none; }
  }
`;

const TopBarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-shrink: 0;

  @media (max-width: ${theme.breakpoints.mobile}) {
    gap: ${theme.spacing.xs};
  }
`;

const IconBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.onSurfaceVariant};
  cursor: pointer;
  padding: 6px;
  border-radius: ${theme.radii.sm};
  transition: all 0.2s;
  display: flex;
  align-items: center;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 22px;
  }

  &:hover {
    color: ${theme.colors.primary};
    background: ${theme.colors.surfaceContainerHighest};
  }
`;

const Content = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: ${theme.spacing.xl};
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: ${theme.spacing.xl};

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
    gap: ${theme.spacing.lg};
  }
`;

// ─── Left Column ──────────────────────────────────────────
const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const PageHeader = styled.div`
  h2 {
    font-size: ${theme.fontSizes["3xl"]};
    font-weight: 700;
    color: ${theme.colors.onSurface};
    letter-spacing: -0.01em;

    @media (max-width: ${theme.breakpoints.mobile}) {
      font-size: ${theme.fontSizes["2xl"]};
    }
  }

  p {
    font-size: ${theme.fontSizes.md};
    color: ${theme.colors.onSurfaceVariant};
    margin-top: 4px;

    @media (max-width: ${theme.breakpoints.mobile}) {
      font-size: ${theme.fontSizes.sm};
    }
  }
`;

const ActionBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  background: color-mix(in srgb, ${theme.colors.primary} 5%, transparent);
  border: 1px solid color-mix(in srgb, ${theme.colors.primary} 15%, transparent);
  border-radius: ${theme.radii.lg};
`;

const StatusBadge = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-size: ${theme.fontSizes.sm};
  font-weight: 700;
  color: ${theme.colors.onSurface};

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${theme.colors.success};
    box-shadow: 0 0 8px ${theme.colors.successGlow};
  }
`;

const RagBadge = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-size: ${theme.fontSizes.sm};
  font-weight: 700;
  color: ${({ $active }) => ($active ? theme.colors.success : theme.colors.onSurfaceVariant)};

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ $active }) => ($active ? theme.colors.success : theme.colors.onSurfaceVariant)};
    box-shadow: ${({ $active }) => ($active ? `0 0 8px ${theme.colors.successGlow}` : "none")};
  }
`;

const ActionBtns = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};

  @media (max-width: ${theme.breakpoints.xs}) {
    width: 100%;

    button {
      flex: 1;
      justify-content: center;
    }
  }
`;

const OutlineBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: ${theme.radii.md};
  border: 1px solid ${theme.colors.outlineVariant};
  background: transparent;
  color: ${({ $copied }) => ($copied ? theme.colors.primary : theme.colors.onSurface)};
  background: ${({ $copied }) => ($copied ? `color-mix(in srgb, ${theme.colors.primary} 13%, transparent)` : "transparent")};
  border-color: ${({ $copied }) => ($copied ? theme.colors.primary : theme.colors.outlineVariant)};
  font-size: ${theme.fontSizes.sm};
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 16px;
  }

  &:hover {
    background: ${theme.colors.surfaceContainerHighest};
    border-color: color-mix(in srgb, ${theme.colors.primary} 30%, transparent);
  }
`;

const ExportBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: ${theme.radii.md};
  border: none;
  background: ${theme.colors.inversePrimary};
  color: ${theme.colors.onPrimary};
  font-size: ${theme.fontSizes.sm};
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 16px;
  }

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.97);
  }
`;

// ─── Story Cards ──────────────────────────────────────────
const StoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const StoryCard = styled.article`
  background: ${theme.colors.surfaceContainer};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.xl};
  overflow: hidden;
  animation: ${cardEntrance} 0.4s ease both;
  animation-delay: ${({ $index }) => $index * 0.1}s;
  transition: border-color 0.2s;

  &:hover {
    border-color: color-mix(in srgb, ${theme.colors.primary} 25%, transparent);
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.lg};
  background: ${theme.colors.surfaceContainerHigh};
  border-bottom: 1px solid color-mix(in srgb, ${theme.colors.outline} 30%, transparent);

  h3 {
    font-size: ${theme.fontSizes.xl};
    font-weight: 700;
    color: ${theme.colors.primary};
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: ${theme.spacing.sm};

    @media (max-width: ${theme.breakpoints.mobile}) {
      font-size: ${theme.fontSizes.lg};
    }
  }
`;

const ComplexityBadge = styled.span`
  font-size: ${theme.fontSizes.xs};
  font-weight: 700;
  padding: 4px 12px;
  border-radius: ${theme.radii.sm};
  background: ${({ $level }) =>
    $level === "S"
      ? theme.colors.bgSuccess
      : $level === "M"
      ? theme.colors.bgWarning
      : theme.colors.bgError};
  color: ${({ $level }) =>
    $level === "S" ? theme.colors.textSuccess : $level === "M" ? theme.colors.textWarning : theme.colors.textError};
  border: 1px solid ${({ $level }) =>
    $level === "S"
      ? `color-mix(in srgb, ${theme.colors.success} 35%, transparent)`
      : $level === "M"
      ? `color-mix(in srgb, ${theme.colors.amber} 35%, transparent)`
      : `color-mix(in srgb, ${theme.colors.error} 35%, transparent)`};
`;

const StoryCopyBtn = styled(IconBtn)`
  color: ${({ $copied }) => ($copied ? theme.colors.primary : theme.colors.onSurfaceVariant)};
  background: ${({ $copied }) => ($copied ? `color-mix(in srgb, ${theme.colors.primary} 13%, transparent)` : "transparent")};

  .icon {
    font-size: 18px;
  }
`;

const IncompleteTag = styled.span`
  font-size: ${theme.fontSizes.xs};
  font-weight: 700;
  padding: 4px 10px;
  border-radius: ${theme.radii.sm};
  background: ${theme.colors.bgWarning};
  color: ${theme.colors.textWarning};
  border: 1px solid color-mix(in srgb, ${theme.colors.amber} 35%, transparent);
`;

const CardBody = styled.div`
  padding: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const StoryStatement = styled.p`
  font-size: ${theme.fontSizes.lg};
  color: ${theme.colors.onSurface};
  line-height: 1.7;

  .role { color: ${theme.colors.secondary}; font-weight: 700; }
  .action { color: ${theme.colors.secondary}; font-weight: 700; }
  .benefit { color: ${theme.colors.secondary}; font-weight: 700; }

  @media (max-width: ${theme.breakpoints.mobile}) {
    font-size: ${theme.fontSizes.md};
  }
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${theme.spacing.lg};
  padding-top: ${theme.spacing.md};
  border-top: 1px solid color-mix(in srgb, ${theme.colors.outline} 30%, transparent);

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const CriteriaSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};

  h4 {
    font-size: ${theme.fontSizes.xs};
    font-weight: 700;
    color: ${theme.colors.onSurface};
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
`;

const CriteriaItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.onSurfaceVariant};
  line-height: 1.5;
  list-style: none;

  .check {
    font-family: "Material Symbols Outlined";
    font-size: 16px;
    color: ${theme.colors.success};
    flex-shrink: 0;
    margin-top: 1px;
    font-variation-settings: "FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24;
  }
`;

const GherkinSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};

  h4 {
    font-size: ${theme.fontSizes.xs};
    font-weight: 700;
    color: ${theme.colors.onSurface};
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
`;

const GherkinBlock = styled.div`
  background: ${theme.colors.surfaceContainerLowest};
  border-left: 3px solid ${theme.colors.primary};
  border-radius: 0 ${theme.radii.sm} ${theme.radii.sm} 0;
  padding: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: 13px;
  line-height: 2;
  color: ${theme.colors.onSurfaceVariant};
  overflow-x: auto;

  .keyword-given { color: ${theme.colors.secondary}; font-weight: 700; }
  .keyword-when { color: ${theme.colors.primary}; font-weight: 700; }
  .keyword-then { color: ${theme.colors.success}; font-weight: 700; }
  .keyword-and { color: ${theme.colors.tertiary}; font-weight: 700; }
`;

// ─── Right Column ─────────────────────────────────────────
const RightColumn = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const Panel = styled.div`
  background: ${theme.colors.surfaceContainer};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.xl};
  padding: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const PanelLabel = styled.p`
  font-size: ${theme.fontSizes.xs};
  font-weight: 700;
  color: ${theme.colors.onSurfaceVariant};
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const QuickActionBtn = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: ${theme.radii.lg};
  font-size: ${theme.fontSizes.sm};
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 18px;
  }

  background: ${({ $variant }) =>
    $variant === "primary"
      ? theme.colors.inversePrimary
      : "transparent"};
  color: ${({ $variant }) =>
    $variant === "primary" ? theme.colors.onPrimary : theme.colors.onSurfaceVariant};
  border: ${({ $variant }) =>
    $variant === "primary"
      ? "none"
      : `1px solid ${theme.colors.outlineVariant}`};

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
    color: ${({ $variant }) =>
      $variant === "primary" ? theme.colors.onPrimary : theme.colors.onSurface};
    border-color: ${({ $variant }) =>
      $variant === "primary" ? "none" : `color-mix(in srgb, ${theme.colors.primary} 30%, transparent)`};
  }

  &:active {
    transform: scale(0.97);
  }
`;

const RecentItem = styled.div`
  padding: ${theme.spacing.md};
  background: ${theme.colors.surfaceContainer};
  border: 1px solid color-mix(in srgb, ${theme.colors.outline} 15%, transparent);
  border-radius: ${theme.radii.md};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: color-mix(in srgb, ${theme.colors.primary} 25%, transparent);
  }

  .title {
    font-size: ${theme.fontSizes.sm};
    font-weight: 700;
    color: ${theme.colors.onSurface};
    margin-bottom: 6px;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .date {
    font-size: ${theme.fontSizes.xs};
    color: ${theme.colors.onSurfaceVariant};
  }

  .count {
    font-size: ${theme.fontSizes.xs};
    font-weight: 700;
    color: ${theme.colors.primary};
  }
`;

const SeeAllLink = styled.a`
  display: block;
  text-align: center;
  font-size: ${theme.fontSizes.sm};
  font-weight: 700;
  color: ${theme.colors.primary};
  text-decoration: none;
  padding-top: ${theme.spacing.sm};
  border-top: 1px solid ${theme.colors.outlineVariant};
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover { opacity: 0.8; }
`;

// ─── Mobile Sticky Bar ────────────────────────────────────
const MobileStickyBar = styled.div`
  display: none;
  position: fixed;
  bottom: 64px;
  left: 0;
  right: 0;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.surfaceContainerHigh};
  border-top: 1px solid ${theme.colors.outlineVariant};
  gap: ${theme.spacing.sm};
  z-index: 40;

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: flex;
  }
`;

const TruncationWarning = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
  background: ${theme.colors.bgWarning};
  border: 1px solid color-mix(in srgb, ${theme.colors.amber} 30%, transparent);
  border-radius: ${theme.radii.sm};
  color: ${theme.colors.textWarning};
  font-size: ${theme.fontSizes.sm};
  font-weight: 500;
`;

const RegenerateBtn = styled.button`
  background: color-mix(in srgb, ${theme.colors.amber} 15%, transparent);
  border: 1px solid color-mix(in srgb, ${theme.colors.amber} 40%, transparent);
  border-radius: ${theme.radii.sm};
  color: ${theme.colors.textWarning};
  font-size: ${theme.fontSizes.sm};
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  &:hover { background: color-mix(in srgb, ${theme.colors.amber} 25%, transparent); }
`;

// ─── RAG Sources styled components ───────────────────────
const SourcesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SourceItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: 6px ${theme.spacing.sm};
  border-radius: ${theme.radii.md};
  background: color-mix(in srgb, ${theme.colors.primary} 5%, transparent);

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${theme.colors.success};
    flex-shrink: 0;
  }

  .name {
    font-size: ${theme.fontSizes.xs};
    color: ${theme.colors.onSurface};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .score {
    font-size: ${theme.fontSizes.xs};
    font-weight: 700;
    color: ${theme.colors.success};
    flex-shrink: 0;
  }
`;

// ─── Component ────────────────────────────────────────────
export default function Results({ brief = "", stories, ragChunks = [], onNewGeneration, onRegenerate, onNavigate, truncated = false, autoSaved = false, themeMode, onThemeChange }) {
  const [copied, setCopied] = useState(false);
  const [copiedStoryId, setCopiedStoryId] = useState(null);
  const [showTrelloMsg, setShowTrelloMsg] = useState(false);
  const [recentGenerations, setRecentGenerations] = useState([]);

  const handleTrelloExport = () => {
    setShowTrelloMsg(true);
    setTimeout(() => setShowTrelloMsg(false), 4000);
  };

  const parsedStories = parseStories(stories);

  const handleCsvExport = () => {
    const csv = storiesToJiraCSV(parsedStories);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `storypilot-export-jira-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setRecentGenerations(getGenerations().slice(0, 3));
  }, [autoSaved]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stories);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  };

  const handleCopyStory = async (story) => {
    try {
      await navigator.clipboard.writeText(story.rawBlock);
      setCopiedStoryId(story.id);
      setTimeout(() => setCopiedStoryId(null), 2000);
    } catch {
      // silent
    }
  };

  return (
    <PageWrapper>
      <TopBar>
        <TopBarLeft>
          <span className="title">Forge</span>
          <span className="sep">/</span>
          <span className="sub">Résultats</span>
        </TopBarLeft>
        <TopBarRight>
          <IconBtn
            onClick={() => onThemeChange?.(themeMode === "dark" ? "light" : "dark")}
            title={themeMode === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
          >
            <span
              className="icon"
              style={{ fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24' }}
            >
              {themeMode === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </IconBtn>
          <IconBtn><span className="icon">notifications</span></IconBtn>
        </TopBarRight>
      </TopBar>

      <Content>
        {/* ── Left Column ── */}
        <LeftColumn>
          <PageHeader>
            <h2>Backlog de Génération</h2>
            <p>Stories prêtes pour l'exportation vers Trello ou Jira.</p>
          </PageHeader>

          {truncated && (
            <TruncationWarning>
              <span>⚠️ Génération possiblement incomplète — la dernière user story est à vérifier.</span>
              {onRegenerate && (
                <RegenerateBtn onClick={onRegenerate}>🔄 Régénérer</RegenerateBtn>
              )}
            </TruncationWarning>
          )}

          {/* Action Bar */}
          <ActionBar>
            <div style={{ display: "flex", alignItems: "center", gap: theme.spacing.md, flexWrap: "wrap" }}>
              <StatusBadge>
                <span className="dot" />
                ✦ Génération par IA terminée
              </StatusBadge>
              <RagBadge $active={ragChunks.length > 0}>
                <span className="dot" />
                {ragChunks.length > 0 ? "RAG actif" : "RAG non utilisé — US Générique"}
              </RagBadge>
            </div>
            <ActionBtns>
              <OutlineBtn onClick={handleCopy} $copied={copied}>
                <span className="icon">{copied ? "done" : "content_copy"}</span>
                {copied ? "Copié !" : "Copier tout"}
              </OutlineBtn>
              <ExportBtn onClick={handleTrelloExport}>
                <span className="icon">view_kanban</span>
                Exporter vers Trello
              </ExportBtn>
              <ExportBtn onClick={handleCsvExport}>
                <span className="icon">download</span>
                Exporter CSV (Jira)
              </ExportBtn>
            </ActionBtns>
          </ActionBar>

          {showTrelloMsg && (
            <div style={{
              fontSize: theme.fontSizes.sm,
              color: theme.colors.onSurfaceVariant,
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              background: theme.colors.surfaceContainer,
              border: `1px solid ${theme.colors.outlineVariant}`,
              borderRadius: theme.radii.md,
              lineHeight: 1.6,
            }}>
              Export direct vers Trello bientôt disponible — utilise "Copier" pour récupérer le texte formaté.
            </div>
          )}

          {/* Story Cards */}
          <StoryList>
            {parsedStories.length > 0 ? (
              parsedStories.map((story, i) => (
                <StoryCard key={story.id} $index={i}>
                  <CardHeader>
                    <h3>US-{String(story.id).padStart(2, "0")} — {story.title}</h3>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {story.incomplete && (
                        <IncompleteTag>Story incomplète</IncompleteTag>
                      )}
                      <ComplexityBadge $level={story.complexity}>
                        {story.complexity}
                      </ComplexityBadge>
                      <StoryCopyBtn
                        onClick={() => handleCopyStory(story)}
                        $copied={copiedStoryId === story.id}
                        title={copiedStoryId === story.id ? "Copié !" : "Copier cette user story"}
                        aria-label={copiedStoryId === story.id ? "Copié" : "Copier cette user story"}
                      >
                        <span className="icon">{copiedStoryId === story.id ? "done" : "content_copy"}</span>
                      </StoryCopyBtn>
                    </div>
                  </CardHeader>

                  <CardBody>
                    {/* Statement */}
                    <StoryStatement>
                      {story.statement ? (
                        <>
                          En tant que{" "}
                          <span className="role">{story.statement.role}</span>, je veux{" "}
                          <span className="action">{story.statement.action}</span>{" "}
                          afin de{" "}
                          <span className="benefit">{story.statement.benefit}</span>.
                        </>
                      ) : (
                        story.fullStatement || (
                          <span style={{ fontStyle: "italic", opacity: 0.6 }}>
                            Contenu non reçu — stream interrompu avant la fin de la story.
                          </span>
                        )
                      )}
                    </StoryStatement>

                    {story.description && (
                      <p style={{
                        fontSize: "14px",
                        color: theme.colors.onSurfaceVariant,
                        lineHeight: 1.7,
                        fontStyle: "italic",
                        padding: "12px 16px",
                        background: theme.colors.surfaceContainerHigh,
                        borderRadius: "8px",
                        borderLeft: `3px solid color-mix(in srgb, ${theme.colors.primary} 20%, transparent)`
                      }}>
                        {story.description}
                      </p>
                    )}

                    {/* Grid: Criteria + Gherkin */}
                    {(story.criteria.length > 0 || story.gherkinGroups.length > 0) && (
                      <CardGrid>
                        {/* Criteria */}
                        {story.criteria.length > 0 && (
                          <CriteriaSection>
                            <h4>Critères d'Acceptation</h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                              {story.criteria.map((c, j) => (
                                <CriteriaItem key={j}>
                                  <span className="check">check_circle</span>
                                  {c}
                                </CriteriaItem>
                              ))}
                            </ul>
                          </CriteriaSection>
                        )}

                        {/* Gherkin */}
                        {story.gherkinGroups.length > 0 && (
                          <GherkinSection>
                            <h4>Scénarios Gherkin</h4>
                            {story.gherkinGroups.map((group, gi) => (
                              <div key={gi} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <p style={{ fontSize: "11px", fontWeight: 700, color: theme.colors.primary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  {group.title}
                                </p>
                                <GherkinBlock>
                                  {group.lines.map((line, j) => {
                                    const lower = line.toLowerCase();
                                    if (lower.startsWith("étant donné") || lower.startsWith("given"))
                                      return <div key={j}><span className="keyword-given">{line.split(" ")[0]} {line.split(" ")[1]}</span> {line.split(" ").slice(2).join(" ")}</div>;
                                    if (lower.startsWith("quand") || lower.startsWith("when"))
                                      return <div key={j}><span className="keyword-when">{line.split(" ")[0]}</span> {line.split(" ").slice(1).join(" ")}</div>;
                                    if (lower.startsWith("alors") || lower.startsWith("then"))
                                      return <div key={j}><span className="keyword-then">{line.split(" ")[0]}</span> {line.split(" ").slice(1).join(" ")}</div>;
                                    if (lower.startsWith("et ") || lower.startsWith("and "))
                                      return <div key={j}><span className="keyword-and">{line.split(" ")[0]}</span> {line.split(" ").slice(1).join(" ")}</div>;
                                    return <div key={j}>{line}</div>;
                                  })}
                                </GherkinBlock>
                              </div>
                            ))}
                          </GherkinSection>
                        )}
                      </CardGrid>
                    )}
                  </CardBody>
                </StoryCard>
              ))
            ) : (
              /* Fallback — texte brut si parsing échoue */
              <StoryCard $index={0}>
                <CardBody>
                  <div style={{
                    fontFamily: theme.fonts.sans,
                    fontSize: theme.fontSizes.md,
                    color: theme.colors.onSurface,
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap"
                  }}>
                    {stories}
                  </div>
                </CardBody>
              </StoryCard>
            )}
          </StoryList>
        </LeftColumn>

        {/* ── Right Column ── */}
        <RightColumn>
          {/* Quick Actions */}
          <Panel>
            <PanelLabel>Actions Rapides</PanelLabel>
            <QuickActionBtn onClick={onNewGeneration}>
              <span className="icon">restart_alt</span>
              Nouvelle génération
            </QuickActionBtn>
            <QuickActionBtn $variant="primary" onClick={handleTrelloExport}>
              <span className="icon">view_kanban</span>
              Exporter vers Trello
            </QuickActionBtn>
            <QuickActionBtn onClick={handleCsvExport}>
              <span className="icon">download</span>
              Exporter CSV (Jira)
            </QuickActionBtn>
            <QuickActionBtn disabled style={{ opacity: autoSaved ? 1 : 0.5, cursor: "default" }}>
              <span className="icon">{autoSaved ? "check_circle" : "bookmark"}</span>
              {autoSaved ? "✓ Sauvegardé automatiquement" : "Sauvegarde en cours..."}
            </QuickActionBtn>
          </Panel>

          {/* RAG Sources */}
          {ragChunks.length > 0 && (
            <Panel>
              <PanelLabel>Sources utilisées</PanelLabel>
              <SourcesList>
                {Object.values(
                  ragChunks.reduce((acc, c) => {
                    if (!acc[c.filename] || c.score > acc[c.filename].score) {
                      acc[c.filename] = { filename: c.filename, score: c.score };
                    }
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b.score - a.score)
                  .map(({ filename, score }) => (
                    <SourceItem key={filename}>
                      <span className="dot" />
                      <span className="name" title={filename}>{filename}</span>
                      <span className="score">{score}%</span>
                    </SourceItem>
                  ))}
              </SourcesList>
            </Panel>
          )}

          {/* Recent Historique */}
          <Panel>
            <PanelLabel>Générations Récentes</PanelLabel>
            {recentGenerations.length === 0 ? (
              <span style={{ fontSize: theme.fontSizes.sm, color: theme.colors.onSurfaceVariant }}>
                Aucune génération sauvegardée pour l'instant.
              </span>
            ) : (
              recentGenerations.map((item) => (
                <RecentItem key={item.id} onClick={() => onNavigate?.("library")}>
                  <div className="title">{item.title}</div>
                  <div className="meta">
                    <span className="date">{new Date(item.createdAt).toLocaleDateString("fr-FR")}</span>
                    <span className="count">{item.storiesCount} Stories</span>
                  </div>
                </RecentItem>
              ))
            )}
            <SeeAllLink onClick={() => onNavigate?.("library")}>Voir tout l'historique →</SeeAllLink>
          </Panel>
        </RightColumn>
      </Content>

      {/* Mobile sticky bar */}
      <MobileStickyBar>
        <OutlineBtn onClick={handleCopy} $copied={copied} style={{ flex: 1 }}>
          <span className="icon">{copied ? "done" : "content_copy"}</span>
          {copied ? "Copié !" : "Copier"}
        </OutlineBtn>
        <ExportBtn style={{ flex: 2 }} onClick={handleTrelloExport}>
          <span className="icon">view_kanban</span>
          Exporter vers Trello
        </ExportBtn>
        <ExportBtn style={{ flex: 1 }} onClick={handleCsvExport}>
          <span className="icon">download</span>
          CSV
        </ExportBtn>
      </MobileStickyBar>
    </PageWrapper>
  );
}
