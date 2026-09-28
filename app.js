const products = [
  {
    id:"hailite-manager",
    category:"apps",
    badge:{fr:"APP VEDETTE",en:"FEATURED APP"},
    title:"Hailite Manager",
    desc:{fr:"Gestion de chantier, temps, factures, clients et projets.",en:"Worksite management, time, invoices, clients and projects."},
    price:19.99,
    art:"HL",
    type:"logo",
    features:{fr:["Suivi du temps","Gestion de projets","Facturation","Conçu pour mobile"],en:["Time tracking","Project management","Invoicing","Built for mobile"]}
  },
  {
    id:"calc-pro",
    category:"tools",
    badge:{fr:"OUTIL NUMÉRIQUE",en:"DIGITAL TOOL"},
    title:"Construction Calc Pro",
    desc:{fr:"Calculs rapides pour mesures, surfaces et matériaux.",en:"Fast calculations for measurements, areas and materials."},
    price:6.99,
    art:"⌗",
    features:{fr:["Pieds & pouces","Surfaces","Conversions","Mode chantier"],en:["Feet & inches","Areas","Conversions","Jobsite mode"]}
  },
  {
    id:"flexhook",
    category:"3d",
    badge:{fr:"IMPRESSION 3D",en:"3D PRINT"},
    title:"FlexHook V2",
    desc:{fr:"Crochet multi-usage robuste pour atelier, garage ou chantier.",en:"Heavy-duty multipurpose hook for workshop, garage or jobsite."},
    price:14.99,
    art:"hook",
    type:"hook",
    features:{fr:["PETG robuste","Installation simple","Plusieurs usages","Fabriqué localement"],en:["Durable PETG","Easy install","Multi-use","Made locally"]}
  },
  {
    id:"battery-holder",
    category:"3d",
    badge:{fr:"IMPRESSION 3D",en:"3D PRINT"},
    title:"Battery Dock",
    desc:{fr:"Support mural pour batteries et accessoires d'outils.",en:"Wall mount for tool batteries and accessories."},
    price:18.99,
    art:"⬢",
    features:{fr:["Montage mural","Format compact","Compatible atelier","Design modulaire"],en:["Wall mounted","Compact format","Workshop ready","Modular design"]}
  },
  {
    id:"tool-grid",
    category:"tools",
    badge:{fr:"ATELIER",en:"WORKSHOP"},
    title:"Tool Grid",
    desc:{fr:"Organisateur mural modulaire pour petits outils et embouts.",en:"Modular wall organizer for small tools and bits."},
    price:24.99,
    art:"▦",
    features:{fr:["Modulaire","Extensible","Organisation rapide","Look propre"],en:["Modular","Expandable","Fast organization","Clean look"]}
  },
  {
    id:"prankbox",
    category:"games",
    badge:{fr:"PRANK",en:"PRANK"},
    title:"PrankBox",
    desc:{fr:"Un petit bouton sonore avec une collection de sons absurdes.",en:"A small sound button with a collection of absurd sounds."},
    price:12.99,
    art:"?!",
    features:{fr:["Plusieurs sons","Rechargeable","Petit format","Parfait pour niaiser"],en:["Multiple sounds","Rechargeable","Compact","Built for laughs"]}
  },
  {
    id:"mini-game",
    category:"games",
    badge:{fr:"JEU",en:"GAME"},
    title:"Maple Drop",
    desc:{fr:"Petit jeu casual simple, rapide et franchement accrocheur.",en:"A simple, fast and surprisingly addictive casual game."},
    price:3.99,
    art:"◆",
    features:{fr:["Sessions rapides","Scores","Défis","Mobile"],en:["Quick sessions","Scores","Challenges","Mobile"]}
  },
  {
    id:"cap",
    category:"apparel",
    badge:{fr:"VÊTEMENT",en:"APPAREL"},
    title:"Casquette Hailite Labs",
    desc:{fr:"Casquette noire minimaliste avec logo HL brodé.",en:"Minimal black cap with embroidered HL logo."},
    price:29.99,
    art:"HL",
    type:"logo",
    features:{fr:["Logo brodé","Ajustable","Noir","Style minimal"],en:["Embroidered logo","Adjustable","Black","Minimal style"]}
  },
  {
    id:"hoodie",
    category:"apparel",
    badge:{fr:"VÊTEMENT",en:"APPAREL"},
    title:"Hoodie Hailite Labs",
    desc:{fr:"Hoodie épuré, confortable et passe-partout.",en:"Clean, comfortable, everyday hoodie."},
    price:59.99,
    art:"H",
    type:"shirt",
    features:{fr:["Coupe unisexe","Tissu doux","Logo discret","Plusieurs tailles"],en:["Unisex fit","Soft fabric","Subtle logo","Multiple sizes"]}
  },
  {
    id:"shirt-qc",
    category:"apparel",
    badge:{fr:"QUÉBEC",en:"QUÉBEC"},
    title:"T-shirt « Pas pire. »",
    desc:{fr:"Un classique simple, direct et bien d'ici.",en:"Simple, direct and unmistakably Québec."},
    price:29.99,
    art:"PAS\nPIRE.",
    type:"shirt",
    features:{fr:["Coupe unisexe","Impression durable","Plusieurs couleurs","Humour d'ici"],en:["Unisex fit","Durable print","Multiple colours","Québec humour"]}
  }
];

