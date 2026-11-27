import argparse
import getpass
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import hashlib
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash


ROOT = Path(__file__).resolve().parent
database_path_config = Path(os.environ.get("DATABASE_PATH", "instance/sos-artisan.sqlite3"))
DATABASE_PATH = database_path_config if database_path_config.is_absolute() else ROOT / database_path_config
SESSION_COOKIE = "sos_artisan_session"
SESSION_DURATION = 12 * 60 * 60
MAX_PHOTO_LENGTH = 4_200_000
PHONE_PATTERN = re.compile(r"^\+?[0-9]{8,15}$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__, static_folder=None)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024


def connect_database():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(DATABASE_PATH, timeout=10)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA busy_timeout = 10000")
    database.execute("PRAGMA foreign_keys = ON")
    return database


def initialize_database():
    with connect_database() as database:
        database.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                telephone TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('client', 'artisan', 'admin')),
                ville TEXT NOT NULL DEFAULT '',
                quartier TEXT NOT NULL DEFAULT '',
                adresse TEXT NOT NULL DEFAULT '',
                specialite TEXT NOT NULL DEFAULT '',
                photo TEXT NOT NULL DEFAULT '',
                publication_annuaire INTEGER NOT NULL DEFAULT 0,
                mot_de_passe TEXT NOT NULL,
                actif INTEGER NOT NULL DEFAULT 1,
                date_inscription TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                csrf_token TEXT NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_expiration ON sessions(expires_at);
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telephone TEXT NOT NULL,
                adresse_ip TEXT NOT NULL,
                date_tentative INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_login_attempts_date ON login_attempts(date_tentative);
            """
        )


def json_error(message, status):
    return jsonify({"error": message}), status


def normaliser_telephone(value):
    return re.sub(r"[^\d+]", "", str(value or ""))


def user_json(user):
    return {
        "id": user["id"],
        "nom": user["nom"],
        "prenom": user["prenom"],
        "telephone": user["telephone"],
        "email": user["email"],
        "typeCompte": user["role"],
        "ville": user["ville"],
        "quartier": user["quartier"],
        "adresse": user["adresse"],
        "specialite": user["specialite"],
        "photo": user["photo"],
        "publicationAnnuaire": bool(user["publication_annuaire"]),
        "actif": bool(user["actif"]),
        "dateInscription": user["date_inscription"],
    }


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_cookie_options():
    secure = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
    return {
        "httponly": True,
        "secure": secure,
        "samesite": "Lax",
        "path": "/",
        "max_age": SESSION_DURATION,
    }


def create_session(user_id=None):
    if g.session is not None:
        g.database.execute(
            "DELETE FROM sessions WHERE token_hash = ?",
            (g.session["token_hash"],),
        )
    raw_token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + SESSION_DURATION
    g.database.execute(
        "INSERT INTO sessions (token_hash, csrf_token, user_id, expires_at) VALUES (?, ?, ?, ?)",
        (token_hash(raw_token), csrf_token, user_id, expires_at),
    )
    response = jsonify({"csrfToken": csrf_token})
    response.set_cookie(SESSION_COOKIE, raw_token, **session_cookie_options())
    return response


initialize_database()


@app.before_request
def load_request_session():
    g.database = connect_database()
    g.session = None
    g.user = None
    raw_token = request.cookies.get(SESSION_COOKIE)
    if not raw_token:
        return

    session = g.database.execute(
        "SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?",
        (token_hash(raw_token), int(time.time())),
    ).fetchone()
    if session is None:
        return

    g.session = session
    if session["user_id"] is not None:
        g.user = g.database.execute(
            "SELECT * FROM users WHERE id = ? AND actif = 1",
            (session["user_id"],),
        ).fetchone()
        if g.user is None:
            g.database.execute(
                "DELETE FROM sessions WHERE token_hash = ?",
                (session["token_hash"],),
            )
            g.session = None


@app.teardown_request
def close_database(_error):
    database = getattr(g, "database", None)
    if database is not None:
        if _error is None:
            database.commit()
        else:
            database.rollback()
        database.close()


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self)"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; "
        "style-src 'self' https://cdnjs.cloudflare.com; "
        "img-src 'self' data: blob:; font-src 'self' https://cdnjs.cloudflare.com; "
        "connect-src 'self' https://api.bigdatacloud.net; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    if request.is_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    response.headers["Cache-Control"] = "no-store" if request.path.startswith("/api/") else "no-cache"
    return response


def require_csrf(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        if g.session is None:
            return json_error("Session de sécurité expirée. Rechargez la page.", 403)
        csrf = request.headers.get("X-CSRF-Token", "")
        if not hmac.compare_digest(csrf, g.session["csrf_token"]):
            return json_error("Jeton de sécurité invalide. Rechargez la page.", 403)
        return function(*args, **kwargs)
    return wrapped


def require_user(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return json_error("Connectez-vous pour continuer.", 401)
        return function(*args, **kwargs)
    return wrapped


def require_admin(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return json_error("Connectez-vous avec un compte administrateur.", 401)
        if g.user["role"] != "admin":
            return json_error("Accès réservé à l'administration.", 403)
        return function(*args, **kwargs)
    return wrapped


@app.get("/")
def home():
    return send_from_directory(str(ROOT / "html"), "index.html")


@app.get("/<path:filename>")
def static_files(filename):
    allowed_root_files = {"style.css", "manifest.json", "sw.js"}
    if filename in allowed_root_files:
        return send_from_directory(str(ROOT), filename)
    if filename.startswith(("html/", "js/", "images/")):
        return send_from_directory(str(ROOT), filename)
    return json_error("Fichier introuvable.", 404)


@app.errorhandler(413)
def request_too_large(_error):
    if request.path.startswith("/api/"):
        return json_error("La requête est trop volumineuse.", 413)
    return "Requête trop volumineuse.", 413


@app.get("/api/csrf")
def csrf_token():
    if g.session is not None:
        return jsonify({"csrfToken": g.session["csrf_token"]})
    return create_session()


@app.post("/api/register")
@require_csrf
def register():
    data = request.get_json(silent=True) or {}
    role = data.get("typeCompte")
    telephone = normaliser_telephone(data.get("telephone"))
    mot_de_passe = data.get("motDePasse", "")
    email = str(data.get("email", "")).strip()
    photo = data.get("photo", "")

    if role not in ("client", "artisan"):
        return json_error("Type de compte invalide.", 400)
    if not PHONE_PATTERN.fullmatch(telephone):
        return json_error("Le numéro de téléphone est invalide.", 400)
    if not isinstance(mot_de_passe, str) or len(mot_de_passe) < 10:
        return json_error("Le mot de passe doit contenir au moins 10 caractères.", 400)
    if len(mot_de_passe) > 256:
        return json_error("Le mot de passe est trop long.", 400)
    nom = str(data.get("nom", "")).strip()
    prenom = str(data.get("prenom", "")).strip()
    ville = str(data.get("ville", "")).strip()
    if not nom or not prenom or not ville:
        return json_error("Le nom, le prénom et la ville sont obligatoires.", 400)
    if not EMAIL_PATTERN.fullmatch(email):
        return json_error("L'adresse e-mail est invalide.", 400)
    if not isinstance(photo, str) or len(photo) > MAX_PHOTO_LENGTH:
        return json_error("La photo est trop volumineuse.", 400)
    if photo and not re.fullmatch(r"data:image/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*", photo):
        return json_error("Le format de la photo n'est pas accepté.", 400)
    if role == "artisan" and (not data.get("specialite") or not data.get("publicationAnnuaire")):
        return json_error("Un artisan doit choisir un métier et accepter la publication de son profil.", 400)

    try:
        cursor = g.database.execute(
            """
            INSERT INTO users
                (nom, prenom, telephone, email, role, ville, quartier, adresse,
                 specialite, photo, publication_annuaire, mot_de_passe)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                nom[:100],
                prenom[:100],
                telephone,
                email[:254],
                role,
                ville[:120],
                str(data.get("quartier", "")).strip()[:120],
                str(data.get("adresse", "")).strip()[:250],
                str(data.get("specialite", "")).strip()[:100] if role == "artisan" else "",
                photo if role == "artisan" else "",
                int(role == "artisan" and bool(data.get("publicationAnnuaire"))),
                generate_password_hash(mot_de_passe, method="scrypt"),
            ),
        )
    except sqlite3.IntegrityError:
        return json_error("Un compte utilise déjà ce numéro de téléphone.", 409)

    g.database.commit()
    user = g.database.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    response = create_session(user["id"])
    response.set_data(jsonify({"user": user_json(user), "csrfToken": json.loads(response.get_data())["csrfToken"]}).get_data())
    return response, 201


