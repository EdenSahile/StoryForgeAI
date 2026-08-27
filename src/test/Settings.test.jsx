import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Settings from '../screens/Settings';
import { saveGeneration, getGenerations } from '../utils/libraryStorage';

function seed(n) {
  for (let i = 0; i < n; i++) {
    saveGeneration({ brief: `Brief ${i}`, stories: 's', storiesCount: 1 });
  }
}

beforeEach(() => {
  localStorage.clear();
});

describe('Settings — compteur de générations au montage', () => {
  it('affiche "Aucune génération sauvegardée..." quand il n\'y en a 0', () => {
    render(<Settings />);
    expect(screen.getByText('Aucune génération sauvegardée dans ce navigateur.')).toBeInTheDocument();
  });

  it('affiche "1 génération sauvegardée..." au singulier pour 1 génération', () => {
    seed(1);
    render(<Settings />);
    expect(screen.getByText('1 génération sauvegardée dans ce navigateur.')).toBeInTheDocument();
  });

  it('affiche "X générations sauvegardées..." au pluriel pour 2+ générations', () => {
    seed(2);
    render(<Settings />);
    expect(screen.getByText('2 générations sauvegardées dans ce navigateur.')).toBeInTheDocument();
  });
});

describe('Settings — bouton "Effacer l\'historique"', () => {
  it('est désactivé quand il n\'y a aucune génération', () => {
    render(<Settings />);
    expect(screen.getByRole('button', { name: "Effacer l'historique" })).toBeDisabled();
  });

  it('est activé dès qu\'il y a au moins une génération', () => {
    seed(1);
    render(<Settings />);
    expect(screen.getByRole('button', { name: "Effacer l'historique" })).not.toBeDisabled();
  });
});

describe('Settings — flux de confirmation', () => {
  beforeEach(() => {
    seed(1);
  });

  it('affiche "Confirmer ?" avec Oui/Annuler au clic, et fait disparaître le bouton initial', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: "Effacer l'historique" }));

    expect(screen.getByText('Confirmer ?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oui, effacer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Effacer l'historique" })).not.toBeInTheDocument();
  });

  it('"Annuler" revient à l\'état initial, bouton toujours activé (rien supprimé)', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: "Effacer l'historique" }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByText('Confirmer ?')).not.toBeInTheDocument();
    const dangerBtn = screen.getByRole('button', { name: "Effacer l'historique" });
    expect(dangerBtn).toBeInTheDocument();
    expect(dangerBtn).not.toBeDisabled();
  });

  it('"Oui, effacer" affiche le chip "Effacé", remet le compteur à 0, et vide réellement le storage', () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: "Effacer l'historique" }));
    fireEvent.click(screen.getByRole('button', { name: 'Oui, effacer' }));

    expect(screen.getByText('Effacé')).toBeInTheDocument();
    expect(screen.queryByText('Confirmer ?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Effacer l'historique" })).not.toBeInTheDocument();
    expect(screen.getByText('Aucune génération sauvegardée dans ce navigateur.')).toBeInTheDocument();

    // Pas seulement l'UI : le storage réel doit être vidé.
    expect(getGenerations()).toEqual([]);
    expect(localStorage.getItem('storyforge_library')).toBeNull();
  });
});

describe('Settings — bloc "À propos"', () => {
  it('affiche le nom, la version et la description de l\'app', () => {
    render(<Settings />);

    expect(screen.getByText('StoryPilot AI')).toBeInTheDocument();
    expect(screen.getByText('v2.0 — juin 2026')).toBeInTheDocument();
    expect(screen.getByText(/Générateur de user stories à partir d'un brief métier/)).toBeInTheDocument();
  });

  it("n'affiche aucun badge de stack technique (infrastructure non pertinente pour l'utilisateur final)", () => {
    render(<Settings />);

    for (const tag of ['React 18', 'Vite 5', 'styled-components', 'Claude API', 'Pinecone', 'Vercel']) {
      expect(screen.queryByText(tag)).not.toBeInTheDocument();
    }
  });
});
