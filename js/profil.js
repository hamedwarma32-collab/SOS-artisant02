(async function () {
    const etatProfil = document.getElementById("etatProfil");
    const detailsProfil = document.getElementById("detailsProfil");
    const boutonDeconnexion = document.getElementById("boutonDeconnexion");
    const lienAdministration = document.getElementById("lienAdministration");

    try {
        const resultat = await window.sosApi.request("/api/me");
        const compte = resultat.user;
        etatProfil.textContent = resultat.local
            ? "Votre compte est enregistré localement dans ce navigateur."
            : "Votre compte est enregistré sur le serveur.";
        detailsProfil.hidden = false;
        boutonDeconnexion.hidden = false;
        if (compte.typeCompte === "admin") lienAdministration.hidden = false;

        const titre = document.createElement("h2");
        titre.textContent = [compte.prenom, compte.nom].filter(Boolean).join(" ");
        const typeCompte = document.createElement("p");
        typeCompte.textContent = "Type de compte : "
            + (compte.typeCompte === "artisan" ? "Artisan" : compte.typeCompte === "admin" ? "Administrateur" : "Client");
        const telephone = document.createElement("p");
        telephone.textContent = "Téléphone : " + compte.telephone;
        const email = document.createElement("p");
        email.textContent = "Adresse e-mail : " + (compte.email || "Non indiquée");
        const localisation = document.createElement("p");
        localisation.textContent = "Ville : " + (compte.ville || "Non indiquée")
            + " — Quartier : " + (compte.quartier || "Non indiqué");
        detailsProfil.append(titre, typeCompte, telephone, email, localisation);

        if (compte.typeCompte === "artisan") {
            const metier = document.createElement("p");
            metier.textContent = "Métier : " + (compte.specialite || "Non indiqué");
            detailsProfil.appendChild(metier);
            if (compte.photo) {
                const photo = document.createElement("img");
                photo.className = "photo-artisan";
                photo.src = compte.photo;
                photo.alt = "Photo de " + [compte.prenom, compte.nom].filter(Boolean).join(" ");
                detailsProfil.appendChild(photo);
            }
        }
    } catch (erreur) {
        etatProfil.textContent = erreur.status === 401
            ? "Vous n'êtes pas connecté. Connectez-vous pour afficher votre profil."
            : erreur.message || "Impossible de charger votre profil.";
    }

    boutonDeconnexion.addEventListener("click", async function () {
        try {
            await window.sosApi.request("/api/logout", { method: "POST" });
            window.location.reload();
        } catch (erreur) {
            etatProfil.textContent = erreur.message || "Impossible de fermer la session.";
        }
    });
})();
