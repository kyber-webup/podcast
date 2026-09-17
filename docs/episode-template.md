---
# Modèle de fiche épisode — copie ce fichier dans src/content/episodes/
# sous le nom NNN-slug.md (ex. 005-mon-episode.md), puis remplis les champs
# ci-dessous. Voir la section « Publier un épisode » du README pour la
# procédure complète.

title: "Titre de l'épisode"

# Date de publication (AAAA-MM-JJ). Sert à trier la liste et à calculer le
# badge « Nouveau ».
date: 2026-01-01

# Durée du MP3, relevée dans le logiciel de montage. Formats acceptés :
# nombre de secondes, "mm:ss" ou "hh:mm:ss" (ex. 1245, "20:45" ou "1:02:03").
# Si cette valeur ne correspond pas à la vraie durée du fichier, le lecteur
# se corrige tout seul une fois le fichier chargé — pas besoin d'être exact
# à la seconde près.
duration: "20:00"

# Nom du fichier MP3 tel que déposé dans le bucket R2 "podcast-audio".
# Doit être en minuscules, sans espace ni accent (lettres, chiffres, tirets
# uniquement), et se terminer par .mp3. Exemple : "005-mon-episode.mp3".
file: "NNN-slug.mp3"

# Optionnel : résumé affiché sous le titre dans la liste des épisodes.
description: ""

# Optionnel : noms des animateurs de l'épisode.
hosts: []

# Optionnel : chapitres de l'épisode, dans l'ordre chronologique. Supprime
# ce bloc entier (de "chapters:" à la fin) si l'épisode n'a pas de chapitre.
# Règles : le premier chapitre doit commencer à 0, les heures de début
# doivent être strictement croissantes, et rester avant la fin de l'épisode.
# `npm run build` refusera la fiche avec un message clair si ce n'est pas
# le cas.
# chapters:
#   - { start: "00:00", title: "Introduction" }
#   - { start: "05:30", title: "Deuxième sujet" }
---

Notes d'épisode, liens utiles, etc. — ce texte libre n'apparaît pas encore
sur le site (réservé à une future transcription), mais peut servir d'aide-
mémoire.
