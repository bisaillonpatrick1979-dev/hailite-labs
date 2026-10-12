(() => {
  const root = document.getElementById("homeApps"),
    featured = document.getElementById("homeFeatured");
  if (!root) return;
  const lang = () =>
    document.documentElement.classList.contains("en") ? "en" : "fr";
  const t = (fr, en) => (lang() === "fr" ? fr : en);
  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const safe = window.HailiteCatalogue.safeHref;
  let apps = [];
  const stage = (app) =>
    ({
      web: t("Essai Web", "Web demo"),
      development: t("En développement", "In development"),
      concept: "Concept",
    })[app.stage] || t("En développement", "In development");
  function appIcon(app) {
    const icon = node("div", undefined, "home-app-icon");
    if (safe(app.icon)) {
      const img = node("img");
      img.src = safe(app.icon);
      img.alt = "";
      icon.append(img);
    } else icon.append(node("span", app.name.slice(0, 2).toUpperCase()));
    return icon;
  }
  function render() {
    root.replaceChildren();
    featured.replaceChildren();
    for (const app of apps.slice(0, 6)) {
      const card = node("article", undefined, "home-app-card");
      card.id = app.slug;
      const top = node("div", undefined, "home-app-top");
      top.append(appIcon(app), node("span", stage(app), "home-stage"));
      card.append(top, node("h3", app.name), node("p", app[lang()]));
      const a = node(
        "a",
        t("Découvrir l’application", "Discover the app") + " ↗",
        "home-app-link",
      );
      a.href = "/applications#" + encodeURIComponent(app.slug);
      card.append(a);
      root.append(card);
    }
    if (!apps.length) {
      root.append(
        node(
          "p",
          t(
            "La collection sera bientôt disponible.",
            "The collection will be available soon.",
          ),
        ),
      );
      featured.append(
        node(
          "p",
          t(
            "De nouvelles idées prennent forme.",
            "New ideas are taking shape.",
          ),
        ),
      );
      return;
    }
    const app = apps.find((a) => a.slug === "hailite-manager") || apps[0];
    const label = node("div", undefined, "featured-header");
    label.append(
      node("span", t("À LA UNE", "FEATURED")),
      node("span", stage(app), "home-stage"),
    );
    featured.append(label);
    const wrap = node("div", undefined, "featured-art");
    if (app.screenshots?.some(safe)) {
      const img = node("img", undefined, "featured-screen");
      img.src = app.screenshots.find(safe);
      img.alt = t("Capture réelle de ", "Screenshot of ") + app.name;
      wrap.append(img);
      if (app.screenshots[1] && safe(app.screenshots[1])) {
        const second = node("img", undefined, "featured-screen second");
        second.src = app.screenshots[1];
        second.alt =
          t("Autre capture de ", "Another screenshot of ") + app.name;
        wrap.append(second);
      }
    } else {
      wrap.classList.add("featured-icon-art");
      wrap.append(appIcon(app));
    }
    featured.append(wrap);
    const bottom = node("div", undefined, "featured-bottom");
    bottom.append(node("h2", app.name), node("p", app[lang()]));
    const link = node("a", t("Découvrir", "Explore") + " ↗", "home-text-link");
    link.href = "/applications#" + encodeURIComponent(app.slug);
    bottom.append(link);
    featured.append(bottom);
  }
  document.getElementById("langToggle")?.addEventListener("click", render);
  window.HailiteCatalogue.fetchCatalog()
    .then((data) => {
      apps = data.apps;
      render();
    })
    .catch(() => {
      root.replaceChildren(
        node(
          "p",
          t(
            "Le catalogue est temporairement indisponible. Réessayez plus tard.",
            "The catalogue is temporarily unavailable. Please try again later.",
          ),
        ),
      );
      featured.replaceChildren(
        node(
          "p",
          t(
            "Collection temporairement indisponible.",
            "Collection temporarily unavailable.",
          ),
        ),
      );
    });
})();
