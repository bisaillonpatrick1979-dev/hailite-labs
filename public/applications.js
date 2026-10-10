/* Hailite Labs / Apps — truthful catalogue, signed APK availability verified by API */
(() => {
  const grid=document.getElementById("appsGrid");
  if(!grid)return;
  const dialog=document.getElementById("appDialog");
  const dialogContent=document.getElementById("appDialogContent");
  const labels={fr:{details:"Voir la fiche",demo:"Essayer sur le Web ↗",product:"Voir le produit",soon:"APK en préparation",download:"Télécharger APK",screens:"Captures d'écran",missing:"Captures d'écran réelles à venir",version:"Version",checksum:"SHA-256",count:" applications",failure:"Impossible de charger le catalogue. Réessayez plus tard.",close:"Fermer",stages:{web:"Essai Web",development:"En développement",concept:"Concept"}},en:{details:"App details",demo:"Try on the Web ↗",product:"View product",soon:"APK coming soon",download:"Download APK",screens:"Screenshots",missing:"Real screenshots coming soon",version:"Version",checksum:"SHA-256",count:" apps",failure:"Unable to load the catalogue. Please try again later.",close:"Close",stages:{web:"Web demo",development:"In development",concept:"Concept"}}};
  let apps=[],releases={},category="all",search="";
  const currentLang=()=>document.documentElement.classList.contains("en")?"en":"fr";
  const t=()=>labels[currentLang()];
  const make=(tag,className,content)=>{const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=content;return el};
  function icon(app){const el=make("div","app-icon");el.style.setProperty("--accent",app.accent||"#8ad2ff");if(app.icon){const img=make("img");img.src=app.icon;img.alt="";img.loading="lazy";el.append(img)}else el.append(make("span","app-glyph",app.name.slice(0,2).toUpperCase()));return el}
  function action(app){const release=releases[app.slug];if(release&&release.available){const a=make("a","app-download",t().download);a.href="/api/download/"+encodeURIComponent(app.slug);a.setAttribute("download",release.fileName||app.slug+".apk");return a}const span=make("span","app-notready",t().soon);span.setAttribute("aria-label",app.name+" — "+t().soon);return span}
  function webLink(app){if(!app.webUrl)return null;const el=make("a","app-web",app.webUrl.startsWith("/")?t().product:t().demo);el.href=app.webUrl;if(!app.webUrl.startsWith("/")){el.target="_blank";el.rel="noopener noreferrer"}return el}
  function card(app){const article=make("article","app-card");const head=make("div","app-card-head");head.append(icon(app));const info=make("div");info.append(make("h3","",app.name));const status=make("span","app-stage",t().stages[app.stage]||t().stages.development);status.dataset.stage=app.stage;info.append(status);head.append(info);article.append(head);
    article.append(make("p","app-copy",app[currentLang()]));
    const thumb=make("div","app-thumb");
    if(app.screenshots?.length){const img=make("img");img.src=app.screenshots[0];img.alt=(currentLang()==="fr"?"Capture réelle de ":"Screenshot of ")+app.name;img.loading="lazy";thumb.append(img)}else thumb.append(make("span","",t().missing));
    article.append(thumb);
    const actions=make("div","app-actions");const more=make("button","app-more",t().details);more.type="button";more.addEventListener("click",()=>details(app));actions.append(more,action(app));article.append(actions);return article}
  function details(app){dialogContent.replaceChildren();const head=make("div","detail-head");head.append(icon(app));const label=make("div");const title=make("h2","",app.name);title.id="detailTitle";label.append(title);const s=make("span","app-stage",t().stages[app.stage]||t().stages.development);s.dataset.stage=app.stage;label.append(s);head.append(label);dialogContent.append(head);
    dialogContent.append(make("p","detail-lead",app[currentLang()]));const list=make("ul","detail-features");(app[currentLang()==="fr"?"featuresFr":"featuresEn"]||[]).forEach(x=>list.append(make("li","",x)));dialogContent.append(list);
    dialogContent.append(make("h3","detail-label",t().screens));const gallery=make("div","detail-gallery");if(app.screenshots?.length){app.screenshots.forEach((url,i)=>{const img=make("img");img.src=url;img.alt=app.name+" — "+(i+1);img.loading="lazy";gallery.append(img)})}else gallery.append(make("div","detail-blank",t().missing));dialogContent.append(gallery);
    const actions=make("div","detail-actions");actions.append(action(app));const link=webLink(app);if(link)actions.append(link);dialogContent.append(actions);
    const rel=releases[app.slug];if(rel?.available){const meta=make("p","detail-meta",t().version+": "+rel.version+" · "+t().checksum+": "+(rel.sha256||"—"));dialogContent.append(meta)}
    dialog.showModal()}
  function render(){grid.replaceChildren();const filtered=apps.filter(x=>(category==="all"||x.category===category)&&((x.name+" "+x.fr+" "+x.en).toLowerCase().includes(search)));filtered.forEach(x=>grid.append(card(x)));document.getElementById("appsEmpty").hidden=filtered.length>0;document.getElementById("appsCount").textContent=filtered.length+t().count}
  document.getElementById("closeDialog").addEventListener("click",()=>dialog.close());dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
  document.querySelectorAll("[data-filter]").forEach(btn=>btn.addEventListener("click",()=>{category=btn.dataset.filter;document.querySelectorAll("[data-filter]").forEach(b=>{const active=b===btn;b.classList.toggle("is-active",active);b.setAttribute("aria-pressed",String(active))});render()}));
  document.getElementById("appsSearch").addEventListener("input",e=>{search=e.target.value.trim().toLocaleLowerCase();render()});
  document.getElementById("langToggle")?.addEventListener("click",()=>{render();if(dialog.open){const app=apps.find(a=>a.name===document.getElementById("detailTitle")?.textContent);if(app)details(app)}});
  Promise.all([fetch("/app-data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("catalogue");return r.json()}),fetch("/api/apps/releases",{cache:"no-store"}).then(r=>r.ok?r.json():{releases:[]}).catch(()=>({releases:[]}))]).then(([data,rel])=>{apps=Array.isArray(data.apps)?data.apps:[];releases=Object.fromEntries((rel.releases||[]).filter(x=>x.available).map(x=>[x.slug,x]));render()}).catch(()=>{grid.replaceChildren(make("p","apps-empty",t().failure))});
})();
