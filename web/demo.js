// "Run the demo agent" on the wallet page: shown only in dry-run mode (the hosted demo). It plays the purchases from
// the video through CardBuddy and lists what happened, with links to the pages that show the rest.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(x) { return '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
    if (!c.dryRun) return;
    $('demo').hidden = false;
    $('runDemo').addEventListener('click', function () {
      var b = $('runDemo');
      b.disabled = true; b.textContent = 'Shopping…';
      fetch('/api/demo/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); })
        .then(function (d) {
          $('demoOut').innerHTML = '<ul>' + d.steps.map(function (s) {
            return '<li><span class="ask">"' + esc(s.ask) + '"</span>' + (s.held
              ? '<span class="demo-held">Held for your approval: ' + esc(s.reasons[0]) + '</span>'
              : '<span>Paid ' + money(s.amount) + ' on <b>' + esc(s.card) + '</b>, earning ' + money(s.earned) + ' (default card: ' + money(s.defaultEarned) + ')</span>') + '</li>';
          }).join('') + '</ul><p class="demo-links"><a href="/approvals">Approve or decline the held ones</a> · <a href="/receipts">See the receipts</a></p>';
          b.textContent = 'Run it again'; b.disabled = false;
          if (window.cardbuddyRefreshCount) window.cardbuddyRefreshCount();
        })
        .catch(function (e) { $('demoOut').innerHTML = '<p class="demo-held">' + esc(e.message) + '</p>'; b.textContent = 'Run the demo agent'; b.disabled = false; });
    });
  }).catch(function () {});
})();
