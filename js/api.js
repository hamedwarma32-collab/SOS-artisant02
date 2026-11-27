(function () {
  let csrfToken = "";

  async function getCsrfToken() {
    if (!csrfToken) {
      const response = await fetch("/api/csrf", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Impossible d'initialiser la session sécurisée.");
      const data = await response.json();
      csrfToken = data.csrfToken;
    }
    return csrfToken;
  }

  async function request(url, options) {
    const config = Object.assign({ credentials: "same-origin" }, options || {});
    config.headers = Object.assign({}, config.headers || {});
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
      const error = new Error(data.error || "La requête a échoué.");
      error.status = response.status;
      throw error;
    }
    if (data.csrfToken) csrfToken = data.csrfToken;
    return data;
  }

  window.sosApi = {
    getCsrfToken: getCsrfToken,
    request: request
  };
})();
