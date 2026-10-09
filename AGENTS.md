# Instructions du dépôt

## Architecture

- Application locale sans Supabase ni base distante.
- Utiliser uniquement Codex CLI authentifié via ChatGPT pour l’exécution agentique.
- Ne jamais ajouter de fallback automatique vers une API payante.
- Les skills originaux sont lus depuis le commit défini dans `config/skills-lock.json`; ne pas les réécrire ni les simplifier dans ce dépôt.
- Les états d’exécution et artefacts restent sous `runs/` et ne sont pas versionnés.
- Les profils ajoutés par onboarding restent dans `.editorial-data/`.
- Router les contenus selon `config/workflows.json`; ne jamais remplacer un workflow spécialisé par le pipeline Guide.
- Toute action Git exige une validation éditoriale finale puis une confirmation Git distincte. `PUSH_MAIN` est obligatoire pour un push direct sur main.

## Vérification

```bash
npm run sync:skills
npm run doctor
npm test
npm start
```

Toute étape doit produire un artefact non vide et attendre une validation humaine avant de déverrouiller la suivante. Une étape terminée n’est pas nécessairement réussie.
