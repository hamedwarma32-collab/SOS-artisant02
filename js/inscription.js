const formulaireInscription = document.getElementById("formulaireInscription");
const typeCompte = formulaireInscription.elements.typeCompte;
const champSpecialite = document.getElementById("champSpecialite");
const specialite = formulaireInscription.elements.specialite;
const autorisationAnnuaire = document.getElementById("autorisationAnnuaire");
const publicationAnnuaire = formulaireInscription.elements.publicationAnnuaire;
const champPhoto = document.getElementById("champPhoto");
const photoArtisan = document.getElementById("photoArtisan");
const apercuPhoto = document.getElementById("apercuPhotoArtisan");
const message = document.getElementById("messageInscription");

function actualiserChampsArtisan() {
    const estArtisan = typeCompte.value === "artisan";
    champSpecialite.hidden = !estArtisan;
    champPhoto.hidden = !estArtisan;
    specialite.required = estArtisan;
    photoArtisan.required = estArtisan;
    autorisationAnnuaire.hidden = !estArtisan;
    publicationAnnuaire.required = estArtisan;
}

typeCompte.addEventListener("change", actualiserChampsArtisan);
actualiserChampsArtisan();

photoArtisan.addEventListener("change", function () {
    const fichier = photoArtisan.files[0];
    if (!fichier) {
        apercuPhoto.hidden = true;
        apercuPhoto.removeAttribute("src");
        return;
    }

    if (fichier.size > 3 * 1024 * 1024) {
        apercuPhoto.hidden = true;
        photoArtisan.value = "";
        photoArtisan.setCustomValidity("La photo ne doit pas dépasser 3 Mo.");
        photoArtisan.reportValidity();
        return;
    }

    photoArtisan.setCustomValidity("");
    apercuPhoto.src = URL.createObjectURL(fichier);
    apercuPhoto.hidden = false;
});

photoArtisan.addEventListener("input", function () {
    photoArtisan.setCustomValidity("");
});

function lirePhoto(fichier) {
    return new Promise(function (resolve, reject) {
        if (!fichier) {
            resolve("");
            return;
        }

        const lecteur = new FileReader();
        lecteur.onload = function () {
            resolve(String(lecteur.result || ""));
        };
        lecteur.onerror = function () {
            reject(new Error("Impossible de lire la photo."));
        };
        lecteur.readAsDataURL(fichier);
    });
}

formulaireInscription.addEventListener("submit", async function (event) {
    event.preventDefault();

    const motDePasse = formulaireInscription.elements.motDePasse.value;
    const confirmationMotDePasse = formulaireInscription.elements.confirmationMotDePasse.value;
    message.textContent = "";

    if (motDePasse !== confirmationMotDePasse) {
        formulaireInscription.elements.confirmationMotDePasse.setCustomValidity("Les mots de passe ne correspondent pas.");
        formulaireInscription.elements.confirmationMotDePasse.reportValidity();
        return;
    }

    formulaireInscription.elements.confirmationMotDePasse.setCustomValidity("");

    const estArtisan = typeCompte.value === "artisan";
    try {
        const photo = estArtisan
            ? await lirePhoto(photoArtisan.files[0])
            : "";
        await window.sosApi.request("/api/register", {
            method: "POST",
            body: {
                nom: formulaireInscription.elements.nom.value.trim(),
                prenom: formulaireInscription.elements.prenom.value.trim(),
                telephone: formulaireInscription.elements.telephone.value.trim(),
                email: formulaireInscription.elements.email.value.trim(),
                typeCompte: typeCompte.value,
                ville: formulaireInscription.elements.ville.value.trim(),
                quartier: formulaireInscription.elements.quartier.value.trim(),
                adresse: formulaireInscription.elements.adresse.value.trim(),
                specialite: estArtisan ? specialite.value.trim() : "",
                photo: photo,
                publicationAnnuaire: estArtisan ? publicationAnnuaire.checked : false,
                motDePasse: motDePasse
            }
        });
        message.textContent = "Compte créé. Redirection vers votre profil…";
        window.setTimeout(function () { window.location.href = "profil.html"; }, 500);
    } catch (erreur) {
        message.textContent = erreur.message || "Impossible d'enregistrer le compte sur le serveur.";
        console.error("Échec de l'enregistrement du compte.", erreur);
    }
});

formulaireInscription.elements.confirmationMotDePasse.addEventListener("input", function () {
    this.setCustomValidity("");
});
