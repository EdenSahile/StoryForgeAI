// src/components/ConfirmModal.jsx
import styled from "styled-components";
import { theme } from "../theme";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: ${theme.colors.scrim};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.md};
  z-index: 100;
`;

const Card = styled.div`
  width: 100%;
  max-width: 380px;
  background: ${theme.colors.surfaceContainer};
  border: 1px solid ${theme.colors.outlineVariant};
  border-radius: ${theme.radii.xl};
  padding: ${theme.spacing.xl};
  box-shadow: ${theme.shadows.card};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};

  .title {
    font-size: ${theme.fontSizes.lg};
    font-weight: 700;
    color: ${theme.colors.onSurface};
  }

  .item-label {
    font-size: ${theme.fontSizes.md};
    font-weight: 600;
    color: ${theme.colors.onSurface};
    word-break: break-word;
  }

  .detail {
    font-size: ${theme.fontSizes.sm};
    color: ${theme.colors.onSurfaceVariant};
  }

  .consequence {
    font-size: ${theme.fontSizes.sm};
    color: ${theme.colors.onSurfaceVariant};
    margin-bottom: ${theme.spacing.sm};
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: ${theme.spacing.sm};
  }

  button {
    padding: 8px 16px;
    border-radius: ${theme.radii.md};
    font-size: ${theme.fontSizes.sm};
    font-weight: 700;
    cursor: pointer;
    border: none;
  }

  .btn-cancel {
    background: ${theme.colors.surfaceContainerHighest};
    color: ${theme.colors.onSurfaceVariant};
  }

  .btn-confirm {
    background: ${theme.colors.error};
    color: ${theme.colors.onPrimary};
  }
`;

/**
 * Pop-in de confirmation stylée, en remplacement de `confirm()` natif —
 * modale centrée, fond assombri (`theme.colors.scrim`). Le composant n'est
 * responsable que de l'affichage : c'est l'appelant qui décide quand la
 * monter (`{pendingAction && <ConfirmModal ... />}`), comme pour les autres
 * pop-in du projet.
 * @param {string} title - Question posée (ex: "Supprimer ce document ?")
 * @param {string} [itemLabel] - Nom de l'élément concerné (ex: nom de fichier)
 * @param {string} [detail] - Détail complémentaire (ex: "5 chunks indexés")
 * @param {string} consequence - Conséquence réelle de l'action, sans jargon technique
 * @param {string} [confirmLabel="Supprimer"] - Libellé du bouton de confirmation
 * @param {string} [cancelLabel="Annuler"] - Libellé du bouton d'annulation
 * @param {function} onConfirm - Appelé au clic sur le bouton de confirmation
 * @param {function} onCancel - Appelé au clic sur le bouton d'annulation
 */
export default function ConfirmModal({
  title,
  itemLabel,
  detail,
  consequence,
  confirmLabel = "Supprimer",
  cancelLabel = "Annuler",
  onConfirm,
  onCancel,
}) {
  return (
    <Overlay>
      <Card>
        <span className="title">{title}</span>
        {itemLabel && <span className="item-label">{itemLabel}</span>}
        {detail && <span className="detail">{detail}</span>}
        <span className="consequence">{consequence}</span>
        <div className="actions">
          <button className="btn-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </Card>
    </Overlay>
  );
}
