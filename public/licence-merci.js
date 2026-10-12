(() => {
  const status = document.getElementById('status');
  const section = document.getElementById('confirmed');
  const output = document.getElementById('licenseKey');
  const session = new URLSearchParams(location.search).get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(session)) {
    status.textContent = 'Lien invalide / Invalid order link'; return;
  }
  fetch('/api/licence/confirmation?session_id=' + encodeURIComponent(session), {cache:'no-store'})
    .then(async response => {
      const body = await response.json();
      if (!response.ok || !body.ok) throw Error('Unavailable');
      return body;
    })
    .then(data => {
      output.textContent = data.licenseKey;
      section.hidden = false;
      status.textContent = 'Paiement confirmé / Payment confirmed';
    })
    .catch(() => {
      status.textContent = 'Activation indisponible / Activation unavailable. contact@hailitelabs.com';
    });
  document.getElementById('copy').addEventListener('click', () => {
    if (output.textContent) navigator.clipboard.writeText(output.textContent).catch(() => {});
  });
})();