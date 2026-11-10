(() => {
  const path = location.pathname.split('/').pop() || 'index.html';
  const isHome = path === 'index.html' || path === '';
  const selectedTab = new URLSearchParams(location.search).get('tab') || 'beranda';
  const tabUrl = tab => `index.html?tab=${encodeURIComponent(tab)}`;
  const currentUrl = `${location.pathname.split('/').pop()}${location.search}${location.hash}`;
  const adminLogin = `login.php?admin=1&next=${encodeURIComponent(currentUrl)}`;
  const items = [
    ['index.html', 'fa-house', 'Beranda', 'home'],
    ['registrasi.html', 'fa-user-plus', 'Gabung Event'],
    [tabUrl('history'), 'fa-clock-rotate-left', 'Galeri', 'history'],
    [tabUrl('event'), 'fa-trophy', 'Event', 'event'],
    ['crew.html', 'fa-users', 'Crew'],
    ['hobby.html', 'fa-futbol', 'Hobby'],
    [tabUrl('jadwal'), 'fa-calendar-days', 'Jadwal', 'jadwal'],
    ['tentang-kami.html', 'fa-circle-info', 'Tentang Kami']
  ];
  const sidebar = document.querySelector('.sidebar');
  const list = sidebar?.querySelector('ul');
  if (list) {
    list.innerHTML = items.map(([href, icon, label, tab]) => {
      const active = (isHome && (tab === 'home' ? selectedTab === 'beranda' : selectedTab === tab)) || path === href;
      const tabId = tab === 'home' ? 'beranda' : tab;
      const onclick = isHome && tab ? ` onclick="switchTab('${tabId}', this, true); return false"` : '';
      return `<li class="${list.classList.contains('nav-menu') ? 'nav-item' : ''}"><a class="${list.classList.contains('nav-menu') ? 'nav-link' : ''}${active ? ' active' : ''}" href="${href}"${onclick}><i class="fa-solid ${icon}"></i><span>${label}</span></a></li>`;
    }).join('') + `<li class="admin-login-nav"><a class="${list.classList.contains('nav-menu') ? 'nav-link' : ''}" href="${adminLogin}" title="Login Admin"><i class="fa-solid fa-right-to-bracket"></i><span>Login Admin</span></a></li><li class="admin-logout-nav" hidden><a class="${list.classList.contains('nav-menu') ? 'nav-link' : ''}" href="logout.php?next=${encodeURIComponent(currentUrl)}" title="Keluar Admin"><i class="fa-solid fa-right-from-bracket"></i><span>Keluar Admin</span></a></li>`;
  }
  if (isHome && typeof window.switchTab === 'function') {
    const requestedTab = new URLSearchParams(location.search).get('tab') || 'beranda';
    if (['beranda', 'history', 'event', 'jadwal'].includes(requestedTab)) {
      const target = [...document.querySelectorAll('.nav-link')].find(link => (link.getAttribute('onclick') || '').includes(`switchTab('${requestedTab}'`));
      window.switchTab(requestedTab, target, false);
    }
  }
  fetch(`session.php?_=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json()).then(data => {
    const admin = !!data.is_admin;
    document.body.classList.toggle('is-admin', admin);
    document.querySelectorAll('.admin-login-nav').forEach(el => el.hidden = admin);
    document.querySelectorAll('.admin-logout-nav').forEach(el => el.hidden = !admin);
  }).catch(() => {});
})();