@app.post("/api/login")
@require_csrf
def login():
    data = request.get_json(silent=True) or {}
    telephone = normaliser_telephone(data.get("telephone"))
    mot_de_passe = data.get("motDePasse", "")
    maintenant = int(time.time())
    adresse_ip = request.remote_addr or "unknown"
    tentatives = g.database.execute(
        """
        SELECT COUNT(*) AS n FROM login_attempts
        WHERE telephone = ? AND adresse_ip = ? AND date_tentative > ?
        """,
        (telephone, adresse_ip, maintenant - 900),
    ).fetchone()["n"]
    if tentatives >= 8:
        return json_error("Trop de tentatives. Réessayez dans 15 minutes.", 429)

    user = g.database.execute(
        "SELECT * FROM users WHERE telephone = ? AND actif = 1",
        (telephone,),
    ).fetchone()
    if user is None or not check_password_hash(user["mot_de_passe"], str(mot_de_passe)):
        g.database.execute(
            "INSERT INTO login_attempts (telephone, adresse_ip, date_tentative) VALUES (?, ?, ?)",
            (telephone, adresse_ip, maintenant),
        )
        g.database.execute("DELETE FROM login_attempts WHERE date_tentative <= ?", (maintenant - 86400,))
        return json_error("Téléphone ou mot de passe incorrect.", 401)

    g.database.execute(
        "DELETE FROM login_attempts WHERE telephone = ? AND adresse_ip = ?",
        (telephone, adresse_ip),
    )
    if g.session is not None:
        g.database.execute("DELETE FROM sessions WHERE token_hash = ?", (g.session["token_hash"],))
    response = create_session(user["id"])
    response.set_data(jsonify({"user": user_json(user), "csrfToken": json.loads(response.get_data())["csrfToken"]}).get_data())
    return response