const state = {
  lang: localStorage.getItem("hailite-lang") || "fr",
  filter: "all",
  search: "",
  cart: JSON.parse(localStorage.getItem("hailite-cart") || "[]")
};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

function money(value){
  return new Intl.NumberFormat(state.lang === "fr" ? "fr-CA" : "en-CA", {
    style:"currency", currency:"CAD"
  }).format(value);
}

function t(obj){ return obj[state.lang] || obj.fr || obj.en || ""; }

function setLanguage(lang){
  state.lang = lang;
  localStorage.setItem("hailite-lang", lang);
  document.body.classList.toggle("en", lang === "en");
  document.documentElement.lang = lang;
  $("#langToggle").innerHTML = lang === "fr" ? 'FR <span>/</span> EN' : 'EN <span>/</span> FR';
  $("#searchInput").placeholder = lang === "fr" ? "Rechercher..." : "Search...";
  renderProducts();
  renderCart();
}

function productArt(p, large=false){
  if(p.type === "logo"){
    return '<div class="product-object logo-object"><img src="./assets/logo.svg" alt=""></div>';
  }
  if(p.type === "hook"){
    return '<div class="product-object hook-shape"></div>';
  }
  if(p.type === "shirt"){
    return '<div class="product-object shirt">'+p.art.replace(/\n/g,"<br>")+'</div>';
  }
  return '<div class="product-object">'+p.art+'</div>';
}

function visibleProducts(){
  const q = state.search.trim().toLowerCase();
  return products.filter(p => {
    const matchFilter = state.filter === "all" || p.category === state.filter;
    const hay = [p.title,p.category,p.desc.fr,p.desc.en].join(" ").toLowerCase();
    return matchFilter && (!q || hay.includes(q));
  });
}

function renderProducts(){
  const grid = $("#productGrid");
  const rows = visibleProducts();
  grid.innerHTML = rows.map(p => `
    <article class="product-card" data-id="${p.id}">
      <div class="product-art">
        <span class="product-badge">${t(p.badge)}</span>
        ${productArt(p)}
      </div>
      <div class="product-info">
        <div class="product-meta"><span>${p.category.toUpperCase()}</span><span>★ 4.${Math.floor(6+Math.random()*3)}</span></div>
        <h3>${p.title}</h3>
        <p>${t(p.desc)}</p>
        <div class="product-bottom">
          <span class="price">${money(p.price)}</span>
          <button class="add-btn" data-add="${p.id}">${state.lang==="fr"?"Ajouter":"Add"}</button>
        </div>
      </div>
    </article>
  `).join("");

  if(!rows.length){
    grid.innerHTML = `<div style="grid-column:1/-1;padding:60px 20px;text-align:center;color:#71869d">${state.lang==="fr"?"Aucun produit trouvé.":"No products found."}</div>`;
  }

  $$("[data-add]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    addToCart(btn.dataset.add);
  }));
  $$(".product-card").forEach(card => card.addEventListener("click", () => openProduct(card.dataset.id)));
}

function setFilter(filter){
  state.filter = filter;
  $$("#filters button").forEach(b => b.classList.toggle("active", b.dataset.filter === filter));
  renderProducts();
  document.querySelector("#shop").scrollIntoView({behavior:"smooth"});
}

function addToCart(id){
  const existing = state.cart.find(x => x.id === id);
  if(existing) existing.qty += 1;
  else state.cart.push({id,qty:1});
  saveCart();
  showToast(state.lang==="fr" ? "Ajouté au panier" : "Added to cart");
}

