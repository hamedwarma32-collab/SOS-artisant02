(async function () {
const historiqueDemandes = document.getElementById("historiqueDemandes");

try {
    const demandes = JSON.parse(localStorage.getItem("sosArtisanDemandes") || "[]");
    if (!Array.isArray(demandes)) {
        throw new Error("L'historique local des demandes a un format invalide.");
    }
    let artisans = [];
    if (demandes.some(function (demande) { return demande && demande.statut === "terminee"; })) {
        const resultatArtisans = await window.sosApi.request("/api/artisans");
        artisans = resultatArtisans.artisans;
    }

    let historiqueModifie = false;
    demandes.forEach(function (demande) {
        if (!demande.id) {
            demande.id = "demande-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
            historiqueModifie = true;
        }
        if (!demande.statut) {
            demande.statut = "en cours";
            historiqueModifie = true;
        }
    });
    if (historiqueModifie) {
        localStorage.setItem("sosArtisanDemandes", JSON.stringify(demandes));
    }

    if (demandes.length === 0) {
        historiqueDemandes.textContent = "Aucune demande enregistrée pour le moment.";
    } else {
        demandes.forEach(function (demande) {
            const carte = document.createElement("article");
            carte.className = "demande-historique";

            const probleme = document.createElement("h2");
            probleme.textContent = demande.probleme || "Demande sans description";

            const localisation = document.createElement("p");
            localisation.textContent = "Lieu : " + (demande.quartier || "Quartier non indiqué")
                + ", " + (demande.ville || "Ville non indiquée");

            const date = document.createElement("p");
            const dateDemande = new Date(demande.date);
            date.textContent = Number.isNaN(dateDemande.getTime())
                ? "Date non disponible"
                : "Date : " + dateDemande.toLocaleString("fr-FR");

            const statut = document.createElement("p");
            statut.className = "statut-demande";
            statut.textContent = demande.statut === "terminee"
                ? "Travail terminé"
                : "Travail en cours";

            carte.append(probleme, localisation, date, statut);

            if (demande.statut !== "terminee") {
                const boutonTerminer = document.createElement("button");
                boutonTerminer.type = "button";
                boutonTerminer.textContent = "Marquer le travail comme terminé";
                boutonTerminer.addEventListener("click", function () {
                    const demandesActuelles = JSON.parse(
                        localStorage.getItem("sosArtisanDemandes") || "[]"
                    );
                    if (!Array.isArray(demandesActuelles)) return;

                    const index = demandesActuelles.findIndex(function (element) {
                        return element.id === demande.id;
                    });
                    if (index !== -1) {
                        demandesActuelles[index].statut = "terminee";
                        demandesActuelles[index].dateFin = new Date().toISOString();
                        localStorage.setItem(
                            "sosArtisanDemandes",
                            JSON.stringify(demandesActuelles)
                        );
                        window.location.reload();
                    }
                });
                carte.appendChild(boutonTerminer);
            } else {
                const formulaire = document.createElement("form");
                formulaire.className = "formulaire-note";

                const titre = document.createElement("h3");
                titre.textContent = "Noter l'artisan";

                const libelleArtisan = document.createElement("label");
                libelleArtisan.textContent = "Artisan";
                const selectArtisan = document.createElement("select");
                selectArtisan.required = true;

                const choixVide = document.createElement("option");
                choixVide.value = "";
                choixVide.textContent = "Choisissez l'artisan";
                selectArtisan.appendChild(choixVide);

                artisans.forEach(function (artisan) {
                    if (!artisan || !artisan.telephone) return;
                    const option = document.createElement("option");
                    option.value = artisan.telephone;
                    option.textContent = [artisan.prenom, artisan.nom, artisan.specialite]
                        .filter(Boolean).join(" - ");
                    selectArtisan.appendChild(option);
                });
                libelleArtisan.appendChild(selectArtisan);

                const libelleNote = document.createElement("label");
                libelleNote.textContent = "Note sur 5";
                const selectNote = document.createElement("select");
                selectNote.required = true;
                for (let valeur = 1; valeur <= 5; valeur += 1) {
                    const option = document.createElement("option");
                    option.value = String(valeur);
                    option.textContent = valeur + "/5";
                    selectNote.appendChild(option);
                }
                libelleNote.appendChild(selectNote);

                const libelleCommentaire = document.createElement("label");
                libelleCommentaire.textContent = "Commentaire (facultatif)";
                const commentaire = document.createElement("textarea");
                commentaire.maxLength = 300;
                libelleCommentaire.appendChild(commentaire);

                const messageNote = document.createElement("p");
                messageNote.setAttribute("role", "status");

                const boutonNoter = document.createElement("button");
                boutonNoter.type = "submit";
                boutonNoter.textContent = "Publier ma note";

                formulaire.addEventListener("submit", function (event) {
                    event.preventDefault();

                    const artisanSelectionne = artisans.find(function (artisan) {
                        return artisan
                            && String(artisan.telephone).replace(/[^\d+]/g, "")
                            === selectArtisan.value.replace(/[^\d+]/g, "");
                    });
                    if (!artisanSelectionne) {
                        messageNote.textContent = "Veuillez choisir un artisan.";
                        return;
                    }

                    let notes = JSON.parse(localStorage.getItem("sosArtisanNotes") || "[]");
                    if (!Array.isArray(notes)) notes = [];

                    const indexNote = notes.findIndex(function (note) {
                        return note && note.demandeId === demande.id;
                    });
                    const nouvelleNote = {
                        demandeId: demande.id,
                        artisanTelephone: artisanSelectionne.telephone,
                        note: Number(selectNote.value),
                        commentaire: commentaire.value.trim(),
                        date: new Date().toISOString()
                    };

                    if (indexNote === -1) {
                        notes.push(nouvelleNote);
                    } else {
                        notes[indexNote] = nouvelleNote;
                    }

                    localStorage.setItem("sosArtisanNotes", JSON.stringify(notes));
                    messageNote.textContent = "Votre note a été enregistrée.";
                    boutonNoter.textContent = "Mettre à jour ma note";
                });

                formulaire.append(
                    titre,
                    libelleArtisan,
                    libelleNote,
                    libelleCommentaire,
                    boutonNoter,
                    messageNote
                );
                carte.appendChild(formulaire);
            }

            if (demande.position
                && Number.isFinite(demande.position.latitude)
                && demande.position.latitude >= -90
                && demande.position.latitude <= 90
                && Number.isFinite(demande.position.longitude)
                && demande.position.longitude >= -180
                && demande.position.longitude <= 180) {
                const lienPosition = document.createElement("a");
                lienPosition.href = "https://www.google.com/maps?q="
                    + demande.position.latitude + "," + demande.position.longitude;
                lienPosition.target = "_blank";
                lienPosition.rel = "noopener noreferrer";
                lienPosition.textContent = "Voir la position sur la carte";
                carte.appendChild(lienPosition);
            }

            historiqueDemandes.appendChild(carte);
        });
    }
} catch (erreur) {
    historiqueDemandes.textContent = "Impossible de lire l'historique dans ce navigateur.";
    console.error("Échec de la lecture de l'historique des demandes.", erreur);
}
})();
