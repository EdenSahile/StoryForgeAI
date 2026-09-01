// src/components/SuccessToast.jsx
import { useEffect, useRef } from "react";
import styled, { keyframes } from "styled-components";
import { theme } from "../theme";

const AUTO_DISMISS_MS = 3500;

const toastEnter = keyframes`
  from { opacity: 0; transform: translate(-50%, 12px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
`;

const Wrapper = styled.div`
  position: fixed;
  top: ${theme.spacing.lg};
  left: 50%;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  background: ${theme.colors.bgSuccess};
  border: 1px solid color-mix(in srgb, ${theme.colors.success} 30%, transparent);
  border-radius: ${theme.radii.lg};
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  color: ${theme.colors.textSuccess};
  font-size: ${theme.fontSizes.sm};
  font-weight: 700;
  box-shadow: ${theme.shadows.card};
  animation: ${toastEnter} 0.3s ease forwards;

  .icon {
    font-family: "Material Symbols Outlined";
    font-size: 20px;
  }
`;

/**
 * Toast de succès fixe, centré en haut de l'écran, avec disparition
 * automatique après un court délai. Ne rend rien si `message` est vide —
 * l'appelant garde le contrôle du contenu (texte adapté au contexte), ce
 * composant ne gère que l'affichage et le minutage.
 * @param {string} message - Texte affiché ; aucun rendu si vide/null
 * @param {function} onDismiss - Appelé automatiquement après le délai
 * @param {string} [icon="check_circle"] - Nom de l'icône Material Symbols
 */
export default function SuccessToast({ message, onDismiss, icon = "check_circle" }) {
  // Ref plutôt que dépendance directe : onDismiss est souvent une arrow
  // function inline côté appelant (nouvelle référence à chaque rendu), ce
  // qui redéclencherait l'effet et repousserait indéfiniment la disparition
  // si le parent se re-rend pour une autre raison pendant l'affichage.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <Wrapper role="status">
      <span className="icon" aria-hidden="true">{icon}</span>
      {message}
    </Wrapper>
  );
}
