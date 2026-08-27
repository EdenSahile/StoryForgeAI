import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Settings from '../screens/Settings';
import { saveGeneration } from '../utils/libraryStorage';

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

describe('Settings — "Effacer l\'historique" retiré (redondant avec "Supprimer tout" sur l\'écran Historique)', () => {
  it('n\'affiche pas le bouton "Effacer l\'historique", quel que soit le nombre de générations', () => {
    seed(2);
    render(<Settings />);

    expect(screen.queryByRole('button', { name: "Effacer l'historique" })).not.toBeInTheDocument();
    expect(screen.queryByText('Confirmer ?')).not.toBeInTheDocument();
    expect(screen.queryByText('Effacé')).not.toBeInTheDocument();
  });

  it('garde uniquement la ligne d\'information, sans action de suppression associée', () => {
    render(<Settings />);

    expect(screen.getByText('Historique des générations')).toBeInTheDocument();
    expect(screen.getByText('Aucune génération sauvegardée dans ce navigateur.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /effacer/i })).not.toBeInTheDocument();
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
