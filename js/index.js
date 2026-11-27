const inputImages = document.getElementById("images");
const apercu = document.getElementById("apercuImages");
const formulaireRecherche = document.getElementById("rechercheArtisans");
const listeArtisans = document.getElementById("listeArtisans");
const formulaireDemande = document.getElementById("formulaireArtisan");
const messageDemande = document.getElementById("messageDemande");
const boutonLocalisation = document.getElementById("boutonLocalisation");
const messageLocalisation = document.getElementById("messageLocalisation");
const lienCarteLocalisation = document.getElementById("lienCarteLocalisation");
const champVille = document.getElementById("ville");
const champQuartier = document.getElementById("quartier");
let positionClient = null;

const motsClesSpecialites = {
    plomberie: ["plomberie", "plombier", "fuite d'eau", "robinet", "canalisation", "tuyau", "wc", "toilette"],
    electricite: ["electricite", "electricien", "prise", "panne electrique", "disjoncteur", "cable"],
    climatisation: ["climatisation", "climatiseur", "clim"],
    maconnerie: ["maconnerie", "macon", "mur", "carrelage", "dalle", "construction"],
    menuiserie: ["menuiserie", "menuisier", "porte", "meuble", "bois"],
    peinture: ["peinture", "peintre", "peindre"],
    serrurerie: ["serrurerie", "serrurier", "serrure", "cle", "cadenas"],
    mecanique: ["mecanique", "mecanicien", "voiture", "automobile", "garage", "moto"],
    jardinage: ["jardinage", "jardinier", "jardin", "paysagiste"],
    couture: ["couture", "couturier", "couturiere", "retouche", "vetement"],
    nettoyage: ["nettoyage", "nettoyeur", "menage", "nettoyer"]
};

function determinerSpecialite(probleme, choix) {
    if (choix !== "automatique") {
        return choix;
    }

    const description = window.annuaireArtisans.normaliser(probleme);
    return Object.keys(motsClesSpecialites).find(function (specialite) {
        return motsClesSpecialites[specialite].some(function (motCle) {
            return description.includes(motCle);
        });
    }) || "tous";
}

function positionEstEnCoteDIvoire(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    return Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && latitude >= 4.1
        && latitude <= 10.8
        && longitude >= -8.7
        && longitude <= -2.4;
}

async function remplirVilleEtQuartier(position) {
    const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
    url.searchParams.set("latitude", position.latitude);
    url.searchParams.set("longitude", position.longitude);
    url.searchParams.set("localityLanguage", "fr");

    const reponse = await fetch(url.href);
    if (!reponse.ok) {
        throw new Error("Le service de géocodage a répondu avec le statut " + reponse.status + ".");
    }

    const adresse = await reponse.json();
    if (!adresse || adresse.countryCode !== "CI") {
        throw new Error("Le service n'a pas confirmé une adresse en Côte d’Ivoire.");
    }

    const ville = typeof adresse.city === "string" && adresse.city.trim()
        ? adresse.city.trim()
        : (typeof adresse.locality === "string" ? adresse.locality.trim() : "");
    const quartier = typeof adresse.locality === "string"
        && adresse.locality.trim()
        && window.annuaireArtisans.normaliser(adresse.locality) !== window.annuaireArtisans.normaliser(ville)
        ? adresse.locality.trim()
        : "";

    if (!ville) {
        throw new Error("Aucune ville n'a été trouvée pour cette position.");
    }

    champVille.value = ville;
    champQuartier.value = quartier;
    return { ville: ville, quartier: quartier };
}