@app.get("/api/me")
@require_user
def current_user():
    return jsonify({"user": user_json(g.user)})


@app.post("/api/logout")
@require_csrf
def logout():
    if g.session is not None:
        g.database.execute("DELETE FROM sessions WHERE token_hash = ?", (g.session["token_hash"],))
    response = jsonify({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=session_cookie_options()["secure"], samesite="Lax")
    return response


@app.get("/api/artisans")
def artisans():
    rows = g.database.execute(
        """
        SELECT * FROM users
        WHERE role = 'artisan' AND actif = 1 AND publication_annuaire = 1
        ORDER BY date_inscription DESC
        """
    ).fetchall()
    return jsonify({"artisans": [user_json(row) for row in rows]})


@app.get("/api/admin/overview")
@require_admin
def admin_overview():
    total = g.database.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
    artisans = g.database.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'artisan'").fetchone()["n"]
    actifs = g.database.execute("SELECT COUNT(*) AS n FROM users WHERE actif = 1").fetchone()["n"]
    return jsonify({"comptes": total, "artisans": artisans, "comptesActifs": actifs})


@app.get("/api/admin/users")
@require_admin
def admin_users():
    query = str(request.args.get("q", "")).strip()[:120]
    search = "%" + query + "%"
    rows = g.database.execute(
        """
        SELECT * FROM users
        WHERE nom LIKE ? OR prenom LIKE ? OR telephone LIKE ? OR email LIKE ?
        ORDER BY date_inscription DESC
        """,
        (search, search, search, search),
    ).fetchall()
    return jsonify({"users": [user_json(row) for row in rows]})


@app.patch("/api/admin/users/<int:user_id>")
@require_csrf
@require_admin
def admin_update_user(user_id):
    data = request.get_json(silent=True) or {}
    target = g.database.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if target is None:
        return json_error("Compte introuvable.", 404)

    role = data.get("role", target["role"])
    actif = data.get("actif", bool(target["actif"]))
    if role not in ("client", "artisan", "admin") or not isinstance(actif, bool):
        return json_error("Rôle ou statut invalide.", 400)
    if target["id"] == g.user["id"] and (role != "admin" or not actif):
        return json_error("Vous ne pouvez pas désactiver ou rétrograder votre propre compte.", 400)
    if target["role"] == "admin" and (role != "admin" or not actif):
        admins = g.database.execute(
            "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND actif = 1"
        ).fetchone()["n"]
        if admins <= 1:
            return json_error("Impossible de désactiver le dernier administrateur actif.", 400)

    g.database.execute(
        "UPDATE users SET role = ?, actif = ? WHERE id = ?",
        (role, int(actif), user_id),
    )
    if not actif or role != "admin":
        g.database.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    updated = g.database.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return jsonify({"user": user_json(updated)})


@app.delete("/api/admin/users/<int:user_id>")
@require_csrf
@require_admin
def admin_delete_user(user_id):
    target = g.database.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if target is None:
        return json_error("Compte introuvable.", 404)
    if target["id"] == g.user["id"]:
        return json_error("Vous ne pouvez pas supprimer votre propre compte.", 400)
    if target["role"] == "admin" and target["actif"]:
        admins = g.database.execute(
            "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND actif = 1"
        ).fetchone()["n"]
        if admins <= 1:
            return json_error("Impossible de supprimer le dernier administrateur actif.", 400)
    g.database.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return jsonify({"ok": True})


def create_admin():
    initialize_database()
    username = input("Téléphone administrateur : ").strip()
    telephone = normaliser_telephone(username)
    if not PHONE_PATTERN.fullmatch(telephone):
        raise SystemExit("Numéro de téléphone invalide.")
    password = getpass.getpass("Mot de passe administrateur (10 caractères minimum) : ")
    confirmation = getpass.getpass("Confirmer le mot de passe : ")
    if len(password) < 10 or password != confirmation:
        raise SystemExit("Mot de passe trop court ou confirmation incorrecte.")

    try:
        with connect_database() as database:
            database.execute(
                """
                INSERT INTO users (nom, prenom, telephone, email, role, mot_de_passe)
                VALUES (?, ?, ?, ?, 'admin', ?)
                """,
                ("Administrateur", "Root", telephone, "", generate_password_hash(password, method="scrypt")),
            )
    except sqlite3.IntegrityError:
        raise SystemExit("Un compte existe déjà pour ce numéro.")
    print("Compte administrateur créé. Le mot de passe n'est pas enregistré en clair.")


def run():
    parser = argparse.ArgumentParser(description="Serveur SOS Artisan")
    parser.add_argument("command", nargs="?", choices=("create-admin", "init-db"))
    arguments = parser.parse_args()
    if arguments.command == "create-admin":
        create_admin()
        return
    if arguments.command == "init-db":
        initialize_database()
        print("Base de données initialisée.")
        return
    initialize_database()
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))


if __name__ == "__main__":
    run()
