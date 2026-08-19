// screens/Dashboard.jsx
import { useState, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { theme } from "../theme";
import { getGenerations, deleteGeneration } from "../utils/libraryStorage";
import { formatRelativeDate, getMonthlyStats } from "../logic/dashboardStats";

// ─── Animations ───────────────────────────────────────────
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
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
    padding-bottom: 80px;
  }
`;

const TopBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 64px;
  padding: 0 ${theme.spacing.lg};
  background: color-mix(in srgb, ${theme.colors.surface} 85%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid ${theme.colors.outlineVariant};
`;

const TopBarTitle = styled.h2`
  font-size: ${theme.fontSizes.xl};
  font-weight: 800;
  color: ${theme.colors.onSurface};
  position: absolute;
  left: 50%;
  transform: translateX(-50%);

  @media (max-width: ${theme.breakpoints.mobile}) {
    position: static;
    transform: none;
    font-size: ${theme.fontSizes.lg};
  }
`;

const TopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  margin-left: auto;
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

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${theme.colors.primaryContainer};
  border: 2px solid ${theme.colors.outlineVariant};
  overflow: hidden;
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const Content = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: ${theme.spacing.xl};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
    gap: ${theme.spacing.lg};
  }
`;

// ─── Welcome ──────────────────────────────────────────────
const WelcomeSection = styled.section`
  h3 {
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
  }
`;

// ─── Stats ────────────────────────────────────────────────
const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${theme.spacing.lg};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.md};
  }
`;

const StatCard = styled.div`
  padding: ${theme.spacing.lg};
  background: ${theme.colors.surfaceContainer};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  transition: border-color 0.2s;

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: ${theme.spacing.md};
  }

  &:hover {
    border-color: rgba(209, 169, 84, 0.3);
  }

  .label {
    font-size: ${theme.fontSizes.xs};
    font-weight: 500;
    color: ${theme.colors.onSurfaceVariant};
    letter-spacing: 0.05em;
  }

  .value-group {
    display: flex;
    flex-direction: column;
    gap: 2px;

    @media (max-width: ${theme.breakpoints.mobile}) {
      align-items: flex-end;
    }
  }

  .value {
    font-size: ${theme.fontSizes["4xl"]};
    font-weight: 700;
    letter-spacing: -0.02em;
    color: ${({ $color }) => $color || theme.colors.primary};

    @media (max-width: ${theme.breakpoints.mobile}) {
      font-size: ${theme.fontSizes.lg};
    }
  }

  .sub {
    font-size: ${theme.fontSizes.xs};
    color: ${({ $color }) => $color || theme.colors.primary};
    opacity: 0.8;
  }

  .mobile-icon {
    display: none;
    width: 40px;
    height: 40px;
    border-radius: ${theme.radii.sm};
    background: ${({ $color }) => $color || theme.colors.primary}14;
    align-items: center;
    justify-content: center;
    color: ${({ $color }) => $color || theme.colors.primary};

    .icon {
      font-family: "Material Symbols Outlined";
      font-size: 20px;
    }

    @media (max-width: ${theme.breakpoints.mobile}) {
      display: flex;
    }
  }
`;

// ─── Bottom Grid ──────────────────────────────────────────
const BottomGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: ${theme.spacing.xl};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

// ─── Recent Generations ───────────────────────────────────
const RecentSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};

  h4 {
    font-size: ${theme.fontSizes.xl};
    font-weight: 700;
    color: ${theme.colors.onSurface};
  }
`;

const GenerationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const GenerationCard = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.md};
  background: ${theme.colors.surfaceContainerLow};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.lg};
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 0;
    background: ${theme.colors.primary};
    border-radius: ${theme.radii.lg} 0 0 ${theme.radii.lg};
    transition: width 0.2s;
  }

  &:hover {
    background: ${theme.colors.surfaceContainer};
    border-color: rgba(209, 169, 84, 0.2);

    &::before {
      width: 3px;
    }

    .chevron {
      color: ${theme.colors.primary};
    }
  }

  &:active {
    transform: scale(0.99);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 4px;
  }

  .title {
    font-size: ${theme.fontSizes.lg};
    font-weight: 700;
    color: ${theme.colors.onSurface};
  }

  .meta {
    font-size: ${theme.fontSizes.sm};
    color: ${theme.colors.onSurfaceVariant};
  }

  .chevron {
    font-family: "Material Symbols Outlined";
    font-size: 20px;
    color: ${theme.colors.outline};
    transition: color 0.2s;
  }
`;

const DashDeleteBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: ${theme.radii.sm};
  color: ${theme.colors.outline};
  font-family: "Material Symbols Outlined";
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;

  ${GenerationCard}:hover & {
    opacity: 1;
  }

  &:hover {
    color: ${theme.colors.error};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: none;
  }
