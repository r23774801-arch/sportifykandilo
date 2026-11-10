(() => {
  const sidebar = document.querySelector('.sidebar');
  const header = document.querySelector('.top-header, .top');
  if (!sidebar || !header) return;
  const mobile = window.matchMedia('(max-width: 900px)');
  sidebar.id = sidebar.id || 'site-navigation';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-controls', sidebar.id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  header.prepend(toggle);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nav-close';
  close.setAttribute('aria-label', 'Tutup menu');
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
  sidebar.prepend(close);
  const backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.append(backdrop);
  let desktopCollapsed = false;
  try { desktopCollapsed = localStorage.getItem('kdm-sidebar-collapsed') === '1'; } catch (_) {}
  sidebar.querySelectorAll('.nav a, .nav-link').forEach(link => {
    const label = link.textContent.trim();
    if (label) { link.setAttribute('aria-label', label); link.title = label; }
    if (!link.hasAttribute('href')) {
      link.tabIndex = 0;
      link.setAttribute('role', 'button');
      link.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); link.click(); }
      });
    }
  });
  const sync = () => {
    const open = mobile.matches ? document.body.classList.contains('nav-open') : !desktopCollapsed;
    document.body.classList.toggle('nav-collapsed', !mobile.matches && desktopCollapsed);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', mobile.matches ? (open ? 'Tutup menu navigasi' : 'Buka menu navigasi') : (open ? 'Ringkas menu navigasi' : 'Perluas menu navigasi'));
    sidebar.inert = mobile.matches && !open;
    document.querySelector('.main, .main-container').inert = mobile.matches && open;
  };
  const dismiss = () => { document.body.classList.remove('nav-open'); sync(); toggle.focus(); };
  toggle.addEventListener('click', () => {
    if (mobile.matches) document.body.classList.toggle('nav-open');
    else {
      desktopCollapsed = !desktopCollapsed;
      try { localStorage.setItem('kdm-sidebar-collapsed', desktopCollapsed ? '1' : '0'); } catch (_) {}
    }
    sync();
    if (mobile.matches && document.body.classList.contains('nav-open')) close.focus();
  });
  close.addEventListener('click', dismiss);
  backdrop.addEventListener('click', dismiss);
  sidebar.addEventListener('click', event => { if (mobile.matches && event.target.closest('a,.nav-link')) dismiss(); });
  document.addEventListener('keydown', event => {
    if (!mobile.matches || !document.body.classList.contains('nav-open')) return;
    if (event.key === 'Escape') dismiss();
    if (event.key === 'Tab') {
      const items = [...sidebar.querySelectorAll('a[href],button,[tabindex="0"],input,select')].filter(el => !el.disabled && el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  mobile.addEventListener('change', () => { document.body.classList.remove('nav-open'); sync(); });
  sync();
})();
