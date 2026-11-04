// The demo store: each shop's items, and the card CardBuddy would pay there from the person's wallet.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(x) { return '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function json(r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); }
  function recommend(shop) {
    return fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 100, merchant: shop.name, category: shop.category }) })
      .then(json).catch(function () { return null; });
  }

  Promise.all([fetch('/api/shop').then(json), fetch('/api/config').then(json)]).then(function (res) {
    var shops = res[0], labels = res[1].labels || {};
    return Promise.all(shops.map(recommend)).then(function (picks) {
      $('shops').innerHTML = shops.map(function (s, i) {
        var p = picks[i], fees = [];
        if (s.taxRate) fees.push(Math.round(s.taxRate * 100) + '% tax');
        if (s.delivery) fees.push(money(s.delivery) + ' delivery');
        return '<section class="panel shop" aria-labelledby="shop-' + esc(s.id) + '"><div class="ph"><div><h2 id="shop-' + esc(s.id) + '">' + esc(s.name) + '</h2>' +
          '<p>' + esc(s.about) + ' · ' + esc(labels[s.category] || s.category) + (fees.length ? ' · ' + esc(fees.join(', ')) : '') + '</p></div>' +
          (p ? '<span class="meta">Pays with <b>' + esc(p.best.card) + '</b>, ' + p.best.percentBack + '%</span>' : '') + '</div>' +
          '<table><tbody>' + s.items.map(function (it) {
            return '<tr><td>' + esc(it.name) + '</td><td class="r">' + money(it.price) + '</td></tr>';
          }).join('') + '</tbody></table></section>';
      }).join('');
      if (window.cardbuddyReady) window.cardbuddyReady();
    });
  }).catch(function () {
    $('shops').innerHTML = '<section class="panel"><div class="empty-state"><b>Couldn\'t load the store</b><p>Is CardBuddy running?</p></div></section>';
    if (window.cardbuddyReady) window.cardbuddyReady();
  });
})();