function saveCart(){
  localStorage.setItem("hailite-cart",JSON.stringify(state.cart));
  renderCart();
}

function renderCart(){
  $("#cartCount").textContent = state.cart.reduce((n,x)=>n+x.qty,0);
  const host = $("#cartItems");
  if(!state.cart.length){
    host.innerHTML = `<div class="cart-empty">${state.lang==="fr"?"Votre panier est vide.":"Your cart is empty."}</div>`;
  } else {
    host.innerHTML = state.cart.map(line => {
      const p = products.find(x=>x.id===line.id);
      if(!p) return "";
      return `<div class="cart-line">
        <div class="cart-thumb">${p.type==="logo"?"HL":p.art.replace(/\n/g," ")}</div>
        <div><b>${p.title}</b><small>${line.qty} × ${money(p.price)}</small></div>
        <button class="remove-btn" data-remove="${p.id}" aria-label="Remove">×</button>
      </div>`;
    }).join("");
  }
  const total = state.cart.reduce((sum,line)=>{
    const p = products.find(x=>x.id===line.id);
    return sum + (p ? p.price*line.qty : 0);
  },0);
  $("#cartTotal").textContent = money(total);
  $$("[data-remove]").forEach(btn=>btn.addEventListener("click",()=>{
    state.cart = state.cart.filter(x=>x.id!==btn.dataset.remove);
    saveCart();
  }));
}

function openCart(){
  $("#cartDrawer").classList.add("open");
  $("#overlay").classList.add("show");
  $("#cartDrawer").setAttribute("aria-hidden","false");
}
function closeCart(){
  $("#cartDrawer").classList.remove("open");
  $("#overlay").classList.remove("show");
  $("#cartDrawer").setAttribute("aria-hidden","true");
}

function openProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  $("#modalContent").innerHTML = `
    <div class="modal-layout">
      <div class="modal-art">${productArt(p,true)}</div>
      <div class="modal-copy">
        <p class="kicker">${t(p.badge)}</p>
        <h2>${p.title}</h2>
        <p>${t(p.desc)}</p>
        <div class="modal-list">
          ${t(p.features).map(x=>`<span>✓ ${x}</span>`).join("")}
        </div>
        <div class="modal-price">${money(p.price)}</div>
        <button class="btn btn-primary full" data-modal-add="${p.id}">${state.lang==="fr"?"Ajouter au panier":"Add to cart"}</button>
      </div>
    </div>`;
  $("#productModal").showModal();
  $("[data-modal-add]").addEventListener("click",()=>{
    addToCart(p.id);
    $("#productModal").close();
  });
}

let toastTimer;
function showToast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove("show"),1800);
}

$("#langToggle").addEventListener("click",()=>setLanguage(state.lang==="fr"?"en":"fr"));
$("#searchInput").addEventListener("input",e=>{state.search=e.target.value;renderProducts()});
$("#searchFocus").addEventListener("click",()=>{document.querySelector("#shop").scrollIntoView({behavior:"smooth"});setTimeout(()=>$("#searchInput").focus(),500)});
$("#cartOpen").addEventListener("click",openCart);
$("#cartClose").addEventListener("click",closeCart);
$("#overlay").addEventListener("click",closeCart);
$("#modalClose").addEventListener("click",()=>$("#productModal").close());

$$("[data-category]").forEach(btn=>btn.addEventListener("click",()=>setFilter(btn.dataset.category)));
$$("[data-filter-link]").forEach(link=>link.addEventListener("click",()=>setFilter(link.dataset.filterLink)));
$$("[data-filter]").forEach(btn=>btn.addEventListener("click",()=>setFilter(btn.dataset.filter)));
$$("[data-product-open]").forEach(btn=>btn.addEventListener("click",()=>openProduct(btn.dataset.productOpen)));

$("#newsletterForm").addEventListener("submit",e=>{
  e.preventDefault();
  e.currentTarget.reset();
  showToast(state.lang==="fr"?"Merci! Vous êtes inscrit.":"Thanks! You're subscribed.");
});
["checkoutBtn","checkoutBtnEn"].forEach(id=>$("#"+id).addEventListener("click",()=>{
  showToast(state.lang==="fr"?"Paiement bientôt disponible.":"Checkout coming soon.");
}));

setLanguage(state.lang);
renderCart();
