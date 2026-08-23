// components/layout/BottomNav.jsx
import styled from "styled-components";
import { theme } from "../../theme";

const NavWrapper = styled.nav`
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 64px;
  background: ${theme.colors.surfaceContainerLow};
  border-top: 1px solid ${theme.colors.outlineVariant};
  display: none;
  justify-content: space-around;
  align-items: center;
  padding: 0 ${theme.spacing.sm};
  border-radius: 16px 16px 0 0;
  z-index: 50;

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: flex;
  }
`;

const NavItem = styled.a`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 12px;
  border-radius: ${theme.radii.md};
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;

  background: ${({ $active }) =>
    $active ? theme.colors.primaryContainer : "transparent"};
  color: ${({ $active }) =>
    $active ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant};

  &:active {
    transform: scale(0.9);
  }

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 22px;
    font-variation-settings: "FILL" ${({ $active }) => ($active ? 1 : 0)},
      "wght" 400, "GRAD" 0, "opsz" 24;
  }

  span.label {
    font-size: 10px;
    font-weight: ${({ $active }) => ($active ? "700" : "500")};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const NAV_ITEMS = [
  { id: "dashboard", label: "Tableau", icon: "dashboard" },
  { id: "forge", label: "Brief", icon: "auto_awesome" },
  { id: "library", label: "Hist.", icon: "history" },
  { id: "settings", label: "Réglages", icon: "settings" },
];

export default function BottomNav({ activeItem = "dashboard", onNavigate }) {
  return (
    <NavWrapper>
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.id}
          $active={activeItem === item.id}
          onClick={() => onNavigate?.(item.id)}
        >
          <span className="icon">{item.icon}</span>
          <span className="label">{item.label}</span>
        </NavItem>
      ))}
    </NavWrapper>
  );
}
