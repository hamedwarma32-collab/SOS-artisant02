# Déployer SOS Artisan sur un VPS Linux

## Pré-requis

- Ubuntu 22.04 ou plus récent, Python 3.11+, un nom de domaine et HTTPS.
- Un proxy HTTPS (par exemple Nginx) devant Gunicorn.
- Un volume persistant pour `instance/sos-artisan.sqlite3` et les sauvegardes.

Les comptes et profils artisans sont désormais stockés dans SQLite sur le serveur. Les anciens comptes enregistrés uniquement dans le navigateur ne sont pas importés : leurs utilisateurs devront créer un nouveau compte.

## Installer l'application

Depuis le dossier du projet, dans un environnement virtuel :

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export DATABASE_PATH=/var/lib/sos-artisan/sos-artisan.sqlite3
export COOKIE_SECURE=true
python server.py init-db
```

Le compte administrateur se crée interactivement. Le mot de passe n'est ni affiché ni enregistré en clair :

```sh
python server.py create-admin
```

Saisis ton numéro de téléphone et choisis un mot de passe long (10 caractères minimum). Ces informations sont tes accès à `/html/admin.html`. Aucun compte root ni mot de passe par défaut n'est livré avec le code.

Lancer Gunicorn, lié uniquement à l'interface locale :

```sh
gunicorn --workers 2 --bind 127.0.0.1:8000 server:app
```

Le processus doit pouvoir écrire dans le dossier contenant la base SQLite. Configure-le comme service `systemd` et conserve ce dossier sur un disque persistant.

## Proxy HTTPS

Configure Nginx pour rediriger le trafic HTTPS du domaine vers `http://127.0.0.1:8000`, en transmettant au minimum :

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Ajoute aussi `client_max_body_size 7m;` dans le bloc `server` afin de permettre l'envoi des photos de profil.

Active un certificat TLS (par exemple Let's Encrypt) et redirige HTTP vers HTTPS. Le serveur fait confiance à exactement un proxy inverse ; ne rends pas directement le port Gunicorn accessible depuis Internet.

## Première connexion

Ouvre `https://ton-domaine/html/admin.html`, puis connecte-toi avec le téléphone et le mot de passe fournis lors de `create-admin`. Le panneau permet de rechercher des comptes, changer leur rôle, les désactiver/réactiver et supprimer des comptes. Un administrateur ne peut pas se désactiver lui-même ni supprimer le dernier administrateur actif.

La messagerie, l'historique des demandes et les évaluations de la version existante utilisent encore le stockage local du navigateur ; ils ne sont pas visibles dans ce panneau ni synchronisés entre appareils. Les mots de passe et les profils de compte, eux, sont gérés par le serveur.

## Sauvegarde

Sauvegarde régulièrement le fichier SQLite et garde les sauvegardes hors du répertoire servi par l'application. Limite l'accès SSH au VPS et applique les mises à jour de sécurité du système et des dépendances Python.
