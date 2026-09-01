import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Dashboard from '../screens/Dashboard';
import { saveGeneration } from '../utils/libraryStorage';

function renderDashboard(onNavigate = vi.fn()) {
  return { onNavigate, ...render(<Dashboard onNavigate={onNavigate} />) };
}

// Le label texte d'une carte stats est le seul enfant direct non-div de
// StatCard — .closest('div') depuis ce span remonte donc directement au
// conteneur de la carte (navigation structurelle par balise, pas par classe).
function getStatCard(label) {
  return screen.getByText(label).closest('div');
}

// Le titre de la génération la plus récente apparaît deux fois dans le DOM
// (sub de la carte "Dernière génération" + titre dans "Générations
// récentes") : on scope les requêtes sur cette liste à la section pour
// lever l'ambiguïté, plutôt que de se fier à getByText seul.
function getRecentSection() {
  return screen.getByText('Générations récentes').closest('section');
}

beforeEach(() => {
  localStorage.clear();
});

describe('Dashboard — état vide', () => {
  it('affiche le marqueur "valeur absente" (·) sur les 3 cartes stats', () => {
    renderDashboard();

    expect(screen.getAllByText('·')).toHaveLength(3);
    expect(screen.getByText('via 0 génération(s)')).toBeInTheDocument();
    expect(screen.getByText('Sauvegardées en local')).toBeInTheDocument();
    // La 3e carte ("Dernière génération") n'a pas de sub : lastGen est
    // undefined donc stat.sub vaut null — rien à chercher par construction,
    // il n'existe aucun titre de génération pouvant y apparaître.
  });

  it('affiche le message "Aucune génération sauvegardée pour l\'instant." dans Générations récentes', () => {
    renderDashboard();

    expect(screen.getByText("Aucune génération sauvegardée pour l'instant.")).toBeInTheDocument();
  });
});

describe('Dashboard — avec des générations', () => {
  function seedFour() {
    // Ordre d'appel = ordre chronologique de sauvegarde (la plus ancienne
    // en premier). getGenerations() les retourne triées du plus récent au
    // plus ancien, donc l'ordre affiché sera D, C, B, A.
    saveGeneration({ brief: 'Ancienne génération avant les trois autres', stories: 's', storiesCount: 2 });
    saveGeneration({ brief: 'Génération B', stories: 's', storiesCount: 5 });
    saveGeneration({ brief: 'Génération C', stories: 's', storiesCount: 1 });
    saveGeneration({ brief: 'Génération D la plus récente', stories: 's', storiesCount: 3 });
  }

  it('affiche les bonnes valeurs sur les 3 cartes stats', () => {
    seedFour();
    renderDashboard();

    const total = getStatCard('Générations totales');
    expect(within(total).getByText('4')).toBeInTheDocument();
    expect(within(total).getByText('Sauvegardées en local')).toBeInTheDocument();

    const monthly = getStatCard('Stories sauvegardées ce mois');
    expect(within(monthly).getByText('11')).toBeInTheDocument(); // 2+5+1+3
    expect(within(monthly).getByText('via 4 génération(s)')).toBeInTheDocument();

    const last = getStatCard('Dernière génération');
    expect(within(last).getByText('Il y a 0 min')).toBeInTheDocument();
    expect(within(last).getByText('Génération D la plus récente')).toBeInTheDocument();
  });

  it('affiche uniquement les 3 générations les plus récentes dans "Générations récentes"', () => {
    seedFour();
    renderDashboard();

    const recent = within(getRecentSection());
    expect(recent.getByText('Génération D la plus récente')).toBeInTheDocument();
    expect(recent.getByText('Génération C')).toBeInTheDocument();
    expect(recent.getByText('Génération B')).toBeInTheDocument();
    expect(recent.queryByText(/Ancienne génération avant les trois autres/)).not.toBeInTheDocument();
  });

  it('affiche le bon storiesCount ("X stories") sur chaque carte récente', () => {
    seedFour();
    renderDashboard();

    expect(screen.getByText(/· 3 stories$/)).toBeInTheDocument(); // D
    expect(screen.getByText(/· 1 stories$/)).toBeInTheDocument(); // C
    expect(screen.getByText(/· 5 stories$/)).toBeInTheDocument(); // B
  });

  it('appelle onNavigate("library") au clic sur une carte de génération', () => {
    saveGeneration({ brief: 'Une génération quelconque', stories: 's', storiesCount: 1 });
    const { onNavigate } = renderDashboard();

    fireEvent.click(within(getRecentSection()).getByText('Une génération quelconque'));

    expect(onNavigate).toHaveBeenCalledWith('library');
  });
});

