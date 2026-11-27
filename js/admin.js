(function () {
  const connexion = document.getElementById("adminConnexion");
  const formulaire = document.getElementById("formulaireAdminConnexion");
  const panneau = document.getElementById("tableauAdmin");
  const message = document.getElementById("messageAdmin");
  const erreur = document.getElementById("erreurAdmin");
  const liste = document.getElementById("listeUtilisateursAdmin");
  const recherche = document.getElementById("rechercheAdmin");

  function afficherErreur(texte) {
    erreur.textContent = texte || "";
  }

  function creerElement(tag, texte, classe) {
    const element = document.createElement(tag);
    element.textContent = texte;
    if (classe) element.className = classe;
    return element;
  }

  function carteUtilisateur(utilisateur) {
    const carte = document.createElement("article");
    carte.className = "utilisateur-admin";
    const entete = document.createElement("div");
    entete.className = "utilisateur-admin-identite";
    entete.append(
      creerElement("h3", [utilisateur.prenom, utilisateur.nom].filter(Boolean).join(" ") || "Sans nom"),
      creerElement("p", utilisateur.telephone + (utilisateur.email ? " · " + utilisateur.email : ""))
    );

    const meta = document.createElement("p");
    meta.textContent = (utilisateur.typeCompte === "admin" ? "Administrateur" : utilisateur.typeCompte === "artisan" ? "Artisan" : "Client")
      + (utilisateur.specialite ? " · " + utilisateur.specialite : "")
      + (utilisateur.ville ? " · " + utilisateur.ville : "");

    const controles = document.createElement("div");
    controles.className = "actions-utilisateur-admin";
    const role = document.createElement("select");
    role.setAttribute("aria-label", "Rôle de " + utilisateur.telephone);
    [["client", "Client"], ["artisan", "Artisan"], ["admin", "Administrateur"]].forEach(function (optionData) {
      const option = document.createElement("option");
      option.value = optionData[0];
      option.textContent = optionData[1];
      option.selected = utilisateur.typeCompte === option.value;
      role.appendChild(option);
    });

    const statut = document.createElement("button");
    statut.type = "button";
    statut.textContent = utilisateur.actif ? "Désactiver" : "Réactiver";
    statut.className = utilisateur.actif ? "bouton-admin-secondaire" : "bouton-admin-activer";
    statut.addEventListener("click", async function () {
      try {
        await window.sosApi.request("/api/admin/users/" + utilisateur.id, {
          method: "PATCH",
          body: { role: role.value, actif: !utilisateur.actif }
        });
        await chargerAdmin();
      } catch (e) {
        afficherErreur(e.message);
      }
    });

    const enregistrer = document.createElement("button");
    enregistrer.type = "button";
    enregistrer.textContent = "Enregistrer le rôle";
    enregistrer.addEventListener("click", async function () {
      try {
        await window.sosApi.request("/api/admin/users/" + utilisateur.id, {
          method: "PATCH",
          body: { role: role.value, actif: utilisateur.actif }
        });
        await chargerAdmin();
      } catch (e) {
        afficherErreur(e.message);
      }
    });

    const supprimer = document.createElement("button");
    supprimer.type = "button";
    supprimer.textContent = "Supprimer";
    supprimer.className = "bouton-admin-danger";
    supprimer.addEventListener("click", async function () {
      if (!window.confirm("Supprimer définitivement le compte " + utilisateur.telephone + " ?")) return;
      try {
        await window.sosApi.request("/api/admin/users/" + utilisateur.id, { method: "DELETE" });
        await chargerAdmin();
      } catch (e) {
        afficherErreur(e.message);
      }
    });

    controles.append(role, enregistrer, statut, supprimer);
    carte.append(entete, meta, controles);
    return carte;
  }

  async function chargerAdmin() {
    afficherErreur("");
    try {
      const me = await window.sosApi.request("/api/me");
      if (me.user.typeCompte !== "admin") {
        throw new Error("Ce compte n'a pas les droits administrateur.");
      }
      connexion.hidden = true;
      panneau.hidden = false;
      const query = recherche.value.trim();
      const resultat = await Promise.all([
        window.sosApi.request("/api/admin/overview"),
        window.sosApi.request("/api/admin/users?q=" + encodeURIComponent(query))
      ]);
      document.getElementById("totalComptes").textContent = resultat[0].comptes;
      document.getElementById("totalArtisans").textContent = resultat[0].artisans;
      document.getElementById("totalActifs").textContent = resultat[0].comptesActifs;
      liste.replaceChildren();
      if (resultat[1].users.length === 0) {
        liste.appendChild(creerElement("p", "Aucun compte correspondant."));
      } else {
        resultat[1].users.forEach(function (user) {
          liste.appendChild(carteUtilisateur(user));
        });
      }
    } catch (e) {
      if (e.status === 401) {
        panneau.hidden = true;
        connexion.hidden = false;
      }
      afficherErreur(e.message);
    }
  }

  formulaire.addEventListener("submit", async function (event) {
    event.preventDefault();
    message.textContent = "";
    try {
      await window.sosApi.request("/api/login", {
        method: "POST",
        body: {
          telephone: document.getElementById("telephoneAdmin").value,
          motDePasse: document.getElementById("motDePasseAdmin").value
        }
      });
      document.getElementById("motDePasseAdmin").value = "";
      await chargerAdmin();
    } catch (e) {
      message.textContent = e.message;
    }
  });

  document.getElementById("boutonDeconnexionAdmin").addEventListener("click", async function () {
    try {
      await window.sosApi.request("/api/logout", { method: "POST" });
      panneau.hidden = true;
      connexion.hidden = false;
      message.textContent = "Vous êtes déconnecté.";
    } catch (e) {
      afficherErreur(e.message);
    }
  });
  recherche.addEventListener("input", function () {
    window.clearTimeout(recherche._timer);
    recherche._timer = window.setTimeout(chargerAdmin, 250);
  });

  chargerAdmin();
})();
