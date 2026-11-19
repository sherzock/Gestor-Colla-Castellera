// S'executa abans de pintar la pàgina, perquè el tema i l'idioma triats no parpellegin en carregar.
try {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  const l = localStorage.getItem('lang');
  if (l) document.documentElement.lang = l;
} catch (e) { /* sense emmagatzematge */ }
