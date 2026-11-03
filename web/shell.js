// Shared by every page: the count of held purchases next to Approvals in the menu.
(function () {
  var badge = document.getElementById('pendingCount');
  function refresh() {
    fetch('/api/pending').then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) { badge.textContent = list.length ? String(list.length) : ''; badge.title = list.length + ' waiting'; })
      .catch(function () {});
  }
  window.agentpayRefreshCount = refresh;
  refresh();
})();
