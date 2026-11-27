(async function () {
    const cleMessages = "sosArtisanConversations";
    const connexionMessagerie = document.getElementById("connexionMessagerie");
    const espaceMessagerie = document.getElementById("espaceMessagerie");
    const listeConversations = document.getElementById("listeConversations");
    const discussionActive = document.getElementById("discussionActive");
    const formulaireMessage = document.getElementById("formulaireMessage");
    const texteMessage = document.getElementById("texteMessage");
    const erreurMessagerie = document.getElementById("erreurMessagerie");
    let compteActif;
    let conversations;
    let conversationSelectionnee = null;

    function normaliserTelephone(telephone) {
        return String(telephone || "").replace(/[^\d+]/g, "");
    }

    function nomCompte(compte) {
        return [compte.prenom, compte.nom].filter(Boolean).join(" ") || "Utilisateur";
    }

    function lireConversations() {
        const resultat = JSON.parse(localStorage.getItem(cleMessages) || "[]");
        if (!Array.isArray(resultat)) {
            throw new Error("La liste des conversations a un format invalide.");
        }
        const formatValide = resultat.every(function (conversation) {
            return conversation
                && typeof conversation.id === "string"
                && typeof conversation.clientTelephone === "string"
                && typeof conversation.artisanTelephone === "string"
                && Array.isArray(conversation.messages)
                && conversation.messages.every(function (message) {
                    return message
                        && typeof message.expediteurTelephone === "string"
                        && typeof message.contenu === "string";
                });
        });
        if (!formatValide) {
            throw new Error("Une conversation enregistrée a un format invalide.");
        }
        return resultat;
    }

    function estParticipant(conversation) {
        const telephoneActif = normaliserTelephone(compteActif.telephone);
        return telephoneActif
            && (telephoneActif === normaliserTelephone(conversation.clientTelephone)
                || telephoneActif === normaliserTelephone(conversation.artisanTelephone));
    }

    function nomInterlocuteur(conversation) {
        return normaliserTelephone(compteActif.telephone)
            === normaliserTelephone(conversation.clientTelephone)
            ? conversation.artisanNom
            : conversation.clientNom;
    }

    function derniereActivite(conversation) {
        const dernierMessage = conversation.messages[conversation.messages.length - 1];
        return dernierMessage && dernierMessage.date
            ? dernierMessage.date
            : conversation.dateCreation;
    }

    function afficherListeConversations() {
        listeConversations.replaceChildren();
        const conversationsUtilisateur = conversations
            .filter(estParticipant)
            .sort(function (premiere, seconde) {
                return new Date(derniereActivite(seconde)).getTime()
                    - new Date(derniereActivite(premiere)).getTime();
            });

        if (conversationsUtilisateur.length === 0) {
            const vide = document.createElement("p");
            vide.className = "liste-conversations-vide";
            vide.textContent = "Aucune conversation pour le moment. Écrivez à un artisan depuis sa fiche.";
            listeConversations.appendChild(vide);
            return;
        }

        conversationsUtilisateur.forEach(function (conversation) {
            const bouton = document.createElement("button");
            bouton.type = "button";
            bouton.className = "conversation-liste-item";
            if (conversation.id === conversationSelectionnee) {
                bouton.classList.add("selectionnee");
            }

            const nom = document.createElement("strong");
            nom.textContent = nomInterlocuteur(conversation) || "Conversation";
            const dernierMessage = conversation.messages[conversation.messages.length - 1];
            const extrait = document.createElement("span");
            extrait.textContent = dernierMessage
                ? (dernierMessage.contenu || "")
                : "Démarrer la conversation";
            bouton.append(nom, extrait);
            bouton.addEventListener("click", function () {
                conversationSelectionnee = conversation.id;
                erreurMessagerie.textContent = "";
                afficherMessagerie();
            });
            listeConversations.appendChild(bouton);
        });
    }

    function afficherDiscussion() {
        discussionActive.replaceChildren();
        const conversation = conversations.find(function (element) {
            return element.id === conversationSelectionnee && estParticipant(element);
        });

        if (!conversation) {
            formulaireMessage.hidden = true;
            const invitation = document.createElement("p");
            invitation.className = "discussion-vide";
            invitation.textContent = "Sélectionnez une conversation pour lire et envoyer des messages.";
            discussionActive.appendChild(invitation);
            return;
        }

        const titre = document.createElement("h2");
        titre.textContent = nomInterlocuteur(conversation) || "Conversation";
        const metier = document.createElement("p");
        metier.className = "interlocuteur-metier";
        metier.textContent = normaliserTelephone(compteActif.telephone)
            === normaliserTelephone(conversation.clientTelephone)
            ? "Artisan" + (conversation.artisanSpecialite ? " — " + conversation.artisanSpecialite : "")
            : "Client";
        const fil = document.createElement("div");
        fil.className = "fil-messages";

        if (conversation.messages.length === 0) {
            const vide = document.createElement("p");
            vide.className = "discussion-vide";
            vide.textContent = "Envoyez le premier message pour démarrer la conversation.";
            fil.appendChild(vide);
        } else {
            conversation.messages.forEach(function (message) {
                const estMonMessage = normaliserTelephone(message.expediteurTelephone)
                    === normaliserTelephone(compteActif.telephone);
                const bulle = document.createElement("article");
                bulle.className = estMonMessage ? "bulle-message mon-message" : "bulle-message";
                const auteur = document.createElement("strong");
                auteur.textContent = estMonMessage ? "Vous" : (nomInterlocuteur(conversation) || "Interlocuteur");
                const contenu = document.createElement("p");
                contenu.textContent = message.contenu;
                const date = document.createElement("time");
                const dateMessage = new Date(message.date);
                date.textContent = Number.isNaN(dateMessage.getTime())
                    ? ""
                    : dateMessage.toLocaleString("fr-FR");
                bulle.append(auteur, contenu, date);
                fil.appendChild(bulle);
            });
        }

        discussionActive.append(titre, metier, fil);
        formulaireMessage.hidden = false;
    }

    function afficherMessagerie() {
        afficherListeConversations();
        afficherDiscussion();
    }

    async function ouvrirConversationAvecArtisan(telephoneArtisan) {
        if (!telephoneArtisan) return;
        if (compteActif.typeCompte !== "client") {
            erreurMessagerie.textContent = "Seuls les comptes clients peuvent démarrer une conversation depuis l'annuaire.";
            return;
        }

        const resultat = await window.sosApi.request("/api/artisans");
        const artisans = resultat.artisans;
        const artisan = artisans.find(function (profil) {
            return profil
                && normaliserTelephone(profil.telephone) === normaliserTelephone(telephoneArtisan);
        });

        if (!artisan) {
            erreurMessagerie.textContent = "Cet artisan n'est plus disponible dans l'annuaire.";
            return;
        }
        if (normaliserTelephone(artisan.telephone) === normaliserTelephone(compteActif.telephone)) {
            erreurMessagerie.textContent = "Vous ne pouvez pas démarrer une conversation avec votre propre profil.";
            return;
        }

        let conversation = conversations.find(function (element) {
            return normaliserTelephone(element.clientTelephone)
                    === normaliserTelephone(compteActif.telephone)
                && normaliserTelephone(element.artisanTelephone)
                    === normaliserTelephone(artisan.telephone);
        });

        if (!conversation) {
            conversation = {
                id: "conversation-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
                clientTelephone: compteActif.telephone,
                clientNom: nomCompte(compteActif),
                artisanTelephone: artisan.telephone,
                artisanNom: [artisan.prenom, artisan.nom].filter(Boolean).join(" ") || "Artisan",
                artisanSpecialite: artisan.specialite || "",
                dateCreation: new Date().toISOString(),
                messages: []
            };
            conversations.unshift(conversation);
            localStorage.setItem(cleMessages, JSON.stringify(conversations));
        }

        conversationSelectionnee = conversation.id;
    }

    function afficherConnexion() {
        connexionMessagerie.hidden = false;
        const retour = "messages.html" + window.location.search;
        const urlConnexion = new URL("connexion.html", window.location.href);
        urlConnexion.searchParams.set("retour", retour);
        const urlInscription = new URL("inscription.html", window.location.href);
        urlInscription.searchParams.set("retour", retour);
        document.getElementById("lienConnexionMessagerie").href = urlConnexion.href;
        document.getElementById("lienInscriptionMessagerie").href = urlInscription.href;
    }

    try {
        const resultatCompte = await window.sosApi.request("/api/me");
        compteActif = resultatCompte.user;
        if (!compteActif || !compteActif.telephone) {
            afficherConnexion();
            return;
        }

        espaceMessagerie.hidden = false;
        conversations = lireConversations();
        const parametres = new URLSearchParams(window.location.search);
        const artisanTelephone = parametres.get("artisan");
        const conversationDemandee = parametres.get("conversation");

        if (artisanTelephone) {
            await ouvrirConversationAvecArtisan(artisanTelephone);
        } else if (conversationDemandee) {
            const conversation = conversations.find(function (element) {
                return element.id === conversationDemandee && estParticipant(element);
            });
            if (conversation) conversationSelectionnee = conversation.id;
        }

        if (!conversationSelectionnee) {
            const premiereConversation = conversations
                .filter(estParticipant)
                .sort(function (premiere, seconde) {
                    return new Date(derniereActivite(seconde)).getTime()
                        - new Date(derniereActivite(premiere)).getTime();
                })[0];
            if (premiereConversation) conversationSelectionnee = premiereConversation.id;
        }

        afficherMessagerie();
    } catch (erreur) {
        erreurMessagerie.textContent = "Impossible de charger la messagerie dans ce navigateur.";
        espaceMessagerie.hidden = false;
        console.error("Échec du chargement des conversations.", erreur);
    }

    formulaireMessage.addEventListener("submit", function (event) {
        event.preventDefault();
        const contenu = texteMessage.value.trim();
        if (!contenu || !conversationSelectionnee) return;

        try {
            const conversationsActuelles = lireConversations();
            const conversation = conversationsActuelles.find(function (element) {
                return element.id === conversationSelectionnee && estParticipant(element);
            });
            if (!conversation) {
                throw new Error("La conversation sélectionnée est introuvable.");
            }

            conversation.messages.push({
                expediteurTelephone: compteActif.telephone,
                contenu: contenu,
                date: new Date().toISOString()
            });
            localStorage.setItem(cleMessages, JSON.stringify(conversationsActuelles));
            conversations = conversationsActuelles;
            texteMessage.value = "";
            erreurMessagerie.textContent = "";
            afficherMessagerie();
            texteMessage.focus();
        } catch (erreur) {
            erreurMessagerie.textContent = "Impossible d'enregistrer ce message dans ce navigateur.";
            console.error("Échec de l'enregistrement du message.", erreur);
        }
    });

    window.addEventListener("storage", function (event) {
        if (event.key === cleMessages) window.location.reload();
    });
})();
