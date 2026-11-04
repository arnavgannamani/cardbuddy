// Receipts: totals and one row per purchase. Refreshes every few seconds so it updates live during a demo.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(x) { return '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  var labels = {};
  fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) { labels = c.labels || {}; }).catch(function () {}).then(show);

  function show() {
    fetch('/api/receipts').then(function (r) { return r.json(); }).then(function (d) {
      var t = d.totals, last = d.receipts[0];
      $('extra').textContent = '+' + money(t.extra);
      $('extraNote').textContent = t.defaultEarned > 0 ? Math.round(t.extra / t.defaultEarned * 100) + '% more than your default card' : 'compared with your default card';
      $('earned').textContent = money(t.earned);
      $('rate').textContent = t.spent > 0 ? (t.earned / t.spent * 100).toFixed(2) + '% back overall' : '';
      $('def').textContent = money(t.defaultEarned);
      $('defName').textContent = last ? last.defaultCard : '';
      $('spent').textContent = money(t.spent);
      $('count').textContent = t.purchases + (t.purchases === 1 ? ' purchase' : ' purchases');

      $('rows').innerHTML = d.receipts.map(function (r) {
        var when = new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        var paid = r.status === 'paid';
        var fell = r.declined && r.declined.length ? '<span class="fell">' + esc(r.declined.join(', ')) + (paid ? ' declined; this card paid instead' : ' declined') + '</span>' : '';
        var rail = r.betterRail ? '<small>Through ' + esc(r.betterRail.rail === 'paypal' ? 'PayPal' : 'Venmo') + ' the ' + esc(r.betterRail.card) + ' would earn ' + r.betterRail.percentBack + '%</small>' : '';
        var gain = paid && r.earned > r.defaultEarned;
        return '<tr><td class="num">' + esc(when) + '</td>' +
          '<td><b>' + esc(r.description || r.merchant) + '</b>' + (r.dryRun ? '<span class="pill">Dry run</span>' : '') + (paid ? '' : '<span class="pill neg">' + (r.status === 'failed' ? 'Not paid' : esc(r.status)) + '</span>') +
          '<br><small>' + esc(r.site || r.merchant) + ' · ' + esc(labels[r.category] || r.category) + '</small></td>' +
          '<td>' + esc(r.card) + '<br><small>' + r.percentBack + '% back, ' + esc(String(r.why).toLowerCase()) + '</small>' + fell + rail + '</td>' +
          '<td class="r">' + money(r.amount) + '</td>' +
          '<td class="r">' + (paid ? '<span class="' + (gain ? 'extra' : '') + '">' + money(r.earned) + '</span>' : '<small>–</small>') + '</td>' +
          '<td class="r"><span class="muted">' + (paid ? money(r.defaultEarned) : '–') + '</span></td></tr>';
      }).join('') || '<tr><td colspan="6" class="empty">No purchases yet. When your agent pays for something, it shows up here with the card it used.</td></tr>';
      if (window.cardbuddyReady) window.cardbuddyReady();
    }).catch(function () {
      $('rows').innerHTML = '<tr><td colspan="6" class="empty">Couldn\'t reach CardBuddy. Is the server running?</td></tr>';
    });
  }
  setInterval(show, 4000);
})();
