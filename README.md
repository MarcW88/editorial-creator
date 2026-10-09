# Editorial Creator

Application locale d’orchestration éditoriale. Elle exécute les skills originaux de `MarcW88/bloc-notes-numerique` avec Codex CLI, conserve les artefacts localement et bloque chaque transition jusqu’à validation humaine.

## Garanties du MVP

- aucun Supabase et aucune base distante ;
- aucun fallback vers une API payante ;
- authentification Codex via l’abonnement ChatGPT existant et modèle `gpt-6.1-sol` explicitement sélectionné ;
- profils de sites séparés des skills, avec détection des règles appartenant à un autre domaine ;
- skills chargés depuis un commit Git précis et mis en cache sans modification ;
- manifeste SHA-256 pour tous les fichiers des skills requis ;
- artefact et journal JSONL obligatoires par tentative ;
- étapes suivantes verrouillées avant approbation humaine ;
- publication, push et indexation hors du contrôle automatique des agents.

## Démarrage

```bash
npm run sync:skills
npm run doctor
npm test
npm start
```

Ouvrir ensuite `http://127.0.0.1:4310`.

Les exécutions Codex disposent par défaut de 15 minutes. La limite peut être ajustée avec `CODEX_TIMEOUT_MS`, sans désactiver le blocage en cas d’absence d’artefact.

## Fonctionnement

1. Le registre lit `config/skills-lock.json`.
2. Il récupère le commit verrouillé dans `.editorial-cache/skills/`.
3. L’orchestrateur crée un état local sous `runs/`.
4. Codex reçoit une seule étape et les chemins vers les skills complets concernés.
5. La sortie et le journal sont enregistrés sous `runs/<id>/`.
6. Une étape techniquement terminée passe à `AWAITING_APPROVAL`, jamais directement à `APPROVED`.
7. L’utilisateur approuve ou demande une correction dans l’interface.

## Mise à jour des skills

Modifier explicitement le commit dans `config/skills-lock.json`, puis exécuter `npm run sync:skills`. Une mise à jour n’est jamais appliquée automatiquement.

## Limites du MVP

Les exécutions restent locales et séquentielles. Le routeur sélectionne les workflows originaux pour `/guides/`, `/comparatifs/`, `/marques/`, `/usages/`, `/bons-plans/` et les pages de confiance.

Un nouveau dépôt peut être inspecté depuis l’interface. Son profil n’est enregistré qu’après confirmation explicite de sa langue et de sa thématique. Les profils ajoutés localement restent dans `.editorial-data/` et ne sont pas versionnés.

Après la validation humaine finale, l’application peut préparer une liste exacte de fichiers, puis créer et pousser une branche après la confirmation `PUSH_BRANCH`. Le push direct sur `main` exige la confirmation distincte `PUSH_MAIN`. GitHub CLI n’étant pas installé automatiquement, la création de pull request est fournie comme commande explicite tant que `gh` n’est pas disponible. Le retrait de `noindex` reste une instruction séparée.
