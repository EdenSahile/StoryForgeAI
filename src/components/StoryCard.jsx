// src/components/StoryCard.jsx
import styled, { keyframes } from "styled-components";
import { theme } from "../theme";

const cardEntrance = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const StoryCardArticle = styled.article`
  background: ${theme.colors.surfaceContainer};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.xl};
  overflow: hidden;
  animation: ${cardEntrance} 0.4s ease both;
  animation-delay: ${({ $delay }) => $delay}s;
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
  min-width: 0; /* enfant de CardGrid : évite que la colonne s'élargisse */

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
  min-width: 0; /* enfant de CardGrid : GherkinBlock scrolle en interne (overflow-x) */

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

export default function StoryCard({ story }) {
  return (
    <StoryCardArticle $delay={(story.id - 1) * 0.1}>
      <CardHeader>
        <h3>US-{String(story.id).padStart(2, "0")} : {story.title}</h3>
        <ComplexityBadge $level={story.complexity}>
          {story.complexity}
        </ComplexityBadge>
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
                Statement non détecté dans la réponse générée.
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
    </StoryCardArticle>
  );
}
