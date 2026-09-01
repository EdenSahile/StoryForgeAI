// components/layout/Sidebar.jsx
import styled from "styled-components";
import { theme } from "../../theme";

const SidebarWrapper = styled.aside`
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: 240px;
  background: ${theme.colors.surfaceContainerLow};
  border-right: 1px solid ${theme.colors.outlineVariant};
  display: flex;
  flex-direction: column;
  padding: ${theme.spacing.lg} ${theme.spacing.md};
  z-index: 40;

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: none;
  }
`;

const Logo = styled.div`
  margin-bottom: ${theme.spacing["3xl"]};

  h1 {
    font-size: ${theme.fontSizes["2xl"]};
    font-weight: 800;
    color: ${theme.colors.primary};
    letter-spacing: -0.01em;
  }

  p {
    font-size: ${theme.fontSizes.xs};
    color: ${theme.colors.primary};
    letter-spacing: 0.12em;
    /* Pas d'opacity : diluait le texte sous le seuil WCAG AA
       (2.99:1 en clair). primary plein = 5.30:1 clair / 7.70:1 sombre. */
    margin-top: 2px;
  }
`;

const Nav = styled.nav`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const NavItem = styled.button`
  /* <button> (et non <a> sans href) : atteignable au clavier, activable
     Entrée/Espace. Reset des styles UA du bouton pour retrouver exactement le
     rendu de l'ancien <a> (qui héritait font/couleur, sans bordure ni fond). */
  appearance: none;
  border: none;
  background: none;
  font-family: inherit;
  text-align: left;
  width: 100%;

  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: ${theme.radii.md};
  font-size: ${theme.fontSizes.sm};
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s;
  cursor: pointer;
  border-right: 2px solid transparent;

  color: ${({ $active }) =>
    $active ? theme.colors.primary : theme.colors.onSurfaceVariant};
  /* 8% et non 12% : à 12% le fond teinté (≈ #e4efea en clair) faisait
     tomber le texte primary à 4.50:1, sous le seuil WCAG AA. À 8% le fond
     est plus clair (≈ #edf4f1) → 4.76:1 clair / 6.76:1 sombre. L'état
     actif reste porté par la barre latérale, le gras et la couleur. */
  background: ${({ $active }) =>
    $active
      ? `color-mix(in srgb, ${theme.colors.primary} 8%, transparent)`
      : "transparent"};
  border-right-color: ${({ $active }) =>
    $active ? theme.colors.primary : "transparent"};
  font-weight: ${({ $active }) => ($active ? "700" : "500")};

  &:hover {
    background: ${({ $active }) =>
      $active ? undefined : theme.colors.surfaceContainerHighest};
    color: ${({ $active }) =>
      $active ? theme.colors.primary : theme.colors.onSurface};
  }

  .icon {
    font-size: 20px;
    font-family: "Material Symbols Outlined";
    font-variation-settings: "FILL" ${({ $active }) => ($active ? 1 : 0)},
      "wght" 400, "GRAD" 0, "opsz" 24;
  }
`;

const SidebarBottom = styled.div`
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const NewStoryBtn = styled.button`
  width: 100%;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: ${theme.radii.lg};
  border: none;
  background: ${theme.colors.primary};
  color: ${theme.colors.onPrimary};
  font-weight: 700;
  font-size: ${theme.fontSizes.sm};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
  transition: all 0.2s;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.97);
  }

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 18px;
  }
`;

const UserCard = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.sm};
  border-radius: ${theme.radii.lg};
  background: ${theme.colors.surfaceContainer};
  margin-top: ${theme.spacing.md};

  img {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid ${theme.colors.outlineVariant};
  }

  .user-info p {
    font-size: ${theme.fontSizes.sm};
    font-weight: 700;
    color: ${theme.colors.onSurface};
  }

  .user-info span {
    font-size: 10px;
    color: ${theme.colors.onSurfaceVariant};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const NAV_ITEMS = [
  { id: "dashboard", label: "Tableau de bord", icon: "dashboard" },
  { id: "forge", label: "Brief", icon: "auto_awesome" },
  { id: "library", label: "Historique", icon: "history" },
  { id: "settings", label: "Réglages", icon: "settings" },
];

export default function Sidebar({ activeItem = "dashboard", onNavigate }) {
  return (
    <SidebarWrapper>
      <Logo>
        <h1>StoryPilot</h1>
        <p>Docs métier → stories</p>
      </Logo>

      <Nav>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            type="button"
            $active={activeItem === item.id}
            onClick={() => onNavigate?.(item.id)}
          >
            <span className="icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavItem>
        ))}
      </Nav>

      <SidebarBottom>
        {activeItem !== "forge" && (
          <NewStoryBtn onClick={() => onNavigate?.("forge")}>
            <span className="icon" aria-hidden="true">add</span>
            Nouveau brief
          </NewStoryBtn>
        )}
      </SidebarBottom>
    </SidebarWrapper>
  );
}
