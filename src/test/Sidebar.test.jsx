import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Sidebar from '../components/layout/Sidebar';

// Régression a11y : NavItem était un `styled.a` utilisé sans `href` (cliquable
// souris uniquement, hors de l'ordre de tabulation, ne réagit pas à Entrée/
// Espace). Il doit rester un vrai `<button>`.

describe('Sidebar — navigation atteignable au clavier', () => {
  it('les 4 items de nav sont des <button type="button"> atteignables au focus, pas des liens', () => {
    render(<Sidebar onNavigate={vi.fn()} />);
    const nav = screen.getByRole('navigation');

    const items = within(nav).getAllByRole('button');
    expect(items).toHaveLength(4);
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);

    for (const btn of items) {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn).toHaveAttribute('type', 'button');
      // Un <button> prend le focus ; un <a> sans href, non (vérifié : jsdom
      // modèle correctement cette différence de focusabilité).
      btn.focus();
      expect(btn).toHaveFocus();
    }
  });

  it('le nom accessible de chaque item est le libellé seul, sans le nom de l\'icône Material Symbols', () => {
    render(<Sidebar onNavigate={vi.fn()} />);
    const nav = screen.getByRole('navigation');

    // getByRole avec name EXACT : échoue si "dashboard", "auto_awesome"… fuite
    // dans le nom accessible (icône non masquée par aria-hidden).
    for (const label of ['Tableau de bord', 'Brief', 'Historique', 'Réglages']) {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('activer un item de nav appelle onNavigate avec l\'écran correspondant', () => {
    const onNavigate = vi.fn();
    render(<Sidebar activeItem="dashboard" onNavigate={onNavigate} />);
    const nav = screen.getByRole('navigation');

    fireEvent.click(within(nav).getByRole('button', { name: /Historique/ }));
    expect(onNavigate).toHaveBeenCalledWith('library');

    fireEvent.click(within(nav).getByRole('button', { name: /Réglages/ }));
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });
});
