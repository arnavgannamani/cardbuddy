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

  var FACES = ['#0a2366', '#1a5fdb', '#0c1322', '#3b5a99', '#5d6879']; // PointMaxx navy, blue and ink: drawn cards, never issuer art
  function brand(b) { b = String(b || 'Card').toLowerCase(); return b.charAt(0).toUpperCase() + b.slice(1); }

  // For each category, the card AgentPay would pay a $100 purchase with, from the same engine the agent uses.
  function routes(categories) {
    return Promise.all(categories.map(function (cat) {
      return api('/api/recommend', { amount: 100, merchant: cat, category: cat }).catch(function () { return null; });
    })).then(function (list) { return list.filter(Boolean); });
  }

  function showRoutes(list) {
    var max = Math.max.apply(null, list.map(function (r) { return r.best.percentBack; }).concat([1]));
    var pct = function (x) { return (x / max * 100).toFixed(1) + '%'; };
    list = list.slice().sort(function (a, b) { return (b.best.percentBack - b.defaultCard.percentBack) - (a.best.percentBack - a.defaultCard.percentBack); });
    $('routes').innerHTML = list.map(function (r) {
      var gain = r.best.percentBack - r.defaultCard.percentBack;
      return '<tr><td>' + esc(r.categoryLabel) + '</td><td>' + (gain > 0 ? '<b>' + esc(r.best.card) + '</b>' : '<span class="same">' + esc(r.best.card) + '</span>') +
        (r.best.rail !== 'card' ? ' <small>via ' + (r.best.rail === 'paypal' ? 'PayPal' : 'Venmo') + '</small>' : '') + '</td>' +
        '<td class="r"><span class="rate"><span class="num">' + r.best.percentBack + '%</span><span class="track' + (gain > 0 ? '' : ' flat') + '" aria-hidden="true"><i style="width:' + pct(r.best.percentBack) + '"></i><u style="left:calc(' + pct(r.defaultCard.percentBack) + ' - 1px)"></u></span></span></td>' +
        '<td class="r hide-s">' + (gain > 0 ? '<span class="gain">+$' + gain.toFixed(2) + '</span>' : '<span class="same">same</span>') + '</td></tr>';
    }).join('');
  }

  function showWallet() {
    api('/api/wallet').then(function (w) {
      $('cardCount').textContent = w.length ? w.length + (w.length === 1 ? ' card' : ' cards') : '';
      if (!w.length) {
        $('wallet').innerHTML = '<div class="pb"><p class="note">No cards yet. Add the cards you already carry; your agent can only pay with cards on this list.</p></div>';
        $('routes').innerHTML = '<tr><td colspan="4" class="empty">Add a card to see where it wins.</td></tr>';
        if (window.agentpayReady) window.agentpayReady();
        return;
      }
      api('/api/config').then(function (cfg) { return routes(cfg.categories || []); }).then(function (list) {
        var wins = {};
        list.forEach(function (r) { if (r.best.percentBack > r.defaultCard.percentBack) wins[r.best.cardId] = (wins[r.best.cardId] || 0) + 1; });
        $('wallet').innerHTML = w.map(function (c, i) {
          var n = wins[c.cardId] || 0;
          var role = c.isDefault ? 'pays wherever no card beats it' : n ? 'beats your default in ' + n + (n === 1 ? ' category' : ' categories') : 'never beats your default';
          return '<div class="cardrow"><span class="face" data-net="' + esc({ MASTERCARD: 'MC', VISA: 'VISA', AMEX: 'AMEX', DISCOVER: 'DISC' }[String(c.brand).toUpperCase()] || '') + '" style="--face:' + FACES[i % FACES.length] + '" aria-hidden="true"></span><span><b>' + esc(c.card) + '</b><small>' +
            esc(brand(c.brand) + ' ending ' + (c.last4 || '????') + ' · ' + role) + '</small></span><span class="acts">' +
            (c.isDefault ? '<span class="pill">Default</span>' : '<button class="link" data-default="' + esc(c.vaultId) + '">Make default</button>') +
            '<button class="link" data-remove="' + esc(c.vaultId) + '" data-name="' + esc(c.card) + '">Remove</button></span></div>';
        }).join('');
        showRoutes(list); if (window.agentpayReady) window.agentpayReady();
      });
    }).catch(function (e) { say(e.message, true); });
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
    $('which').innerHTML = '<option value="">Choose the card…</option>' + cards.sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
  });
  showWallet();

  api('/api/config').then(function (cfg) {
    if (!cfg.clientId) return say('Put the sandbox PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env, then restart the server.', true);
    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(cfg.clientId) + '&components=card-fields';
    s.onerror = function () { say('PayPal didn\'t load. Check your connection.', true); };
    s.onload = function () {
      var serverError = null; // AgentPay's own error (say, the PayPal app's permissions), not a problem with the card
      var fields = window.paypal.CardFields({
        createVaultSetupToken: function () {
          serverError = null;
          return api('/api/vault/setup-token', {}).then(function (t) { return t.id; }, function (e) { serverError = e.message; throw e; });
        },
        onApprove: function (data) {
          say('Saving…');
          return api('/api/vault/payment-token', { setupTokenId: data.vaultSetupToken, cardId: $('which').value, makeDefault: $('makeDefault').checked })
            .then(function (c) {
              say('Saved: ' + c.card + ' ending ' + (c.last4 || '????') + '.');
              parts.forEach(function (f) { if (f.clear) f.clear(); }); $('which').value = ''; $('makeDefault').checked = false; // ready for the next card
              showWallet();
            })
            .catch(function (e) { say(e.message, true); });
        },
        onError: function (e) { say('PayPal couldn\'t save the card: ' + (e && e.message || e), true); }
      });
      if (!fields.isEligible()) return say('Card fields aren\'t available for this PayPal app. Turn on Advanced Credit and Debit Card Payments in the sandbox app.', true);
      var parts = [fields.NameField(), fields.NumberField(), fields.ExpiryField(), fields.CVVField()];
      ['#name', '#number', '#expiry', '#cvv'].forEach(function (sel, i) { parts[i].render(sel); });
      $('save').disabled = false;
      $('save').onclick = function () {
        if (!$('which').value) return say('Choose which card this is first.', true);
        say('Sending the card to PayPal…');
        fields.submit().catch(function (e) { say(serverError || 'Check the card details: ' + (e && e.message || e), true); });
      };
    };
    document.head.appendChild(s);
  });
})();
