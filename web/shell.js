// Shared by every page, loaded in <head>. It holds the page body back (at most 400ms) until the page has drawn its data,
// so tables don't pop in and push things down; and it shows the count of held purchases next to Approvals. The last
// count is remembered for this tab, so the menu paints with it instead of shifting when the fetch comes back.
(function () {
  var root = document.documentElement;
  root.classList.add('wait');
  var shown = false;
  window.agentpayReady = function () { if (!shown) { shown = true; root.classList.remove('wait'); } };
  setTimeout(window.agentpayReady, 400);

  function set(n) {
    var badge = document.getElementById('pendingCount');
    if (!badge) return;
    badge.textContent = n ? String(n) : '';
    badge.title = n + ' waiting';
    try { sessionStorage.setItem('agentpay.pending', String(n)); } catch (e) { /* storage blocked: the fetch still fills it */ }
  }
  function refresh() {
    fetch('/api/pending').then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) { set(list.length); })
      .catch(function () {});
  }
  window.agentpayRefreshCount = refresh;
  document.addEventListener('DOMContentLoaded', function () {
    try { var last = Number(sessionStorage.getItem('agentpay.pending')); if (last) set(last); } catch (e) { /* ignore */ }
    refresh();
  });
})();
