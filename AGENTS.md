# Instructions du dépôt

## Architecture

- Application locale sans Supabase ni base distante.
- Utiliser uniquement Codex CLI authentifié via ChatGPT pour l’exécution agentique.
- Ne jamais ajouter de fallback automatique vers une API payante.
- Les skills originaux sont lus depuis le commit défini dans `config/skills-lock.json`; ne pas les réécrire ni les simplifier dans ce dépôt.
- Les états d’exécution et artefacts restent sous `runs/` et ne sont pas versionnés.

## Vérification

```bash
npm run sync:skills
npm run doctor
npm test
npm start
```

Toute étape doit produire un artefact non vide et attendre une validation humaine avant de déverrouiller la suivante. Une étape terminée n’est pas nécessairement réussie.
