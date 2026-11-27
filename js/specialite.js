const categoriesArtisans = {
    plomberie: {
        titre: "Artisans en plomberie",
        description: "Trouvez un plombier inscrit près de chez vous.",
        motsCles: ["plombier", "plomberie", "sanitaire"]
    },
    electricite: {
        titre: "Artisans en électricité",
        description: "Trouvez un électricien inscrit près de chez vous.",
        motsCles: ["electricien", "electricite", "electrique"]
    },
    climatisation: {
        titre: "Artisans en climatisation",
        description: "Trouvez un spécialiste de la climatisation près de chez vous.",
        motsCles: ["climatisation", "climatiseur", "clim"]
    },
    maconnerie: {
        titre: "Artisans maçons",
        description: "Trouvez un maçon pour vos travaux de construction ou de rénovation.",
        motsCles: ["macon", "maconnerie"]
    },
    menuiserie: {
        titre: "Artisans menuisiers",
        description: "Trouvez un menuisier pour vos travaux sur bois et vos aménagements.",
        motsCles: ["menuisier", "menuiserie"]
    },
    peinture: {
        titre: "Artisans peintres",
        description: "Trouvez un peintre pour vos travaux de peinture.",
        motsCles: ["peintre", "peinture"]
    },
    serrurerie: {
        titre: "Artisans serruriers",
        description: "Trouvez un serrurier pour vos serrures et vos dépannages.",
        motsCles: ["serrurier", "serrurerie", "serrure"]
    },
    mecanique: {
        titre: "Mécaniciens automobiles",
        description: "Trouvez un mécanicien pour l'entretien ou la réparation de votre véhicule.",
        motsCles: ["mecanicien", "mecanique", "automobile", "garage"]
    },
    jardinage: {
        titre: "Jardiniers et paysagistes",
        description: "Trouvez un professionnel pour l'entretien de votre jardin.",
        motsCles: ["jardinier", "jardinage", "paysagiste"]
    },
    couture: {
        titre: "Couturiers et couturières",
        description: "Trouvez un professionnel de la couture et des retouches.",
        motsCles: ["couturier", "couturiere", "couture", "tailleur"]
    },
    nettoyage: {
        titre: "Professionnels du nettoyage",
        description: "Trouvez un professionnel pour le nettoyage et l'entretien.",
        motsCles: ["nettoyage", "nettoyeur", "menage"]
    },
    tous: {
        titre: "Tous les artisans",
        description: "Consultez tous les artisans inscrits dans ce navigateur.",
        motsCles: []
    }
};

const parametresSpecialite = new URLSearchParams(window.location.search);
const nomCategorie = parametresSpecialite.get("metier");
const categorieArtisan = categoriesArtisans[nomCategorie] || categoriesArtisans.tous;
const villeRecherchee = parametresSpecialite.get("ville") || "";
const quartierRecherche = parametresSpecialite.get("quartier") || "";
const listeSpecialite = document.getElementById("listeSpecialite");
const formulaireSpecialite = document.getElementById("rechercheSpecialite");
const champRechercheSpecialite = document.getElementById("termeSpecialite");
const proximiteSpecialite = document.getElementById("proximiteSpecialite");

document.title = categorieArtisan.titre + " | SOS Artisan";
document.getElementById("titreSpecialite").textContent = categorieArtisan.titre;
document.getElementById("descriptionSpecialite").textContent = categorieArtisan.description;
if (villeRecherchee) {
    proximiteSpecialite.textContent = "Artisans classés par proximité de "
        + (quartierRecherche ? quartierRecherche + ", " : "")
        + villeRecherchee
        + ". Les profils du même quartier et de la même ville apparaissent en premier.";
}

function artisanCorrespondALaSpecialite(artisan) {
    if (categorieArtisan.motsCles.length === 0) {
        return true;
    }

    const metier = window.annuaireArtisans.normaliser(artisan.specialite);
    return categorieArtisan.motsCles.some(function (motCle) {
        return metier.includes(window.annuaireArtisans.normaliser(motCle));
    });
}

async function afficherSpecialite() {
    try {
        const artisansProches = window.annuaireArtisans.trierParProximite(
            await window.annuaireArtisans.lire(),
            villeRecherchee,
            quartierRecherche
        );
        window.annuaireArtisans.afficher(
            artisansProches,
            champRechercheSpecialite.value,
            listeSpecialite,
            artisanCorrespondALaSpecialite
        );
    } catch (erreur) {
        listeSpecialite.textContent = "Impossible de lire les profils d'artisans enregistrés dans ce navigateur.";
        console.error("Échec de la lecture du répertoire des artisans.", erreur);
    }
}

formulaireSpecialite.addEventListener("submit", function (event) {
    event.preventDefault();
    afficherSpecialite();
});

afficherSpecialite();
