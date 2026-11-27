const formulaireConnexion = document.getElementById("formulaireConnexion");
const messageConnexion = document.getElementById("messageConnexion");

formulaireConnexion.addEventListener("submit", async function (event) {
    event.preventDefault();
    messageConnexion.textContent = "";

    try {
        await window.sosApi.request("/api/login", {
            method: "POST",
            body: {
                telephone: formulaireConnexion.elements.telephone.value.trim(),
                motDePasse: formulaireConnexion.elements.motDePasse.value
            }
        });
        messageConnexion.textContent = "Connexion réussie.";
        const retour = new URLSearchParams(window.location.search).get("retour");
        const destination = retour ? new URL(retour, window.location.href) : null;
        const pageMessages = new URL("messages.html", window.location.href);
        window.location.href = destination
            && destination.origin === window.location.origin
            && destination.pathname === pageMessages.pathname
            ? destination.href
            : "profil.html";
    } catch (erreur) {
        messageConnexion.textContent = erreur.message || "Impossible de se connecter au serveur.";
        console.error("Échec de la connexion.", erreur);
    }
});
