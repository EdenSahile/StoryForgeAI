import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import BottomNav from '../components/layout/BottomNav';

// Régression a11y : NavItem était un `styled.a` sans `href` (cliquable souris
// uniquement, hors ordre de tabulation). Il doit rester un vrai `<button>`.
//
// `{ hidden: true }` sur les requêtes par rôle : NavWrapper est `display: none`
// par défaut et `display: flex` seulement sous `@media (max-width: mobile)` —
// jsdom n'évalue pas les media queries, la nav est donc "cachée" au sens
// accessibilité dans l'environnement de test. On veut quand même l'inspecter.

describe('BottomNav — navigation atteignable au clavier', () => {
  it('les 4 items de nav sont des <button type="button">, pas des liens', () => {
    render(<BottomNav onNavigate={vi.fn()} />);
    const nav = screen.getByRole('navigation', { hidden: true });

    const items = within(nav).getAllByRole('button', { hidden: true });
    expect(items).toHaveLength(4);
    expect(within(nav).queryAllByRole('link', { hidden: true })).toHaveLength(0);

    for (const btn of items) {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn).toHaveAttribute('type', 'button');
    }
  });

  it('activer un item de nav appelle onNavigate avec l\'écran correspondant', () => {
    const onNavigate = vi.fn();
    render(<BottomNav activeItem="dashboard" onNavigate={onNavigate} />);
    const nav = screen.getByRole('navigation', { hidden: true });

    fireEvent.click(within(nav).getByRole('button', { name: 'Hist.', hidden: true }));
    expect(onNavigate).toHaveBeenCalledWith('library');

    fireEvent.click(within(nav).getByRole('button', { name: 'Brief', hidden: true }));
    expect(onNavigate).toHaveBeenCalledWith('forge');
  });

  it('le nom accessible de chaque item est le libellé seul, sans le nom de l\'icône', () => {
    render(<BottomNav onNavigate={vi.fn()} />);
    const nav = screen.getByRole('navigation', { hidden: true });

    for (const label of ['Tableau', 'Brief', 'Hist.', 'Réglages']) {
      expect(
        within(nav).getByRole('button', { name: label, hidden: true }),
      ).toBeInTheDocument();
    }
  });
});
