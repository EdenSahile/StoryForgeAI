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
    opacity: 0.7;
    margin-top: 2px;
  }
`;

const Nav = styled.nav`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const NavItem = styled.a`
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
  background: ${({ $active }) =>
    $active
      ? `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`
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

const SecondaryLinks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 ${theme.spacing.md};

  a {
    font-size: ${theme.fontSizes.xs};
    color: ${theme.colors.onSurfaceVariant};
    text-decoration: none;
    transition: color 0.2s;

    &:hover {
      color: ${theme.colors.primary};
    }
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
            $active={activeItem === item.id}
            onClick={() => onNavigate?.(item.id)}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </NavItem>
        ))}
      </Nav>

      <SidebarBottom>
        {activeItem !== "forge" && (
          <NewStoryBtn onClick={() => onNavigate?.("forge")}>
            <span className="icon">add</span>
            New Story
          </NewStoryBtn>
        )}
        <SecondaryLinks>
          <a href="#">Help Center</a>
          <a href="#">Feedback</a>
        </SecondaryLinks>
      </SidebarBottom>
    </SidebarWrapper>
  );
}