describe('Dashboard — suppression d\'une génération', () => {
  it('ne déclenche pas onNavigate (stopPropagation) et retire réellement la génération du storage', () => {
    // saveGeneration génère l'id via Date.now().toString() : deux appels
    // synchrones consécutifs peuvent tomber sur la même milliseconde et
    // produire le même id (vérifié empiriquement), ce qui ferait supprimer
    // les deux entrées au lieu d'une seule via deleteGeneration. On fige le
    // temps et on l'avance manuellement entre les deux appels pour garantir
    // des id distincts, sans dépendre du timing réel de la machine.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    saveGeneration({ brief: 'Génération à garder', stories: 's', storiesCount: 1 });
    vi.setSystemTime(new Date('2026-06-15T12:00:00.001Z'));
    saveGeneration({ brief: 'Génération à supprimer', stories: 's', storiesCount: 1 });
    vi.useRealTimers();

    const { onNavigate } = renderDashboard();

    // .closest('div') depuis le titre remonte à .info (son parent direct),
    // pas à GenerationCard qui contient aussi le bouton supprimer — un
    // niveau plus haut.
    const cardToDelete = within(getRecentSection()).getByText('Génération à supprimer').closest('div').parentElement;
    fireEvent.click(within(cardToDelete).getByTitle('Supprimer cette génération'));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.queryByText('Génération à supprimer')).not.toBeInTheDocument();
    // "Génération à garder" est désormais la seule entrée : elle apparaît à
    // la fois dans la liste et comme sub de "Dernière génération" (doublon
    // légitime, même motif que getRecentSection ailleurs dans ce fichier).
    expect(within(getRecentSection()).getByText('Génération à garder')).toBeInTheDocument();
    expect(within(getStatCard('Générations totales')).getByText('1')).toBeInTheDocument();
  });
});

describe('Dashboard — accessibilité du bouton supprimer (Générations récentes)', () => {
  it('le bouton est caché au premier rendu et une règle :focus-visible le révèle au clavier', () => {
    saveGeneration({ brief: 'Génération avec bouton supprimer', stories: 's', storiesCount: 1 });
    renderDashboard();

    const btn = within(getRecentSection()).getByTitle('Supprimer cette génération');

    // Caché au premier rendu, sans aucune interaction (règle de base opacity:0,
    // que jsdom applique bien au style calculé).
    expect(getComputedStyle(btn).opacity).toBe('0');

    // jsdom n'applique pas les pseudo-classes (:hover/:focus-visible) dans
    // getComputedStyle — on vérifie donc la feuille styled-components elle-même :
    // le bouton doit être révélé au focus clavier (:focus-visible, pas :focus,
    // pour ne pas se déclencher sur un clic souris), au même titre qu'au survol.
    const hash = [...btn.classList].find((c) => !c.startsWith('sc-'));
    const css = Array.from(document.querySelectorAll('style'), (s) => s.textContent).join('');
    expect(css).toMatch(new RegExp(`\\.${hash}\\{[^}]*opacity:0`));
    expect(css).toMatch(new RegExp(`\\.${hash}:focus-visible\\{[^}]*opacity:1`));

    // Et le bouton est bien dans l'ordre de tabulation (élément <button>).
    btn.focus();
    expect(btn).toHaveFocus();
  });
});

describe('Dashboard — CTA "Nouvelle génération"', () => {
  it('appelle onNavigate("forge") une seule fois au clic sur la carte (hors du bouton Générer)', () => {
    const { onNavigate } = renderDashboard();

    fireEvent.click(screen.getByText('Nouvelle génération'));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('forge');
  });

  it('appelle onNavigate("forge") une seule fois au clic sur le bouton "Générer" (stopPropagation empêche le bubbling vers CTACard)', () => {
    // GenerateBtn a son propre onClick ET est imbriqué dans CTACard qui a
    // aussi un onClick sur "forge". stopPropagation() dans le handler du
    // bouton empêche l'événement de remonter jusqu'à CTACard, donc un seul
    // appel à onNavigate("forge") pour un clic sur le bouton.
    const { onNavigate } = renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: /Générer/i }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('forge');
  });
});

describe('Dashboard — noms accessibles des icônes', () => {
  it('le bouton bascule de thème a un nom accessible explicite (pas "light_mode"/"dark_mode")', () => {
    const onThemeChange = vi.fn();
    render(<Dashboard onNavigate={vi.fn()} themeMode="light" onThemeChange={onThemeChange} />);

    // name EXACT : échoue si l'icône "dark_mode" fuit dans le nom accessible.
    const toggle = screen.getByRole('button', { name: 'Passer en thème sombre' });
    fireEvent.click(toggle);
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('le bouton "Générer" du CTA a pour nom accessible "Générer", pas "bolt Générer"', () => {
    render(<Dashboard onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Générer' })).toBeInTheDocument();
  });

  it('le bouton de suppression d\'une génération récente expose "Supprimer cette génération" (pas "delete")', () => {
    saveGeneration({ brief: 'Génération récente', stories: 's', storiesCount: 1 });
    renderDashboard();

    expect(
      within(getRecentSection()).getByRole('button', { name: 'Supprimer cette génération' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'delete' })).not.toBeInTheDocument();
  });
});
