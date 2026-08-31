---
name: open-pr
description: Amène le travail terminé jusqu'à la Pull Request, sans merger. Passe un verrou de qualité bloquant (build + tests), pousse la branche, ouvre la PR vers main, et s'arrête là. Ne merge jamais. Utiliser quand l'utilisateur dit "ouvre la PR", "open pr", "envoie en review", "c'est fini, on pousse", "Ouvre PR", "PR", ou son raccourci personnel "p".
---

## Entrée

- La **branche courante**, considérée comme terminée par l'utilisateur : travail commité, pas encore poussé.

## Sortie

- L'**URL de la PR** ouverte vers `main`.

Le skill s'arrête là. Il ne merge pas — le merge sur `main` reste une décision explicite de l'utilisateur, prise séparément, pour cette PR précise.

---

## Étapes

1. **Vérifier le point de départ.** `git status` et branche courante. S'il reste des changements non commités, le signaler et demander — ne pas commiter à la place de l'utilisateur.
2. **Passer le verrou.** `npm run build` (build Vite, ce projet est en JavaScript pur, pas de typecheck TypeScript), puis `npm run test:run` (Vitest, tests colocalisés dans `src/test/`).
3. **Pousser.** `git push -u origin <branche>`.
4. **Ouvrir la PR.** `gh pr create --base main --head <branche>`, titre clair et corps dérivé des commits de la branche. Afficher l'URL.

## Règles

- **Le verrou est bloquant.** Au premier rouge : on s'arrête, on montre la sortie réelle de la commande, et **rien n'est poussé**. Ne jamais contourner un test qui échoue ni le désactiver pour pouvoir pousser.
- **Le verrou = build + tests unitaires, rien d'autre.** Ce repo n'a pas de lint (le script `npm run lint` et son `eslint.config.js` orphelins — jamais installés, jamais fonctionnels — ont été retirés dans `fix/hardening-lot2`). Réintroduire un lint = une PR dédiée qui ajoute les dépendances au `package-lock.json` proprement ; ce n'est pas une hypothèse à faire ici.
- **⛔ Ne jamais merger.** Ouvrir la PR ne vaut pas autorisation de merger, même si la CI (`claude-pr-review.yml`) approuve automatiquement et que l'auto-merge est activé sur le repo.
- **Ne jamais ouvrir de PR sans invocation explicite de ce skill.** L'utilisateur donne le feu vert en déclenchant le skill (raccourci "p", "Ouvre PR" ou phrase équivalente, cf. description) — c'est cette invocation elle-même qui vaut autorisation, jamais une initiative prise seule en cours de session.
- **Un seul repo à la fois** : celui de la branche courante. Attention à ne pas confondre deux noms qui coexistent légitimement : `storyforge-ai` est le nom du dossier local (jamais renommé), `StoryPilot-ai` est le nom du repo sur GitHub et du produit (renommé, voir `context.md`). Ne pas pousser ni ouvrir de PR pour un autre repo.
- **Rapporter l'état réel.** Si une étape échoue (push refusé, `gh` non authentifié, build cassé), le dire franchement avec l'erreur — ne pas prétendre que c'est fait.
