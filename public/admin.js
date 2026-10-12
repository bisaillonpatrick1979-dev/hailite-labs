/* Owner studio. Only language preference is stored locally; app data lives in D1/R2. */
(() => {
  const byId = (id) => document.getElementById(id),
    form = byId("editorForm");
  const lang = () =>
    document.documentElement.classList.contains("en") ? "en" : "fr";
  const tr = (fr, en) => (lang() === "fr" ? fr : en);
  let csrf = "",
    drafts = [],
    current = null,
    dirty = false,
    busy = false,
    authenticated = false,
    storage = false;
  const errors = {
    session_expiree: [
      "Session expirée. Reconnectez-vous; le formulaire est conservé.",
      "Session expired. Sign in again; your form has been kept.",
    ],
    identifiants_invalides: ["Mot de passe incorrect.", "Incorrect password."],
    administration_non_configuree: [
      "L’administration doit être activée dans Cloudflare.",
      "Administration must be enabled in Cloudflare.",
    ],
    stockage_non_configure: [
      "Le stockage des fichiers doit être activé dans Cloudflare.",
      "File storage must be enabled in Cloudflare.",
    ],
    conflit_revision: [
      "La fiche a changé dans un autre onglet. Rechargez-la depuis la liste avant de modifier.",
      "This app changed in another tab. Reload it from the list before editing.",
    ],
    trop_de_tentatives: [
      "Trop de tentatives. Réessayez dans 15 minutes.",
      "Too many attempts. Try again in 15 minutes.",
    ],
    fichier_trop_grand: [
      "Fichier trop grand : images 5 Mio, APK 50 Mio.",
      "File too large: images 5 MiB, APK 50 MiB.",
    ],
    format_invalide: [
      "Le format réel du fichier ne correspond pas à un format accepté.",
      "The actual file format is not supported.",
    ],
    version_invalide: [
      "Indiquez une version valide, par exemple 1.0.0.",
      "Enter a valid version, such as 1.0.0.",
    ],
    fiche_invalide: [
      "Vérifiez le nom, les descriptions, les fonctionnalités et la distribution.",
      "Check the name, descriptions, features and distribution.",
    ],
    lien_invalide: [
      "Utilisez un lien HTTPS ou un chemin interne valide.",
      "Use a valid HTTPS link or internal path.",
    ],
    application_payante: [
      "Hailite Manager doit rester payant.",
      "Hailite Manager must remain paid.",
    ],
    fichier_manquant: [
      "Un fichier référencé manque; téléversez-le avant publication.",
      "A referenced file is missing; upload it before publishing.",
    ],
  };
  function status(message, error = false) {
    const el = byId("adminStatus");
    el.textContent = message;
    el.dataset.error = String(error);
  }
  function showError(error) {
    status(
      (errors[error.message] || [
        "L’opération n’a pas réussi. Réessayez; aucune publication n’a été confirmée.",
        "The operation failed. Try again; no publication has been confirmed.",
      ])[lang() === "fr" ? 0 : 1],
      true,
    );
    if (error.code === 409) byId("reloadApp").hidden = false;
    if (error.code === 401) {
      authenticated = false;
      byId("loginPanel").hidden = false;
      byId("studio").hidden = true;
      byId("password").focus();
    }
  }
  async function api(path, method = "GET", data) {
    const r = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers:
        method === "GET"
          ? {}
          : { "content-type": "application/json", "x-csrf-token": csrf },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const error = new Error(body.erreur || "serveur");
      error.code = r.status;
      throw error;
    }
    return body;
  }
  function privateImage(url) {
    return url?.startsWith("/api/app-media/")
      ? url.replace("/api/app-media/", "/api/admin/media/")
      : url;
  }
  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function list() {
    const root = byId("appList");
    root.replaceChildren();
    const search = byId("adminSearch").value.toLowerCase();
    for (const d of drafts.filter((x) =>
      x.app.name.toLowerCase().includes(search),
    )) {
      const b = element("button", undefined, "admin-app-button");
      b.type = "button";
      b.classList.toggle("is-active", d.app.slug === current?.app.slug);
      if (d.app.icon) {
        const image = element("img");
        image.src = privateImage(d.app.icon);
        image.alt = "";
        b.append(image);
      } else
        b.append(
          element("span", d.app.name.slice(0, 2).toUpperCase(), "app-initial"),
        );
      const label = element("span", d.app.name);
      label.append(
        element(
          "small",
          d.published
            ? tr("Publié · brouillon disponible", "Published · draft available")
            : tr("Brouillon privé", "Private draft"),
        ),
      );
      b.append(label);
      b.disabled = busy;
      b.addEventListener("click", () => {
        if (busy || !discard()) return;
        load(d);
      });
      root.append(b);
    }
    if (!root.children.length)
      root.append(
        element("p", tr("Aucune application trouvée.", "No apps found.")),
      );
  }
  function discard() {
    return (
      !dirty ||
      confirm(
        tr(
          "Quitter cette fiche sans enregistrer les modifications?",
          "Leave this app without saving your changes?",
        ),
      )
    );
  }
  const names = [
    "name",
    "slug",
    "category",
    "stage",
    "accent",
    "distribution",
    "fr",
    "en",
    "webUrl",
    "purchaseUrl",
  ];
  function read() {
    const app = { ...current.app };
    for (const name of names) app[name] = form.elements[name].value.trim();
    for (const key of ["featuresFr", "featuresEn"])
      app[key] = form.elements[key].value
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
    app.webUrl = app.webUrl || null;
    app.purchaseUrl = app.purchaseUrl || null;
    return app;
  }
  function load(d) {
    current = structuredClone(d);
    current.isNew = d.isNew === true;
    dirty = false;
    byId("reloadApp").hidden = true;
    byId("editorEmpty").hidden = true;
    form.hidden = false;
    for (const name of names)
      form.elements[name].value = current.app[name] || "";
    for (const key of ["featuresFr", "featuresEn"])
      form.elements[key].value = (current.app[key] || []).join("\n");
    byId("apkVersion").value = current.app.apk?.version || "";
    byId("slug").readOnly = !current.isNew;
    refresh();
  }
  function controls() {
    byId("editorFields").disabled = busy;
    for (const id of ["saveApp", "previewApp", "newApp", "logout"])
      byId(id).disabled = busy;
    byId("publishApp").disabled = busy || dirty || !current?.revision;
    byId("unpublishApp").disabled = busy || dirty || !current?.published;
    for (const id of ["iconFile", "screensFile", "apkFile"])
      byId(id).disabled = busy || !storage || !current?.revision;
    byId("apkVersion").disabled = busy;
    byId("uploadHint").hidden = !!current?.revision;
    byId("editorState").textContent = dirty
      ? tr("Modifications à enregistrer", "Unsaved changes")
      : current?.published
        ? tr("Publié · brouillon enregistré", "Published · draft saved")
        : tr("Brouillon privé", "Private draft");
    if (current)
      byId("editorHeading").textContent =
        byId("name").value || tr("Nouvelle application", "New application");
    document
      .querySelectorAll(".admin-app-button,.media-item button")
      .forEach((button) => (button.disabled = busy));
    byId("reloadApp").disabled = busy;
  }
  function refresh() {
    controls();
    list();
    const root = byId("mediaList");
    root.replaceChildren();
    const images = [
      ...(current?.app.icon ? [{ url: current.app.icon, icon: true }] : []),
      ...(current?.app.screenshots || []).map((url) => ({ url, icon: false })),
    ];
    for (const item of images) {
      const cell = element("div", undefined, "media-item"),
        img = element("img");
      img.src = privateImage(item.url);
      img.alt = item.icon ? tr("Icône", "Icon") : tr("Capture", "Screenshot");
      const remove = element("button", tr("Retirer", "Remove"));
      remove.type = "button";
      remove.disabled = busy;
      remove.addEventListener("click", () => {
        if (busy) return;
        if (item.icon) current.app.icon = null;
        else
          current.app.screenshots = current.app.screenshots.filter(
            (x) => x !== item.url,
          );
        dirty = true;
        refresh();
      });
      cell.append(img, remove);
      root.append(cell);
    }
    byId("apkInfo").textContent = current?.app.apk
      ? tr("APK ajouté · version ", "APK added · version ") +
        current.app.apk.version
      : tr("Aucun APK ajouté.", "No APK added.");
  }
  async function enter() {
    const state = await api("/api/admin/session");
    csrf = state.csrf;
    storage = state.storage;
    drafts = (await api("/api/admin/apps")).drafts;
    authenticated = true;
    byId("loginPanel").hidden = true;
    byId("studio").hidden = false;
    byId("storageNotice").textContent = storage
      ? tr(
          "Vos applications et fichiers sont enregistrés sur le serveur.",
          "Your apps and files are saved on the server.",
        )
      : tr(
          "Fiches disponibles. Stockage des fichiers à activer dans Cloudflare.",
          "App editing available. File storage must be enabled in Cloudflare.",
        );
    list();
    if (current) refresh();
  }
  byId("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await api("/api/admin/login", "POST", {
        password: byId("password").value,
      });
      byId("password").value = "";
      await enter();
      status(tr("Bienvenue dans votre studio.", "Welcome to your studio."));
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  });
  byId("newApp").addEventListener("click", () => {
    if (busy || !discard()) return;
    load({
      isNew: true,
      app: {
        slug: "",
        name: "",
        category: "games",
        stage: "development",
        accent: "#3fc6ff",
        distribution: "",
        fr: "",
        en: "",
        featuresFr: [],
        featuresEn: [],
        icon: null,
        screenshots: [],
        webUrl: null,
        purchaseUrl: null,
        apk: null,
      },
      revision: 0,
      published: false,
    });
    byId("name").focus();
  });
  form.addEventListener("input", (e) => {
    if (e.target.id === "apkVersion") return;
    dirty = true;
    if (e.target.id === "name" && current.isNew)
      byId("slug").value = e.target.value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
    controls();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || !current || !form.reportValidity()) return;
    busy = true;
    controls();
    try {
      const data = await api(
        "/api/admin/apps/" + encodeURIComponent(byId("slug").value),
        "PUT",
        { app: read(), expectedRevision: current.revision },
      );
      current = data.draft;
      dirty = false;
      byId("slug").readOnly = true;
      drafts = (await api("/api/admin/apps")).drafts;
      status(
        tr(
          "Brouillon enregistré. Vous pouvez ajouter des fichiers ou publier.",
          "Draft saved. You can add files or publish.",
        ),
      );
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      refresh();
    }
  });
  async function publish(active) {
    if (busy || dirty || !current || (active && !current.revision)) return;
    if (
      active === false &&
      !confirm(
        tr(
          "Retirer cette application du site public?",
          "Remove this app from the public site?",
        ),
      )
    )
      return;
    busy = true;
    controls();
    try {
      const data = await api(
        "/api/admin/apps/" +
          current.app.slug +
          "/" +
          (active ? "publish" : "unpublish"),
        "POST",
        { expectedRevision: current.revision },
      );
      current = data.draft;
      drafts = (await api("/api/admin/apps")).drafts;
      status(
        active
          ? tr("Application publiée sur le site.", "App published to the site.")
          : tr(
              "Application retirée du site. Le brouillon est conservé.",
              "App removed from the site. Your draft has been kept.",
            ),
      );
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      refresh();
    }
  }
  byId("publishApp").addEventListener("click", () => publish(true));
  byId("unpublishApp").addEventListener("click", () => publish(false));
  function transfer(file, kind) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(),
        params = new URLSearchParams({ kind });
      if (kind === "apk")
        params.set("version", byId("apkVersion").value.trim());
      xhr.open(
        "POST",
        "/api/admin/apps/" + current.app.slug + "/uploads?" + params,
      );
      xhr.setRequestHeader("X-CSRF-Token", csrf);
      xhr.setRequestHeader(
        "X-File-Name",
        file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
      );
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          byId("uploadProgress").value = Math.round((100 * e.loaded) / e.total);
      };
      xhr.onload = () => {
        let body;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body.file);
        else {
          const error = new Error(body.erreur || "serveur");
          error.code = xhr.status;
          reject(error);
        }
      };
      xhr.onerror = () => reject(new Error("reseau"));
      xhr.onabort = () => reject(new Error("transfert_interrompu"));
      xhr.send(file);
    });
  }
  for (const [id, kind] of [
    ["iconFile", "icon"],
    ["screensFile", "screenshot"],
    ["apkFile", "apk"],
  ])
    byId(id).addEventListener("change", async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      if (
        kind === "screenshot" &&
        current.app.screenshots.length + files.length > 6
      ) {
        status(
          tr(
            "Six captures au maximum. Retirez une image avant d’en ajouter.",
            "Up to six screenshots. Remove an image before adding more.",
          ),
          true,
        );
        e.target.value = "";
        return;
      }
      if (
        kind === "apk" &&
        !/^[0-9][a-zA-Z0-9.+-]{0,39}$/.test(byId("apkVersion").value)
      ) {
        showError(new Error("version_invalide"));
        e.target.value = "";
        return;
      }
      busy = true;
      refresh();
      byId("uploadProgress").hidden = false;
      try {
        for (const file of files) {
          if (file.size > (kind === "apk" ? 50 : 5) * 1024 * 1024)
            throw new Error("fichier_trop_grand");
          status(tr("Téléversement : ", "Uploading: ") + file.name);
          byId("uploadProgress").value = 0;
          const result = await transfer(file, kind);
          if (kind === "icon") current.app.icon = result.url;
          else if (kind === "screenshot")
            current.app.screenshots.push(result.url);
          else
            current.app.apk = {
              key: result.key,
              fileId: result.id,
              version: result.version,
              sha256: result.sha256,
            };
          dirty = true;
        }
        status(
          tr(
            "Fichiers transférés. Enregistrez le brouillon pour les conserver dans la fiche.",
            "Files uploaded. Save the draft to keep them in the app.",
          ),
        );
      } catch (error) {
        showError(error);
      } finally {
        busy = false;
        byId("uploadProgress").hidden = true;
        e.target.value = "";
        refresh();
      }
    });
  byId("previewApp").addEventListener("click", () => {
    if (busy || !current) return;
    const app = read(),
      root = byId("previewContent");
    root.replaceChildren();
    if (app.icon) {
      const img = element("img", undefined, "preview-icon");
      img.src = privateImage(app.icon);
      img.alt = "";
      root.append(img);
    }
    const h = element("h2", app.name);
    h.id = "previewTitle";
    root.append(h, element("p", app[lang()]));
    const ul = element("ul");
    for (const x of app[lang() === "fr" ? "featuresFr" : "featuresEn"])
      ul.append(element("li", x));
    root.append(ul);
    const gallery = element("div", undefined, "preview-gallery");
    for (const url of app.screenshots) {
      const image = element("img");
      image.src = privateImage(url);
      image.alt = app.name;
      gallery.append(image);
    }
    root.append(
      gallery,
      element(
        "p",
        tr(
          "Aperçu privé — aucune publication automatique.",
          "Private preview — nothing publishes automatically.",
        ),
      ),
    );
    byId("previewDialog").showModal();
  });
  byId("closePreview").addEventListener("click", () =>
    byId("previewDialog").close(),
  );
  byId("logout").addEventListener("click", async () => {
    if (busy || !discard()) return;
    try {
      await api("/api/admin/logout", "POST", {});
      current = null;
      dirty = false;
      csrf = "";
      authenticated = false;
      byId("studio").hidden = true;
      form.hidden = true;
      byId("editorEmpty").hidden = false;
      byId("loginPanel").hidden = false;
      status(tr("Vous êtes déconnecté.", "You have signed out."));
    } catch (error) {
      showError(error);
    }
  });
  byId("reloadApp").addEventListener("click", async () => {
    if (busy || !current || !discard()) return;
    const slug = current.app.slug;
    busy = true;
    controls();
    try {
      drafts = (await api("/api/admin/apps")).drafts;
      const fresh = drafts.find((d) => d.app.slug === slug);
      if (!fresh) throw new Error("application_introuvable");
      busy = false;
      load(fresh);
      status(
        tr(
          "La dernière version du serveur est chargée.",
          "The latest server version has been loaded.",
        ),
      );
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      refresh();
    }
  });
  byId("adminSearch").addEventListener("input", list);
  byId("langToggle").addEventListener("click", () => {
    list();
    if (current) refresh();
  });
  addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  enter().catch((error) => {
    if (error.code !== 401) showError(error);
  });
})();
