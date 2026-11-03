// The wallet page: lists saved cards and adds new ones with PayPal's card fields (Vault without purchase): our server
// makes a setup token, PayPal's fields put the card on it, and our server turns it into a payment token.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function say(t, err) { $('msg').textContent = t; $('msg').className = 'msg' + (err ? ' err' : ''); }
  function api(path, body) {
    return fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function showWallet() {
    api('/api/wallet').then(function (w) {
      $('wallet').innerHTML = w.length ? w.map(function (c) {
        return '<div class="card"><span><b>' + esc(c.card) + '</b><br><small>' + esc((c.brand || 'Card') + ' ending ' + (c.last4 || '????')) + '</small></span><span>' +
          (c.isDefault ? '<span class="tag">Default</span> ' : '<button class="ghost" data-default="' + esc(c.vaultId) + '">Make default</button> ') +
          '<button class="ghost" data-remove="' + esc(c.vaultId) + '" data-name="' + esc(c.card) + '">Remove</button></span></div>';
      }).join('') : '<p class="muted">No cards yet.</p>';
    });
  }
  $('wallet').addEventListener('click', function (e) {
    var rm = e.target.getAttribute('data-remove'), def = e.target.getAttribute('data-default');
    if (rm && !window.confirm('Remove ' + e.target.getAttribute('data-name') + '? It\'s also deleted from PayPal\'s vault.')) return;
    if (!rm && !def) return;
    e.target.disabled = true;
    (rm ? api('/api/wallet/remove', { vaultId: rm }) : api('/api/wallet/default', { vaultId: def }))
      .then(function () { say(rm ? 'Card removed.' : 'Default card changed.'); showWallet(); })
      .catch(function (err) { say(err.message, true); showWallet(); });
  });

  api('/api/cards').then(function (cards) {
    $('which').innerHTML = '<option value="">Choose…</option>' + cards.sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
  });
  showWallet();

  api('/api/config').then(function (cfg) {
    if (!cfg.clientId) return say('Put the sandbox PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env, then restart the server.', true);
    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(cfg.clientId) + '&components=card-fields';
    s.onerror = function () { say('PayPal didn\'t load. Check your connection.', true); };
    s.onload = function () {
      var fields = window.paypal.CardFields({
        createVaultSetupToken: function () { return api('/api/vault/setup-token', {}).then(function (t) { return t.id; }); },
        onApprove: function (data) {
          say('Saving…');
          return api('/api/vault/payment-token', { setupTokenId: data.vaultSetupToken, cardId: $('which').value, makeDefault: $('makeDefault').checked })
            .then(function (c) { say('Saved: ' + c.card + ' ending ' + (c.last4 || '????') + '.'); showWallet(); })
            .catch(function (e) { say(e.message, true); });
        },
        onError: function (e) { say('PayPal couldn\'t save the card: ' + (e && e.message || e), true); }
      });
      if (!fields.isEligible()) return say('Card fields aren\'t available for this PayPal app. Turn on Advanced Credit and Debit Card Payments in the sandbox app.', true);
      fields.NameField().render('#name'); fields.NumberField().render('#number'); fields.ExpiryField().render('#expiry'); fields.CVVField().render('#cvv');
      $('save').disabled = false;
      $('save').onclick = function () {
        if (!$('which').value) return say('Choose which card this is first.', true);
        say('Sending the card to PayPal…');
        fields.submit().catch(function (e) { say('Check the card details: ' + (e && e.message || e), true); });
      };
    };
    document.head.appendChild(s);
  });
})();
