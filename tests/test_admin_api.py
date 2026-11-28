import os
import tempfile
import unittest
from pathlib import Path

temporary_directory = tempfile.TemporaryDirectory()
os.environ["DATABASE_PATH"] = str(Path(temporary_directory.name) / "test.sqlite3")
os.environ["COOKIE_SECURE"] = "false"

import server
from werkzeug.security import generate_password_hash


class AdminApiTests(unittest.TestCase):
    def setUp(self):
        server.DATABASE_PATH = Path(temporary_directory.name) / (self.id().split(".")[-1] + ".sqlite3")
        if server.DATABASE_PATH.exists():
            server.DATABASE_PATH.unlink()
        server.initialize_database()
        server.app.config.update(TESTING=True)
        self.client = server.app.test_client()
        csrf = self.client.get("/api/csrf").get_json()
        self.csrf = csrf["csrfToken"]

    def csrf_headers(self):
        return {"X-CSRF-Token": self.csrf}

    def test_public_registration_cannot_create_an_admin(self):
        response = self.client.post(
            "/api/register",
            json={"typeCompte": "admin"},
            headers=self.csrf_headers(),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/admin/users").status_code, 401)

    def test_server_files_are_not_publicly_served(self):
        self.assertEqual(self.client.get("/server.py").status_code, 404)
        admin_page = self.client.get("/html/admin.html")
        self.assertEqual(admin_page.status_code, 200)
        admin_page.close()

    def test_home_redirects_to_the_html_entrypoint(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/html/index.html")
        index_page = self.client.get(response.headers["Location"])
        self.assertEqual(index_page.status_code, 200)
        index_page.close()

    def test_admin_can_manage_users_and_cannot_disable_self(self):
        with server.connect_database() as database:
            database.execute(
                """
                INSERT INTO users (nom, prenom, telephone, email, role, mot_de_passe)
                VALUES (?, ?, ?, ?, 'admin', ?)
                """,
                ("Admin", "Root", "+2250700000001", "admin@example.ci",
                 generate_password_hash("test-password-long", method="scrypt")),
            )
            database.execute(
                """
                INSERT INTO users (nom, prenom, telephone, email, role, mot_de_passe)
                VALUES (?, ?, ?, ?, 'client', ?)
                """,
                ("Client", "Test", "+2250700000002", "client@example.ci",
                 generate_password_hash("test-password-long", method="scrypt")),
            )

        login = self.client.post(
            "/api/login",
            json={"telephone": "+2250700000001", "motDePasse": "test-password-long"},
            headers=self.csrf_headers(),
        )
        self.assertEqual(login.status_code, 200)
        self.csrf = login.get_json()["csrfToken"]
        users = self.client.get("/api/admin/users")
        self.assertEqual(users.status_code, 200)
        client_user = next(user for user in users.get_json()["users"] if user["typeCompte"] == "client")

        disabled = self.client.patch(
            "/api/admin/users/" + str(client_user["id"]),
            json={"role": "client", "actif": False},
            headers=self.csrf_headers(),
        )
        self.assertEqual(disabled.status_code, 200)
        self_disable = self.client.patch(
            "/api/admin/users/" + str(next(
                user["id"] for user in users.get_json()["users"]
                if user["typeCompte"] == "admin"
            )),
            json={"role": "admin", "actif": False},
            headers=self.csrf_headers(),
        )
        self.assertEqual(self_disable.status_code, 400)


if __name__ == "__main__":
    unittest.main()