function rechercherPosition(positionPrecisionElevee) {
    navigator.geolocation.getCurrentPosition(
        async function (position) {
            if (!positionEstEnCoteDIvoire(position)) {
                positionClient = null;
                messageLocalisation.textContent = "Position hors Côte d’Ivoire. Vérifiez le GPS ou saisissez votre adresse.";
                boutonLocalisation.disabled = false;
                return;
            }

            positionClient = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                precision: position.coords.accuracy || null
            };
            lienCarteLocalisation.href = "https://www.google.com/maps?q="
                + positionClient.latitude + "," + positionClient.longitude;
            lienCarteLocalisation.hidden = false;

            const precision = position.coords.accuracy
                ? " (±" + Math.round(position.coords.accuracy) + " m)"
                : "";
            messageLocalisation.textContent = "Position détectée. Recherche de la ville et du quartier…";
            try {
                const adresse = await remplirVilleEtQuartier(positionClient);
                messageLocalisation.textContent = "Adresse : " + adresse.ville
                    + (adresse.quartier ? " — " + adresse.quartier : " (quartier non disponible)")
                    + precision + ".";
            } catch (erreur) {
                messageLocalisation.textContent = "Adresse introuvable. Saisissez la ville et le quartier.";
                console.error("Échec de la recherche d'adresse à partir de la position.", erreur);
            } finally {
                boutonLocalisation.disabled = false;
            }
        },
        function (erreur) {
            if (positionPrecisionElevee
                && (erreur.code === erreur.TIMEOUT || erreur.code === erreur.POSITION_UNAVAILABLE)) {
                messageLocalisation.textContent =
                    "Recherche haute précision en cours… essai avec une localisation plus large.";
                rechercherPosition(false);
                return;
            }

            positionClient = null;
            if (erreur.code === erreur.PERMISSION_DENIED) {
                messageLocalisation.textContent = "Accès GPS refusé. Autorisez la localisation dans le navigateur."
                    + (window.location.protocol === "file:"
                        ? " Pour un fichier local, utilisez HTTPS ou localhost."
                        : "");
            } else if (erreur.code === erreur.TIMEOUT) {
                messageLocalisation.textContent = "Recherche trop longue. Réessayez à l’extérieur.";
            } else {
                messageLocalisation.textContent = "Position indisponible. Vérifiez le GPS et réessayez.";
            }
            boutonLocalisation.disabled = false;
        },
        {
            enableHighAccuracy: positionPrecisionElevee,
            timeout: positionPrecisionElevee ? 15000 : 20000,
            maximumAge: 60000
        }
    );
}

boutonLocalisation.addEventListener("click", function () {
    if (!navigator.geolocation) {
        messageLocalisation.textContent = "GPS indisponible sur cet appareil.";
        return;
    }

    if (window.isSecureContext === false) {
        messageLocalisation.textContent = "La localisation nécessite HTTPS ou localhost.";
        return;
    }

    boutonLocalisation.disabled = true;
    messageLocalisation.textContent = "Recherche de votre position…";
    lienCarteLocalisation.hidden = true;
    rechercherPosition(true);
});

formulaireDemande.addEventListener("submit", function (event) {
    event.preventDefault();

    const probleme = formulaireDemande.elements.probleme.value.trim();
    const ville = formulaireDemande.elements.ville.value.trim();
    const quartier = formulaireDemande.elements.quartier.value.trim();
    const specialite = determinerSpecialite(
        probleme,
        formulaireDemande.elements.specialite.value
    );
    const demande = {
        id: "demande-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        probleme: probleme,
        specialite: specialite,
        ville: ville,
        quartier: quartier,
        position: positionClient,
        date: new Date().toISOString(),
        statut: "en cours"
    };

    try {
        const demandes = JSON.parse(localStorage.getItem("sosArtisanDemandes") || "[]");
        if (!Array.isArray(demandes)) {
            throw new Error("L'historique local des demandes a un format invalide.");
        }

        demandes.unshift(demande);
        localStorage.setItem("sosArtisanDemandes", JSON.stringify(demandes));

        const destination = new URL("specialite.html", window.location.href);
        destination.searchParams.set("metier", specialite);
        destination.searchParams.set("ville", ville);
        destination.searchParams.set("quartier", quartier);
        window.location.href = destination.href;
    } catch (erreur) {
        messageDemande.textContent = "Impossible d'enregistrer cette demande dans l'historique local.";
        console.error("Échec de l'enregistrement de la demande.", erreur);
    }
});

formulaireRecherche.addEventListener("submit", async function (event) {
    event.preventDefault();

    try {
        window.annuaireArtisans.afficher(
            await window.annuaireArtisans.lire(),
            document.getElementById("termeRecherche").value,
            listeArtisans
        );
    } catch (erreur) {
        listeArtisans.textContent = "Impossible de lire les profils d'artisans enregistrés dans ce navigateur.";
        console.error("Échec de la lecture du répertoire des artisans.", erreur);
    }
});

if (inputImages && apercu) {
    inputImages.addEventListener("change", function () {

        apercu.innerHTML = "";

        const fichiers = inputImages.files;

        for (let i = 0; i < fichiers.length; i++) {

            const fichier = fichiers[i];

            if (fichier.type.startsWith("image/")) {

                const image = document.createElement("img");

                image.src = URL.createObjectURL(fichier);
                image.alt = "Image du problème à réparer";

                apercu.appendChild(image);
            }
        }
    });
}
