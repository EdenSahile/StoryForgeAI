// src/screens/Settings.jsx
import { useState, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { theme } from "../theme";
import { getGenerations } from "../utils/libraryStorage";

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const PageWrapper = styled.div`
  margin-left: 240px;
  min-height: 100vh;
  background: ${theme.colors.background};
  animation: ${fadeInUp} 0.4s ease;
  overflow-x: hidden;

  @media (max-width: ${theme.breakpoints.mobile}) {
    margin-left: 0;
    padding-bottom: 80px;
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
  gap: ${theme.spacing.sm};
`;

const TopBarTitle = styled.h1`
  font-size: ${theme.fontSizes.xl};
  font-weight: 800;
  color: ${theme.colors.onSurface};
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
  flex-shrink: 0;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 22px;
  }

  &:hover {
    color: ${theme.colors.primary};
    background: ${theme.colors.surfaceContainerHighest};
  }
`;

const Content = styled.main`
  max-width: 680px;
  margin: 0 auto;
  padding: ${theme.spacing.xl} ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: 32px;

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.lg} ${theme.spacing.md};
    gap: ${theme.spacing.lg};
  }
`;

const Section = styled.section`
  background: ${theme.colors.surfaceContainerLow};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: 16px;
  overflow: hidden;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid ${theme.colors.outlineVariant};

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 20px;
    color: ${theme.colors.primary};
  }

  h2 {
    font-size: ${theme.fontSizes.md};
    font-weight: 700;
    color: ${theme.colors.onSurface};
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  gap: 16px;

  & + & {
    border-top: 1px solid ${theme.colors.outlineVariant};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const RowLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;

  .label {
    font-size: ${theme.fontSizes.sm};
    font-weight: 600;
    color: ${theme.colors.onSurface};
  }

  .sublabel {
    font-size: ${theme.fontSizes.xs};
    color: ${theme.colors.onSurfaceVariant};
  }
`;

// ── Apparence ──────────────────────────────────────────────

const ThemeChip = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 20px;
  font-size: ${theme.fontSizes.xs};
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 1px solid;
  font-family: inherit;
  cursor: pointer;
  background: ${({ $active }) =>
    $active
      ? `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`
      : "transparent"};
  border-color: ${({ $active }) =>
    $active ? theme.colors.primary : theme.colors.outlineVariant};
  color: ${({ $active }) =>
    $active ? theme.colors.primary : theme.colors.outline};
  opacity: ${({ $active }) => ($active ? 1 : 0.7)};
  transition: all 0.15s;

  &:hover {
    opacity: 1;
    border-color: ${theme.colors.primary};
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
`;

// ── À propos ────────────────────────────────────────────────

const AboutBlock = styled.div`
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const AppIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  .logo {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: ${theme.gradients.primary};
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Material Symbols Outlined";
    font-size: 22px;
    color: ${theme.colors.onPrimary};
  }

  .meta {
    .name {
      font-size: ${theme.fontSizes.md};
      font-weight: 800;
      color: ${theme.colors.onSurface};
    }
    .version {
      font-size: ${theme.fontSizes.xs};
      color: ${theme.colors.onSurfaceVariant};
      margin-top: 2px;
    }
  }
`;

const AboutDesc = styled.p`
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.onSurfaceVariant};
  line-height: 1.6;
`;

// ─── Component ─────────────────────────────────────────────

export default function Settings({ themeMode, onThemeChange }) {
  const [genCount, setGenCount] = useState(0);

  useEffect(() => {
    setGenCount(getGenerations().length);
  }, []);

  return (
    <PageWrapper>
      <TopBar>
        <TopBarTitle>Réglages</TopBarTitle>
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
      </TopBar>

      <Content>
        {/* ── Apparence ── */}
        <Section>
          <SectionHeader>
            <span className="icon">palette</span>
            <h2>Apparence</h2>
          </SectionHeader>
          <Row>
            <RowLabel>
              <span className="label">Thème</span>
              <span className="sublabel">Basculez entre le thème sombre et le thème clair.</span>
            </RowLabel>
            <div style={{ display: "flex", gap: "8px" }}>
              <ThemeChip
                type="button"
                $active={themeMode === "dark"}
                onClick={() => onThemeChange?.("dark")}
              >
                <span className="dot" />
                Sombre
              </ThemeChip>
              <ThemeChip
                type="button"
                $active={themeMode === "light"}
                onClick={() => onThemeChange?.("light")}
              >
                <span className="dot" />
                Clair
              </ThemeChip>
            </div>
          </Row>
        </Section>

        {/* ── Données locales ── */}
        <Section>
          <SectionHeader>
            <span className="icon">storage</span>
            <h2>Données locales</h2>
          </SectionHeader>
          <Row>
            <RowLabel>
              <span className="label">Historique des générations</span>
              <span className="sublabel">
                {genCount === 0
                  ? "Aucune génération sauvegardée dans ce navigateur."
                  : `${genCount} génération${genCount > 1 ? "s" : ""} sauvegardée${genCount > 1 ? "s" : ""} dans ce navigateur.`}
              </span>
            </RowLabel>
          </Row>
        </Section>

        {/* ── À propos ── */}
        <Section>
          <SectionHeader>
            <span className="icon">info</span>
            <h2>À propos</h2>
          </SectionHeader>
          <AboutBlock>
            <AppIdentity>
              <div className="logo">auto_stories</div>
              <div className="meta">
                <div className="name">StoryPilot AI</div>
                <div className="version">v2.0 — juin 2026</div>
              </div>
            </AppIdentity>
            <AboutDesc>
              Générateur de user stories à partir d'un brief métier, avec récupération
              augmentée sur une base de connaissance (RAG) et streaming temps réel via
              l'API Claude.
            </AboutDesc>
          </AboutBlock>
        </Section>
      </Content>
    </PageWrapper>
  );
}
