(function () {
  let csrfToken = "";
  const CLE_COMPTES_LOCAUX = "sosArtisanComptes";
  const CLE_COMPTE_LOCAL_ACTUEL = "sosArtisanCompteActuel";

  function telephoneNormalise(value) {
      return String(value || "").replace(/[^\d+]/g, "");
  }

  function lireComptesLocaux() {
      try {
          const comptes = JSON.parse(localStorage.getItem(CLE_COMPTES_LOCAUX) || "[]");
          return Array.isArray(comptes) ? comptes : [];
      } catch (_erreur) {
          return [];
      }
  }

  function enregistrerComptesLocaux(comptes) {
      localStorage.setItem(CLE_COMPTES_LOCAUX, JSON.stringify(comptes));
  }

  async function empreinteMotDePasse(motDePasse) {
      if (window.crypto && window.crypto.subtle) {
          const octets = await window.crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(String(motDePasse))
          );
          return Array.from(new Uint8Array(octets))
              .map(function (octet) { return octet.toString(16).padStart(2, "0"); })
              .join("");
      }
      let empreinte = 0;
      String(motDePasse).split("").forEach(function (caractere) {
          empreinte = ((empreinte << 5) - empreinte) + caractere.charCodeAt(0);
          empreinte |= 0;
      });
      return "fallback-" + String(empreinte >>> 0);
  }

  function comptePublic(compte) {
      const copie = Object.assign({}, compte);
      delete copie.motDePasseEmpreinte;
      copie.publicationAnnuaire = Boolean(copie.publicationAnnuaire);
      copie.actif = true;
      return copie;
  }

  async function requeteLocale(url, options) {
      const methode = String(options && options.method || "GET").toUpperCase();
      const donnees = options && options.body && typeof options.body === "object"
          ? options.body
          : {};

      if (methode === "POST" && url === "/api/register") {
          const telephone = telephoneNormalise(donnees.telephone);
          const motDePasse = String(donnees.motDePasse || "");
          if (!/^\+?[0-9]{8,15}$/.test(telephone)) {
              throw Object.assign(new Error("Le numéro de téléphone est invalide."), { status: 400 });
          }
          if (motDePasse.length < 10 || motDePasse.length > 256) {
              throw Object.assign(new Error("Le mot de passe doit contenir entre 10 et 256 caractères."), { status: 400 });
          }
          if (!["client", "artisan"].includes(donnees.typeCompte)) {
              throw Object.assign(new Error("Type de compte invalide."), { status: 400 });
          }
          if (!String(donnees.nom || "").trim() || !String(donnees.prenom || "").trim()
              || !String(donnees.ville || "").trim()) {
              throw Object.assign(new Error("Le nom, le prénom et la ville sont obligatoires."), { status: 400 });
          }
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(donnees.email || "").trim())) {
              throw Object.assign(new Error("L'adresse e-mail est invalide."), { status: 400 });
          }
          if (donnees.typeCompte === "artisan"
              && (!String(donnees.specialite || "").trim() || !donnees.publicationAnnuaire)) {
              throw Object.assign(new Error("Un artisan doit choisir un métier et accepter la publication de son profil."), { status: 400 });
          }

          const comptes = lireComptesLocaux();
          if (comptes.some(function (compte) {
              return telephoneNormalise(compte.telephone) === telephone;
          })) {
              throw Object.assign(new Error("Un compte utilise déjà ce numéro de téléphone."), { status: 409 });
          }

          const compte = {
              id: Date.now(),
              nom: String(donnees.nom || "").trim().slice(0, 100),
              prenom: String(donnees.prenom || "").trim().slice(0, 100),
              telephone: telephone,
              email: String(donnees.email || "").trim().slice(0, 254),
              typeCompte: donnees.typeCompte,
              ville: String(donnees.ville || "").trim().slice(0, 120),
              quartier: String(donnees.quartier || "").trim().slice(0, 120),
              adresse: String(donnees.adresse || "").trim().slice(0, 250),
              specialite: donnees.typeCompte === "artisan" ? String(donnees.specialite || "").trim().slice(0, 100) : "",
              photo: donnees.typeCompte === "artisan" ? String(donnees.photo || "") : "",
              publicationAnnuaire: donnees.typeCompte === "artisan" && Boolean(donnees.publicationAnnuaire),
              motDePasseEmpreinte: await empreinteMotDePasse(motDePasse)
          };
          comptes.push(compte);
          enregistrerComptesLocaux(comptes);
          localStorage.setItem(CLE_COMPTE_LOCAL_ACTUEL, JSON.stringify(comptePublic(compte)));
          return { user: comptePublic(compte), local: true };
      }

      if (methode === "POST" && url === "/api/login") {
          const telephone = telephoneNormalise(donnees.telephone);
          const empreinte = await empreinteMotDePasse(String(donnees.motDePasse || ""));
          const compte = lireComptesLocaux().find(function (element) {
              return telephoneNormalise(element.telephone) === telephone
                  && element.motDePasseEmpreinte === empreinte;
          });
          if (!compte) {
              throw Object.assign(new Error("Téléphone ou mot de passe incorrect."), { status: 401 });
          }
          localStorage.setItem(CLE_COMPTE_LOCAL_ACTUEL, JSON.stringify(comptePublic(compte)));
          return { user: comptePublic(compte), local: true };
      }

      if (methode === "GET" && url === "/api/me") {
          const compte = JSON.parse(localStorage.getItem(CLE_COMPTE_LOCAL_ACTUEL) || "null");
          if (!compte) {
              throw Object.assign(new Error("Vous n'êtes pas connecté."), { status: 401 });
          }
          return { user: compte, local: true };
      }

      if (methode === "POST" && url === "/api/logout") {
          localStorage.removeItem(CLE_COMPTE_LOCAL_ACTUEL);
          return { ok: true, local: true };
      }

      if (methode === "GET" && url === "/api/artisans") {
          const artisans = lireComptesLocaux()
              .filter(function (compte) {
                  return compte.typeCompte === "artisan" && compte.publicationAnnuaire;
              })
              .map(comptePublic);
          return { artisans: artisans, local: true };
      }

      throw Object.assign(new Error("Cette fonction nécessite l'application hébergée sur un serveur."), { status: 501 });
  }

  async function getCsrfToken() {
    if (!csrfToken) {
      const response = await fetch("/api/csrf", { credentials: "same-origin" });
      if (!response.ok) {
          throw Object.assign(
              new Error("Impossible d'initialiser la session sécurisée."),
              { status: response.status }
          );
      }
      const data = await response.json();
      csrfToken = data.csrfToken;
    }
    return csrfToken;
  }

  async function request(url, options) {
    const config = Object.assign({ credentials: "same-origin" }, options || {});
    config.headers = Object.assign({}, config.headers || {});
    try {
      if (config.method && config.method !== "GET") {
          config.headers["X-CSRF-Token"] = await getCsrfToken();
      }
      if (config.body && typeof config.body !== "string") {
          config.headers["Content-Type"] = "application/json";
          config.body = JSON.stringify(config.body);
      }
      const response = await fetch(url, config);
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
          if (window.location.protocol === "file:"
              || (response.status === 404 && typeof data.error === "undefined")) {
              return requeteLocale(url, options);
          }
          const error = new Error(data.error || "La requête a échoué.");
          error.status = response.status;
          throw error;
      }
      if (data.csrfToken) csrfToken = data.csrfToken;
      return data;
    } catch (erreur) {
      if (window.location.protocol === "file:"
          || erreur.name === "TypeError"
          || erreur.status === 404) {
          return requeteLocale(url, options);
      }
      if (erreur.status) throw erreur;
      throw erreur;
    }
  }

  window.sosApi = {
    getCsrfToken: getCsrfToken,
    request: request
  };
})();
