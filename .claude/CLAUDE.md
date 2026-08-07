# Règles absolues — Projet Argos

## Ne jamais coder sans permission explicite

Avant de toucher au moindre fichier, obtenir un accord clair du user.
Répondre en texte (analyse, proposition, options) et attendre un "oui", "vas-y", ou équivalent.

**Pourquoi :** le user a répété plusieurs fois cette règle — c'est une contrainte non négociable.

**Comment appliquer :** dès qu'une demande implique une modification de code, décrire ce qui serait fait et attendre validation. Même pour un fix d'une ligne.

## TDD — Règle pour tout nouveau code

Pour chaque nouvelle fonctionnalité ou modification non triviale :
1. Écrire le test en premier (dans `tests/`) — il doit échouer.
2. Écrire le code minimal pour le faire passer.
3. Refactorer si nécessaire.

Les tests existants doivent passer avant tout commit sur `main`.
Ne jamais écrire de test avec `print()` à la place d'`assert`. Un test sans `assert` n'est pas un test.