`;

// ─── CTA Card ─────────────────────────────────────────────
const CTACard = styled.div`
  height: 100%;
  min-height: 280px;
  background: rgba(29, 43, 40, 0.3);
  border: 2px dashed ${theme.colors.outlineVariant};
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.xl};
  text-align: center;
  gap: ${theme.spacing.lg};
  transition: border-color 0.2s;
  cursor: pointer;

  &:hover {
    border-color: rgba(209, 169, 84, 0.4);

    .cta-icon {
      transform: scale(1.1);
    }
  }

  .cta-icon {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: rgba(209, 169, 84, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${theme.colors.primary};
    transition: transform 0.2s;
    box-shadow: 0 0 20px rgba(209, 169, 84, 0.2);

    .icon {
      font-family: "Material Symbols Outlined";
      font-size: 32px;
      font-variation-settings:
        "FILL" 1,
        "wght" 400,
        "GRAD" 0,
        "opsz" 24;
    }
  }

  .cta-text {
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing.sm};

    h5 {
      font-size: ${theme.fontSizes.xl};
      font-weight: 700;
      color: ${theme.colors.onSurface};
    }

    p {
      font-size: ${theme.fontSizes.sm};
      color: ${theme.colors.onSurfaceVariant};
      max-width: 200px;
      margin: 0 auto;
      line-height: 1.5;
    }
  }
`;

const GenerateBtn = styled.button`
  padding: ${theme.spacing.sm} ${theme.spacing.xl};
  border-radius: ${theme.radii.full};
  border: none;
  background: ${theme.colors.primary};
  color: ${theme.colors.onPrimary};
  font-weight: 700;
  font-size: ${theme.fontSizes.md};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  transition: all 0.2s;
  box-shadow: 0 4px 20px rgba(209, 169, 84, 0.3);

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 18px;
  }

  &:hover {
    box-shadow: 0 8px 28px rgba(209, 169, 84, 0.45);
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.97);
  }
`;

// ─── Component ────────────────────────────────────────────
export default function Dashboard({ onNavigate }) {
  const [generations, setGenerations] = useState([]);

  useEffect(() => {
    setGenerations(getGenerations());
  }, []);

  const handleDelete = (e, id) => {
    e.stopPropagation();
    deleteGeneration(id);
    setGenerations(getGenerations());
  };

  const { storiesThisMonth, generationsThisMonth } = getMonthlyStats(generations);

  const lastGen = generations[0];

  const stats = [
    {
      label: "Stories sauvegardées ce mois",
      value: storiesThisMonth || "—",
      sub: `via ${generationsThisMonth} génération(s)`,
      color: theme.colors.primary,
      icon: "description",
    },
    {
      label: "Générations totales",
      value: generations.length || "—",
      sub: "Sauvegardées en local",
      color: theme.colors.secondary,
      icon: "folder_zip",
    },
    {
      label: "Dernière génération",
      value: lastGen ? formatRelativeDate(lastGen.createdAt) : "—",
      sub: lastGen ? lastGen.title : null,
      color: theme.colors.success,
      icon: "schedule",
    },
  ];

  const recent = generations.slice(0, 3);

  return (
    <PageWrapper>
      <TopBar>
        <TopBarTitle>StoryPilot AI</TopBarTitle>
        <TopBarActions>
          <IconBtn>
            <span className="icon">dark_mode</span>
          </IconBtn>
          <Avatar>
            <div
              style={{
                width: "100%",
                height: "100%",
                background: theme.colors.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.colors.onPrimary,
                fontWeight: 700,
                fontSize: "14px",
              }}
            >
              E
            </div>
          </Avatar>
        </TopBarActions>
      </TopBar>

      <Content>
        {/* Welcome */}
        <WelcomeSection>
          <h3>Bonjour Eden 👋</h3>
          <p>Prêt à forger vos prochaines user stories ?</p>
        </WelcomeSection>

        {/* Stats */}
        <StatsGrid>
          {stats.map((stat) => (
            <StatCard key={stat.label} $color={stat.color}>
              <span className="label">{stat.label}</span>
              <div className="value-group">
                <span className="value">{stat.value}</span>
                {stat.sub && <span className="sub">{stat.sub}</span>}
              </div>
              <div className="mobile-icon">
                <span className="icon">{stat.icon}</span>
              </div>
            </StatCard>
          ))}
        </StatsGrid>

        {/* Bottom Grid */}
        <BottomGrid>
          {/* Recent Generations */}
          <RecentSection>
            <h4>Générations récentes</h4>
            <GenerationList>
              {recent.length === 0 ? (
                <span style={{ fontSize: theme.fontSizes.sm, color: theme.colors.onSurfaceVariant }}>
                  Aucune génération sauvegardée pour l'instant.
                </span>
              ) : (
                recent.map((item) => (
                  <GenerationCard
                    key={item.id}
                    onClick={() => onNavigate?.("library")}
                  >
                    <div className="info">
                      <span className="title">{item.title}</span>
                      <span className="meta">
                        {formatRelativeDate(item.createdAt)} · {item.storiesCount} stories
                      </span>
                    </div>
                    <DashDeleteBtn
                      title="Supprimer cette génération"
                      onClick={(e) => handleDelete(e, item.id)}
                    >
                      delete
                    </DashDeleteBtn>
                    <span className="chevron">chevron_right</span>
                  </GenerationCard>
                ))
              )}
            </GenerationList>
          </RecentSection>

          {/* CTA */}
          <CTACard onClick={() => onNavigate?.("forge")}>
            <div className="cta-icon">
              <span className="icon">auto_awesome</span>
            </div>
            <div className="cta-text">
              <h5>Nouvelle génération</h5>
              <p>Décris un besoin métier pour commencer</p>
            </div>
            <GenerateBtn onClick={() => onNavigate?.("forge")}>
              <span className="icon">bolt</span>
              Générer
            </GenerateBtn>
          </CTACard>
        </BottomGrid>
      </Content>
    </PageWrapper>
  );
}
