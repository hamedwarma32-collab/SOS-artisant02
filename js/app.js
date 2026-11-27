(function () {
  let evenementInstallation = null;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("../sw.js").catch(function (erreur) {
        console.error("Impossible d'activer le mode hors connexion.", erreur);
      });
    });
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    evenementInstallation = event;

    const bouton = document.getElementById("boutonInstallerApplication");
    if (bouton) bouton.hidden = false;
  });

  window.addEventListener("DOMContentLoaded", function () {
    const bouton = document.getElementById("boutonInstallerApplication");
    if (!bouton) return;

    bouton.addEventListener("click", async function () {
      if (!evenementInstallation) {
        bouton.textContent = "Utilisez le menu du navigateur pour installer";
        return;
      }

      evenementInstallation.prompt();
      await evenementInstallation.userChoice;
      evenementInstallation = null;
      bouton.hidden = true;
    });
  });

  window.addEventListener("appinstalled", function () {
    const bouton = document.getElementById("boutonInstallerApplication");
    if (bouton) bouton.hidden = true;
  });
})();
