window.annuaireArtisans = {
    cleStockage: "sosArtisanArtisans",

    normaliser: function (texte) {
        return String(texte || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("fr")
            .trim();
    },

    lire: async function () {
        const resultat = await window.sosApi.request("/api/artisans");
        if (!Array.isArray(resultat.artisans)) {
            throw new Error("Le répertoire des artisans a un format invalide.");
        }
        return resultat.artisans;
    },

    lireNotes: function () {
        const notes = JSON.parse(localStorage.getItem("sosArtisanNotes") || "[]");
        return Array.isArray(notes) ? notes : [];
    },

    normaliserTelephone: function (telephone) {
        return String(telephone || "").replace(/[^\d+]/g, "");
    },

    trierParProximite: function (artisans, ville, quartier) {
        const villeCible = this.normaliser(ville);
        const quartierCible = this.normaliser(quartier);
        if (!villeCible && !quartierCible) {
            return artisans;
        }

        return artisans.slice().sort(function (premier, second) {
            function score(artisan) {
                const villeArtisan = window.annuaireArtisans.normaliser(artisan.ville);
                const quartierArtisan = window.annuaireArtisans.normaliser(artisan.quartier);
                const memeVille = villeCible && villeArtisan === villeCible;
                const memeQuartier = quartierCible && quartierArtisan === quartierCible;
                return (memeVille ? 2 : 0) + (memeVille && memeQuartier ? 1 : 0);
            }

            return score(second) - score(premier);
        });
    },

    obtenirTelephoneWhatsApp: function (telephone) {
        let chiffres = String(telephone || "").replace(/\D/g, "");
        if (chiffres.indexOf("00") === 0) {
            chiffres = chiffres.slice(2);
        }
        if (chiffres.length === 10 && chiffres.charAt(0) === "0") {
            chiffres = "225" + chiffres;
        }
        return chiffres;
    },

    obtenirEvaluation: function (artisan) {
        const telephone = this.normaliserTelephone(artisan && artisan.telephone);
        const evaluations = this.lireNotes().filter(function (note) {
            return note && window.annuaireArtisans.normaliserTelephone(note.artisanTelephone) === telephone;
        });

        if (evaluations.length === 0) {
            return { moyenne: null, nombre: 0 };
        }

        const total = evaluations.reduce(function (somme, evaluation) {
            return somme + (Number(evaluation.note) || 0);
        }, 0);

        return {
            moyenne: total / evaluations.length,
            nombre: evaluations.length
        };
    },

    afficher: function (artisans, recherche, conteneur, filtreSpecialite) {
        conteneur.replaceChildren();

        const terme = this.normaliser(recherche);
        const resultats = artisans.filter(function (artisan) {
            if (!artisan || typeof artisan !== "object") {
                return false;
            }
            if (artisan.publicationAnnuaire === false) {
                return false;
            }

            const texteProfil = window.annuaireArtisans.normaliser([
                artisan.prenom,
                artisan.nom,
                artisan.specialite,
                artisan.ville,
                artisan.quartier
            ].join(" "));

            return texteProfil.includes(terme)
                && (!filtreSpecialite || filtreSpecialite(artisan));
        });

        if (resultats.length === 0) {
            const message = document.createElement("p");
            message.textContent = "Aucun artisan correspondant n'a été trouvé dans ce navigateur.";
            conteneur.appendChild(message);
            return;
        }

        resultats.forEach(function (artisan) {
            const carte = document.createElement("article");
            carte.className = "artisan-carte";

            const nom = document.createElement("h3");
            nom.textContent = [artisan.prenom, artisan.nom].filter(Boolean).join(" ");

            if (typeof artisan.photo === "string" && artisan.photo) {
                const photo = document.createElement("img");
                photo.className = "photo-artisan";
                photo.src = artisan.photo;
                photo.alt = "Photo de " + ([artisan.prenom, artisan.nom].filter(Boolean).join(" ") || "l'artisan");
                carte.appendChild(photo);
            }

            const metier = document.createElement("p");
            metier.textContent = "Métier : " + (artisan.specialite || "Non indiqué");

            const localisation = document.createElement("p");
            localisation.textContent = "Ville : " + (artisan.ville || "Non indiquée")
                + " — Quartier : " + (artisan.quartier || "Non indiqué");

            const evaluation = window.annuaireArtisans.obtenirEvaluation(artisan);
            const note = document.createElement("p");
            note.className = "moyenne-artisan";
            note.textContent = evaluation.nombre > 0
                ? "Note moyenne : " + evaluation.moyenne.toFixed(1) + "/5 (" + evaluation.nombre + " avis)"
                : "Note moyenne : pas encore noté";

            const contact = document.createElement("a");
            const telephone = typeof artisan.telephone === "string" ? artisan.telephone : "";
            contact.href = "tel:" + telephone.replace(/[^\d+]/g, "");
            contact.textContent = telephone ? "Appeler : " + telephone : "Téléphone non indiqué";

            carte.append(nom, metier, localisation, note, contact);

            const telephoneWhatsApp = window.annuaireArtisans.obtenirTelephoneWhatsApp(telephone);
            if (telephoneWhatsApp) {
                const commander = document.createElement("a");
                const nomArtisan = [artisan.prenom, artisan.nom].filter(Boolean).join(" ");
                const message = "Bonjour"
                    + (nomArtisan ? " " + nomArtisan : "")
                    + ", je souhaite commander vos services"
                    + (artisan.specialite ? " de " + artisan.specialite : "")
                    + ". Êtes-vous disponible ?";
                commander.className = "commander-artisan";
                commander.href = "https://wa.me/" + telephoneWhatsApp
                    + "?text=" + encodeURIComponent(message);
                commander.target = "_blank";
                commander.rel = "noopener noreferrer";
                commander.textContent = "Commander sur WhatsApp";
                carte.appendChild(commander);
            }

            const envoyerMessage = document.createElement("a");
            envoyerMessage.className = "envoyer-message-artisan";
            envoyerMessage.href = "messages.html?artisan=" + encodeURIComponent(telephone);
            envoyerMessage.textContent = "Écrire un message";
            carte.appendChild(envoyerMessage);

            conteneur.appendChild(carte);
        });
    }
};
