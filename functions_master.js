/**
 * SPORTIFY KANDILO - MASTER JAVASCRIPT FUNCTIONS
 */

let usersCache = [];
let eventsCache = [];
let homeCarouselTimer = null;
let homeCarouselIndex = 0;
let currentUser = null;
let currentIsAdmin = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error("Response server bukan JSON valid.");
  }

  if (!response.ok || data?.status === "error") {
    throw new Error(data?.message || "Request gagal.");
  }

  return data;
}

async function requireSession() {
  try {
    const response = await fetch("session.php?_=" + Date.now(), { cache: "no-store", credentials: "same-origin" });
    if (response.ok) {
      const session = await response.json();
      currentUser = session.user || null;
      currentIsAdmin = Boolean(session.is_admin);
    } else {
      // Website publik: pengunjung tidak perlu login.
      currentUser = null;
      currentIsAdmin = false;
    }
  } catch (err) {
    // Tetap izinkan pengunjung masuk meskipun session endpoint gagal.
    currentUser = null;
    currentIsAdmin = false;
  }

  applyPermissions();
  const displayName = currentUser?.nama_lengkap || "Pengunjung";
  const welcomeName = document.getElementById("welcome-name");
  const headerName = document.getElementById("header-user-name");
  if (welcomeName) welcomeName.textContent = displayName;
  if (headerName) headerName.textContent = displayName;
}

function applyPermissions() {
  document.body.classList.toggle("is-admin", currentIsAdmin);
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !currentIsAdmin;
    element.style.display = currentIsAdmin ? "" : "none";
  });
}

function switchTab(pageId, element) {
  // Tampilkan loading logo setiap kali berpindah tab (termasuk Event dan History).
  const pageLoader = document.getElementById("sportify-page-loader");
  if (pageLoader) {
    pageLoader.classList.remove("hide");
    clearTimeout(window.__sportifyTabLoaderTimer);
    window.__sportifyTabLoaderTimer = setTimeout(() => pageLoader.classList.add("hide"), 450);
  }

  document.querySelectorAll(".page-view").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.remove("active"));

  const selectedPage = document.getElementById("page-" + pageId);
  if (selectedPage) selectedPage.classList.add("active");

  // Ikon Login Admin hanya ditampilkan pada halaman Galery/detail galeri.
  const adminLoginIcon = document.getElementById("headerAdminLogin");
  if (adminLoginIcon) {
    adminLoginIcon.hidden = !["history", "event-detail"].includes(pageId);
  }

  const activeLink = element || window.event?.currentTarget;
  if (activeLink) activeLink.classList.add("active");

  // Jadwal selalu dirender ulang dari data event terbaru saat halaman dibuka.
  // Ini mencegah daftar jadwal hilang setelah berpindah halaman.
  if (pageId === "jadwal") {
    renderScheduleLoading();
    loadEvents({ scheduleOnly: true });
  }

  // Crew: tampilkan data crew yang sudah terdaftar/disetujui.
  if (pageId === "crew") {
    loadUsers();
  }
}

function showPage(pageId) {
  document.querySelectorAll(".page-view").forEach((page) => page.classList.remove("active"));
  const selectedPage = document.getElementById("page-" + pageId);
  if (selectedPage) selectedPage.classList.add("active");

  // Ikon Login Admin hanya tampil di Galery dan detail galeri.
  const adminLoginIcon = document.getElementById("headerAdminLogin");
  if (adminLoginIcon) {
    adminLoginIcon.hidden = !["history", "event-detail"].includes(pageId);
  }
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const safeType = ["success", "danger", "info"].includes(type) ? type : "info";
  const icon = safeType === "success" ? "check-circle" : safeType === "danger" ? "circle-xmark" : "info-circle";

  toast.className = `toast toast-${safeType}`;
  toast.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openModal(title, bodyHTML, onConfirm) {
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modal = document.getElementById("custom-modal");
  const submitBtn = document.getElementById("modal-submit-btn");

  if (!modalTitle || !modalBody || !modal || !submitBtn) return;

  modalTitle.innerText = title;
  modalBody.innerHTML = bodyHTML;
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
  modalBody.scrollTop = 0;
  submitBtn.onclick = onConfirm;
}

function closeModal() {
  document.getElementById("custom-modal")?.classList.remove("show");
  document.body.style.overflow = "";
}

function renderEmptyRow(tbody, colspan, message) {
  tbody.innerHTML = `
    <tr>
      <td colspan="${colspan}" style="text-align:center; color: var(--text-muted); padding: 30px;">
        <i class="fa-solid fa-inbox" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
        ${escapeHtml(message)}
      </td>
    </tr>
  `;
}

function formatCreatedAt(value) {
  return value ? formatEventDate(value) : "-";
}

let crewPage = 1;
const crewPageSize = 9;
let crewFiltered = [];

function crewInitials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase() || "?";
}

function renderCrew(users) {
  const container = document.getElementById("crew-list");
  if (!container) return;
  const crewUsers = (users || []).filter(user => String(user.role || "").toLowerCase() === "user");
  crewFiltered = crewUsers;
  crewPage = 1;
  const total = document.getElementById("crew-total-count");
  if (total) total.textContent = crewUsers.length;
  const datalist = document.getElementById("crew-name-options");
  if (datalist) datalist.innerHTML = crewUsers.map(u => `<option value="${escapeHtml(u.nama_lengkap)}"></option>`).join("");
  renderCrewPage();
}

function renderCrewPage() {
  const container = document.getElementById("crew-list");
  if (!container) return;
  const start = (crewPage - 1) * crewPageSize;
  const items = crewFiltered.slice(start, start + crewPageSize);
  if (!items.length) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:35px;color:var(--text-muted)"><i class="fa-solid fa-users" style="font-size:34px;margin-bottom:10px"></i><div>Belum ada anggota crew.</div></div>`;
    return;
  }
  container.innerHTML = items.map(user => {
    const initials = crewInitials(user.nama_lengkap);
    return `<article class="crew-member" onclick="showCrewProfile(${Number(user.id)})">
      <div class="crew-member-avatar"><span>${escapeHtml(initials)}</span></div>
      <div class="crew-member-info"><strong>${escapeHtml(user.nama_lengkap)}</strong><span>${escapeHtml(user.email || "Crew Sportify Kandilo")}</span></div>
      <i class="fa-solid fa-chevron-right" style="color:#94a3b8;font-size:12px"></i>
    </article>`;
  }).join("");
}

function filterCrewDirectory(value) {
  const q = String(value || "").trim().toLowerCase();
  const base = (usersCache || []).filter(user => String(user.role || "").toLowerCase() === "user");
  crewFiltered = q ? base.filter(user => `${user.nama_lengkap || ""} ${user.email || ""}`.toLowerCase().includes(q)) : base;
  crewPage = 1;
  renderCrewPage();
}
function crewPrevPage(){ if(crewPage>1){crewPage--;renderCrewPage();} }
function crewNextPage(){ const max=Math.max(1,Math.ceil(crewFiltered.length/crewPageSize)); if(crewPage<max){crewPage++;renderCrewPage();} }
function crewLastPage(){ crewPage=Math.max(1,Math.ceil(crewFiltered.length/crewPageSize)); renderCrewPage(); }

function showCrewProfile(id) {
  const user = usersCache.find(u => Number(u.id) === Number(id));
  if (!user) return showToast("Data crew tidak ditemukan.", "danger");
  const initials = crewInitials(user.nama_lengkap);
  openModal("Profil Crew", `<div class="crew-modal-content">
    <div class="crew-profile-head"><div class="crew-profile-avatar">${escapeHtml(initials)}</div><div><h3>${escapeHtml(user.nama_lengkap)}</h3><p style="color:var(--text-muted);font-size:13px">${escapeHtml(user.email || "-")}</p></div></div>
    <div class="form-group"><label>Nama Lengkap</label><input class="form-control" value="${escapeHtml(user.nama_lengkap)}" disabled></div>
    <div class="form-group"><label>Email</label><input class="form-control" value="${escapeHtml(user.email)}" disabled></div>
    <div class="form-group"><label>Role</label><input class="form-control" value="${escapeHtml(user.role || "User")}" disabled></div>
    <h3 style="margin:22px 0 8px">History Event Lari</h3><div id="crew-profile-history" class="crew-history-list"><small style="color:var(--text-muted)">Memuat riwayat...</small></div>
  </div>`, closeModal);
  loadCrewHistoryForProfile(user);
}

async function loadCrewHistoryForProfile(user) {
  const el=document.getElementById("crew-profile-history"); if(!el)return;
  const events=Array.isArray(eventsCache)?eventsCache:[];
  const done=events.filter(e=>String(e.status||"").toLowerCase()==="selesai");
  if(!done.length){el.innerHTML='<small style="color:var(--text-muted)">Belum ada riwayat event.</small>';return;}
  el.innerHTML=done.slice(0,10).map(e=>`<div class="crew-history-item"><div><strong>${escapeHtml(e.nama_event||"Event")}</strong><small>${escapeHtml(formatEventDate(e.tanggal_pelaksanaan))} • ${escapeHtml(e.cabang_olahraga||"Event")}</small></div><span class="badge badge-blue">Selesai</span></div>`).join("");
}

function openCrewIdentify(){ document.getElementById("crew-identify-name")?.focus(); }
function clearCrewIdentify(){ ["crew-identify-name","crew-identify-email"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";}); }
function verifyCrewIdentity(){
  const name=(document.getElementById("crew-identify-name")?.value||"").trim().toLowerCase();
  const email=(document.getElementById("crew-identify-email")?.value||"").trim().toLowerCase();
  if(name.length<3 || !email) return showToast("Nama dan email verifikasi wajib diisi.","danger");
  const user=(usersCache||[]).find(u=>String(u.nama_lengkap||"").toLowerCase()===name && String(u.email||"").toLowerCase()===email);
  if(!user) return showToast("Data tidak cocok. Periksa nama dan email yang terdaftar.","danger");
  showToast("Identitas berhasil diverifikasi.","success");
  showCrewProfile(user.id);
}
function openCrewProfileEditor(){
  if(!currentUser) return;
  editUser(currentUser.id);
}
function openCrewHistory(){
  const done=(eventsCache||[]).filter(e=>String(e.status||"").toLowerCase()==="selesai");
  openModal("History Event Lari", `<div class="crew-modal-content"><div class="crew-history-list">${done.length?done.map(e=>`<div class="crew-history-item"><div><strong>${escapeHtml(e.nama_event||"Event")}</strong><small>${escapeHtml(formatEventDate(e.tanggal_pelaksanaan))} • ${escapeHtml(e.cabang_olahraga||"Event")} • ${escapeHtml(e.lokasi||"-")}</small></div><span class="badge badge-blue">Selesai</span></div>`).join(""):'<small style="color:var(--text-muted)">Belum ada riwayat event.</small>'}</div></div>`, closeModal);
}
function toggleCrewAudio(){
  const icon=document.getElementById("crew-audio-icon");
  if(!icon)return;
  icon.classList.toggle("fa-volume-high"); icon.classList.toggle("fa-volume-xmark");
  showToast(icon.classList.contains("fa-volume-xmark")?"Audio dimatikan.":"Audio diaktifkan.","info");
}

function getEventStatus(event) {
  return String(event.status || "Buka");
}

function formatEventDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "-";
}

function normalizeTime(value) {
  return String(value || "09:00").slice(0, 5);
}

function createEventCard(event, options = {}) {
  const status = getEventStatus(event);
  const formattedDate = formatEventDate(event.tanggal_pelaksanaan);
  const time = event.jam_pelaksanaan ? `, ${escapeHtml(normalizeTime(event.jam_pelaksanaan))}` : "";
  const showFinish = currentIsAdmin && options.showFinish && status.toLowerCase() !== "selesai";
  const isFinished = status.toLowerCase() === "selesai";
  const showEdit = currentIsAdmin;
  const showUploadPhoto = isFinished;
  const showDelete = currentIsAdmin;
  const coverPhoto = event.foto_event || getEventPhotos(event)[0];

  const card = document.createElement("div");
  card.className = "event-card";
  card.innerHTML = `
    ${coverPhoto
      ? `<button type="button" class="photo-preview-button" data-photo-path="${escapeHtml(coverPhoto)}" aria-label="Lihat foto ${escapeHtml(event.nama_event)}"><img class="event-photo" src="${escapeHtml(coverPhoto)}" alt="${escapeHtml(event.nama_event)}"></button>
         <a class="btn btn-outline photo-download-link" href="${escapeHtml(coverPhoto)}" download><i class="fa-solid fa-download"></i> Download Foto</a>`
      : `<div class="event-photo-placeholder"><i class="fa-solid fa-image"></i></div>`}
    <div class="event-header">
      <div>
        <h4 style="font-size: 15px;">${escapeHtml(event.nama_event)}</h4>
      </div>
    </div>
    <div class="event-body">
      <div class="event-meta">
        <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(formattedDate)}${time}</span>
        <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(event.lokasi || "GOR Kandilo")}</span>
        <span><i class="fa-solid fa-user"></i> Dibuat oleh: ${escapeHtml(event.pembuat || "Admin")}</span>
      </div>
      <span class="badge ${status.toLowerCase() === "selesai" ? "badge-success" : "badge-warning"}">${escapeHtml(status)}</span>
      <div class="event-card-actions">
        ${showFinish ? `<button class="btn btn-blue" onclick="finishEvent(${Number(event.id)})">Selesai</button>` : ""}
        ${showEdit ? `<button class="btn btn-outline" onclick="editEvent(${Number(event.id)})">Edit</button>` : ""}
        ${showUploadPhoto ? `<button class="btn btn-blue" onclick="uploadEventPhotos(${Number(event.id)})"><i class="fa-solid fa-camera"></i> Tambah Foto</button>` : ""}
        ${showDelete ? `<button class="btn btn-outline" onclick="deleteEvent(${Number(event.id)})" style="color:#ef4444;border-color:#fecaca;"><i class="fa-solid fa-trash"></i> Hapus</button>` : ""}
        <button class="btn btn-outline" onclick="copyEventLink(${Number(event.id)})"><i class="fa-solid fa-link"></i> Link</button>
        <button class="btn btn-primary" onclick="showEventDetail(${Number(event.id)})">Detail</button>
      </div>
    </div>
  `;

  bindPhotoPreviews(card, event);
  return card;
}

function bindPhotoPreviews(container, event) {
  container.querySelectorAll('.photo-preview-button').forEach(button => {
    button.addEventListener('click', () => {
      const photo = button.dataset.photoPath;
      if (container.id === 'event-detail-content') setDetailHeroPhoto(photo);
      openEventPhotoViewer(photo, event.nama_event, event.id);
    });
  });
}

function getEventPhotos(event) {
  return Array.isArray(event.photos) && event.photos.length > 0
    ? event.photos
    : (event.foto_event ? [event.foto_event] : []);
}

function renderHomeCarousel(events) {
  const carousel = document.getElementById("home-carousel");
  if (!carousel) return;

  if (homeCarouselTimer) {
    clearInterval(homeCarouselTimer);
    homeCarouselTimer = null;
  }

  const slides = events
    .map((event) => ({ event, photos: getEventPhotos(event) }))
    .filter((item) => item.photos.length > 0)
    .flatMap((item) => item.photos.map((photo) => ({ event: item.event, photo })));

  if (slides.length === 0) {
    carousel.innerHTML = `
      <div class="home-carousel-content">
        <span class="badge badge-warning" style="width: fit-content; margin-bottom: 14px;">Sportify Kandilo</span>
        <h3>EVENT KANDILO</h3>
        <p>Foto dan cerita event akan tampil bergantian di sini setelah acara ditambahkan.</p>
        ${currentIsAdmin ? `<button class="btn btn-primary" onclick="switchTab('event', document.querySelector('[onclick*=event]'))">
          <i class="fa-solid fa-plus"></i> Buat Acara Baru
        </button>` : ""}
      </div>
      <div class="home-visual">
        <div class="home-visual-frame event-photo-placeholder"><i class="fa-solid fa-image"></i></div>
      </div>
    `;
    return;
  }

  homeCarouselIndex = 0;
  carousel.innerHTML = `
    <div class="home-carousel-content">
      <span id="home-carousel-badge" class="badge badge-warning" style="width: fit-content; margin-bottom: 12px;">${escapeHtml(slides[0].event.cabang_olahraga)}</span>
      <h3 id="home-carousel-title">${escapeHtml(slides[0].event.nama_event)}</h3>
      <p id="home-carousel-text">${escapeHtml(formatEventDate(slides[0].event.tanggal_pelaksanaan))} • ${escapeHtml(normalizeTime(slides[0].event.jam_pelaksanaan))} • ${escapeHtml(slides[0].event.lokasi || "GOR Kandilo")}</p>
      <button class="btn btn-primary" onclick="showEventDetail(${Number(slides[0].event.id)})">
        <i class="fa-solid fa-images"></i> Lihat Rekapan
      </button>
    </div>
    <div class="home-visual">
      <div class="home-visual-frame">
        <img id="home-carousel-image" class="home-carousel-image" src="${escapeHtml(slides[0].photo)}" alt="${escapeHtml(slides[0].event.nama_event)}" title="Klik foto untuk efek bounce">
      </div>
    </div>
    <div class="carousel-dots">
      ${slides.slice(0, 8).map((_, index) => `<span class="carousel-dot ${index === 0 ? "active" : ""}"></span>`).join("")}
    </div>
  `;

  const setSlide = (nextIndex) => {
    homeCarouselIndex = nextIndex % slides.length;
    const current = slides[homeCarouselIndex];
    const image = document.getElementById("home-carousel-image");
    const content = carousel.querySelector(".home-carousel-content");
    const dots = carousel.querySelectorAll(".carousel-dot");
    const badge = document.getElementById("home-carousel-badge");
    const title = document.getElementById("home-carousel-title");
    const text = document.getElementById("home-carousel-text");
const button = carousel.querySelector(".home-carousel-content .btn");

    const finishTransition = () => {
      if (!image) return;
      image.classList.remove("is-changing");
      image.classList.add("is-entering");
      setTimeout(() => image.classList.remove("is-entering"), 900);
    };

    if (image) {
      image.classList.remove("is-entering");
      image.classList.add("is-changing");
    }
    if (content) {
      content.classList.remove("is-entering");
      content.classList.add("is-changing");
    }

    setTimeout(() => {
      if (image) {
        image.src = current.photo;
        image.alt = current.event.nama_event || "Event Kandilo";
        image.title = "Klik foto untuk efek bounce";
        image.addEventListener("load", finishTransition, { once: true });
        if (image.complete) finishTransition();
      }
      dots.forEach((dot, index) => dot.classList.toggle("active", index === homeCarouselIndex % dots.length));
      if (badge) badge.textContent = current.event.cabang_olahraga || "Event";
      if (title) title.textContent = current.event.nama_event || "Event Kandilo";
      if (text) {
        text.textContent = `${formatEventDate(current.event.tanggal_pelaksanaan)} • ${normalizeTime(current.event.jam_pelaksanaan)} • ${current.event.lokasi || "GOR Kandilo"}`;
      }
if (button) button.setAttribute("onclick", `showEventDetail(${Number(current.event.id)})`);
      if (content) {
        content.classList.remove("is-changing");
        content.classList.add("is-entering");
        setTimeout(() => content.classList.remove("is-entering"), 760);
      }
    }, 220);
  };

  const imageEl = document.getElementById("home-carousel-image");
  if (imageEl) {
    imageEl.addEventListener("click", () => {
      imageEl.classList.remove("is-bouncing");
      void imageEl.offsetWidth;
      imageEl.classList.add("is-bouncing");
      setTimeout(() => imageEl.classList.remove("is-bouncing"), 820);
    });
  }

  if (slides.length > 1) {
    homeCarouselTimer = setInterval(() => setSlide(homeCarouselIndex + 1), 4000);
  }
}

async function loadUsers() {
  const tbody = document.querySelector("#page-registrasi tbody");
  if (!tbody) return;

  try {
    const users = await fetchJson("api.php?action=get_users");
    usersCache = Array.isArray(users) ? users : [];
    tbody.innerHTML = "";
    renderCrew(usersCache);

    const statTotal = document.getElementById("stat-total-user");
    if (statTotal && Array.isArray(users)) statTotal.innerText = users.length;

    if (!Array.isArray(users) || users.length === 0) {
      renderEmptyRow(tbody, 6, "Belum ada data pengguna di database.");
      return;
    }

    users.forEach((user) => {
      const row = document.createElement("tr");
      const tanggalRegistrasi = formatCreatedAt(user.created_at);

      row.innerHTML = `
        <td><div class="user-avatar"><i class="fa-solid fa-user"></i></div></td>
        <td><b>${escapeHtml(user.nama_lengkap)}</b></td>
        <td>${escapeHtml(user.email)}</td>
        <td><span class="badge badge-blue">${escapeHtml(user.role)}</span></td>
        <td>${escapeHtml(tanggalRegistrasi)}</td>
        <td>
          <button class="btn btn-outline" onclick="editUser(${Number(user.id)})" style="padding: 4px 8px;" title="Edit pengguna">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-outline" onclick="showUserDetail(${Number(user.id)})" style="padding: 4px 8px;" title="Detail pengguna">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn btn-danger" onclick="deleteUser(${Number(user.id)})" style="padding: 4px 8px;" title="Hapus pengguna">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    renderCrew([]);
    renderEmptyRow(tbody, 6, "Gagal memuat data pengguna.");
    showToast(err.message || "Gagal memuat data dari database MySQL!", "danger");
  }
}

function showUserDetail(id) {
  const user = usersCache.find((item) => Number(item.id) === Number(id));
  if (!user) {
    showToast("Data pengguna tidak ditemukan.", "danger");
    return;
  }

  openModal("Detail Pengguna", `
    <div style="text-align: center; margin-bottom: 18px;">
      <div class="crew-avatar"><i class="fa-solid fa-user"></i></div>
      <h3 style="font-size: 18px;">${escapeHtml(user.nama_lengkap)}</h3>
      <span class="badge badge-blue">${escapeHtml(user.role)}</span>
    </div>
    <div class="form-group"><label>Email</label><input class="form-control" value="${escapeHtml(user.email)}" disabled></div>
    <div class="form-group"><label>Tanggal Registrasi</label><input class="form-control" value="${escapeHtml(formatCreatedAt(user.created_at))}" disabled></div>
  `, closeModal);
}

function editUser(id) {
  if (!currentIsAdmin) {
    showToast("Akses edit pengguna hanya untuk admin.", "danger");
    return;
  }

  const user = usersCache.find((item) => Number(item.id) === Number(id));
  if (!user) {
    showToast("Data pengguna tidak ditemukan.", "danger");
    return;
  }

  openModal("Edit Pengguna", `
    <div class="form-group">
      <label>Nama Lengkap</label>
      <input type="text" id="edit-user-name" class="form-control" value="${escapeHtml(user.nama_lengkap)}">
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="edit-user-email" class="form-control" value="${escapeHtml(user.email)}">
    </div>
    <div class="form-group">
      <label>Password Baru (Opsional)</label>
      <input type="password" id="edit-user-password" class="form-control" placeholder="Kosongkan jika tidak diganti">
    </div>
    <div class="form-group">
      <label>Role / Jabatan</label>
      <select id="edit-user-role" class="form-control">
        ${["Admin", "User"].map((role) => `
          <option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>
        `).join("")}
      </select>
    </div>
  `, async function () {
    const nama = document.getElementById("edit-user-name").value.trim();
    const email = document.getElementById("edit-user-email").value.trim();
    const password = document.getElementById("edit-user-password").value;
    const role = document.getElementById("edit-user-role").value;

    if (!nama || !email) {
      showToast("Nama dan email wajib diisi.", "danger");
      return;
    }

    try {
      const result = await fetchJson("api.php?action=update_user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, nama, email, role, password }),
      });
      closeModal();
      showToast(result.message || "Pengguna berhasil diupdate.", "success");
      loadUsers();
    } catch (err) {
      showToast(err.message || "Gagal mengupdate pengguna.", "danger");
    }
  });
}

async function deleteUser(id) {
  if (!currentIsAdmin) {
    showToast("Akses hapus pengguna hanya untuk admin.", "danger");
    return;
  }

  if (!id || !confirm("Apakah Anda yakin ingin menghapus pengguna ini?")) return;

  try {
    const result = await fetchJson("api.php?action=delete_user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    showToast(result.message || "Pengguna berhasil dihapus", "danger");
    loadUsers();
  } catch (err) {
    showToast(err.message || "Terjadi kesalahan koneksi!", "danger");
  }
}

async function finishEvent(id) {
  if (!currentIsAdmin) {
    showToast("Hanya admin yang bisa menyelesaikan event.", "danger");
    return;
  }

  if (!id || !confirm("Tandai event ini sebagai selesai dan pindahkan ke History?")) return;

  try {
    const result = await fetchJson("events.php?action=finish_event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    showToast(result.message || "Event berhasil dipindahkan ke History", "success");
    await loadEvents();
    const updatedEvent = eventsCache.find((item) => Number(item.id) === Number(id));
    if (updatedEvent && document.getElementById("page-event-detail")?.classList.contains("active")) {
      renderEventDetailPage(updatedEvent);
    }
  } catch (err) {
    showToast(err.message || "Gagal mengubah status event.", "danger");
  }
}

async function deleteEvent(id) {
  if (!currentIsAdmin) {
    showToast("Akses hapus event hanya untuk admin.", "danger");
    return;
  }

  const event = eventsCache.find((item) => Number(item.id) === Number(id));
  if (!event) {
    showToast("Data event tidak ditemukan.", "danger");
    return;
  }

  const confirmed = confirm(
    `Hapus event "${event.nama_event || "Event"}"?\n\nData event, foto dokumentasi, dan struktur Crew untuk event ini akan ikut dihapus dan tidak dapat dikembalikan.`
  );
  if (!confirmed) return;

  try {
    const result = await fetchJson("events.php?action=delete_event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    showToast(result.message || "Event berhasil dihapus.", "success");
    await loadEvents();

    if (document.getElementById("page-event-detail")?.classList.contains("active")) {
      switchTab("event", document.querySelector('[onclick*=event]'));
    }
  } catch (err) {
    showToast(err.message || "Gagal menghapus event.", "danger");
  }
}

function getEventShareUrl(id) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("event_id", String(id));
  return url.toString();
}

async function copyEventLink(id) {
  const event = eventsCache.find((item) => Number(item.id) === Number(id));
  if (!event) {
    showToast("Data event tidak ditemukan.", "danger");
    return;
  }

  const link = getEventShareUrl(id);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link);
    } else {
      const temp = document.createElement("textarea");
      temp.value = link;
      temp.style.position = "fixed";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    showToast("Link event berhasil disalin.", "success");
  } catch (err) {
    showToast("Gagal menyalin link. Link: " + link, "danger");
  }
}

function openEventLink(id) {
  window.location.href = getEventShareUrl(id);
}

function showEventDetail(id) {
  const event = eventsCache.find((item) => Number(item.id) === Number(id));
  if (!event) {
    showToast("Data event tidak ditemukan.", "danger");
    return;
  }

  renderEventDetailPage(event);
  showPage("event-detail");
}

function setDetailHeroPhoto(photoPath) {
  const heroImage = document.getElementById("detail-hero-image");
  if (!heroImage) return;
  heroImage.src = photoPath;

  document.querySelectorAll(".detail-gallery img").forEach((image) => {
    image.classList.toggle("active", image.getAttribute("src") === photoPath);
  });
}

function renderEventDetailPage(event) {
  const container = document.getElementById("event-detail-content");
  if (!container) return;

  const photos = Array.isArray(event.photos) && event.photos.length > 0
    ? event.photos
    : (event.foto_event ? [event.foto_event] : []);
  const cover = photos[0] || event.foto_event || "";
  const status = getEventStatus(event);
  const isFinished = status.toLowerCase() === "selesai";

  container.innerHTML = `
    <div class="detail-hero">
      ${cover ? `<img id="detail-hero-image" src="${escapeHtml(cover)}" alt="${escapeHtml(event.nama_event)}">` : ""}
      <div class="detail-hero-content">
        <span class="badge ${isFinished ? "badge-success" : "badge-warning"}">${escapeHtml(status)}</span>
        <h2>${escapeHtml(event.nama_event)}</h2>
        <p style="opacity: 0.92;">${escapeHtml(formatEventDate(event.tanggal_pelaksanaan))} • ${escapeHtml(normalizeTime(event.jam_pelaksanaan))}</p>
      </div>
    </div>

    <div class="card" style="margin-top:18px;">
      <label for="event-share-url" class="event-share-label"><i class="fa-solid fa-link"></i> Link Event</label>
      <div class="event-share-row">
        <input id="event-share-url" type="text" class="form-control" value="${escapeHtml(getEventShareUrl(event.id))}" readonly onclick="this.select()">
        <button type="button" class="btn btn-primary event-share-copy" onclick="copyEventLink(${Number(event.id)})"><i class="fa-solid fa-copy"></i> Salin Link</button>
      </div>
      <p style="margin:8px 0 0;color:var(--text-muted);font-size:12px;">Bagikan link ini agar orang lain bisa langsung membuka detail event ini.</p>
    </div>

    <div class="detail-layout">
      <div>
        <div class="card">
          <h3 style="font-size: 18px; margin-bottom: 14px;">Galeri Rekapan</h3>
          <div class="detail-gallery">
            ${photos.length > 0
              ? photos.map((photo, index) => {
                  return `<div class="detail-photo-item">
                    <button type="button" class="photo-preview-button" data-photo-path="${escapeHtml(photo)}" aria-label="Lihat foto ${index + 1} ${escapeHtml(event.nama_event)}"><img class="${index === 0 ? "active" : ""}" src="${escapeHtml(photo)}" alt="${escapeHtml(event.nama_event)}"></button>
                    <a class="btn btn-outline photo-download-link" href="${escapeHtml(photo)}" download><i class="fa-solid fa-download"></i> Download Foto</a>
                    ${currentIsAdmin ? `<button type="button" class="detail-photo-delete" title="Hapus foto ini" aria-label="Hapus foto ini" data-event-id="${Number(event.id)}" data-photo-path="${escapeHtml(String(photo))}"><i class="fa-solid fa-trash"></i></button>` : ""}
                  </div>`;
                }).join("")
              : `<div class="detail-gallery-placeholder"><i class="fa-solid fa-image"></i></div>`}
          </div>
        </div>
      </div>

      <aside>
        <div class="card">
          <h3 style="font-size: 18px; margin-bottom: 14px;">Informasi Event</h3>
          <div class="info-list">
            <div class="info-item"><i class="fa-regular fa-calendar"></i><div><b>Tanggal</b><br><span style="color: var(--text-muted);">${escapeHtml(formatEventDate(event.tanggal_pelaksanaan))}</span></div></div>
            <div class="info-item"><i class="fa-regular fa-clock"></i><div><b>Jam</b><br><span style="color: var(--text-muted);">${escapeHtml(normalizeTime(event.jam_pelaksanaan))}</span></div></div>
            <div class="info-item"><i class="fa-solid fa-location-dot"></i><div><b>Lokasi</b><br><span style="color: var(--text-muted);">${escapeHtml(event.lokasi || "GOR Kandilo")}</span></div></div>
            <div class="info-item"><i class="fa-solid fa-user"></i><div><b>Pembuat</b><br><span style="color: var(--text-muted);">${escapeHtml(event.pembuat || "Admin")}</span></div></div>
          </div>
        </div>
      </aside>
    </div>

    <div class="card event-participants-card" style="margin-top: 18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;">
        <div>
          <h3 style="font-size:18px;margin:0 0 4px;">Peserta yang Disetujui</h3>
          <p style="margin:0;color:var(--text-muted);font-size:13px;">Nama peserta akan muncul setelah pendaftarannya disetujui oleh Admin.</p>
        </div>
        <span id="event-participant-count" class="badge badge-warning">Memuat...</span>
      </div>
      <div id="event-participants-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
        <div style="color:var(--text-muted);padding:18px 0;">Memuat peserta...</div>
      </div>
    </div>
  `;

  bindPhotoPreviews(container, event);
  loadEventParticipants(event.id);
}

function openEventPhotoViewer(photoPath, eventName, eventId) {
  const existing = document.getElementById("event-photo-viewer");
  if (existing) closeEventPhotoViewer();

  const overlay = document.createElement("dialog");
  overlay.id = "event-photo-viewer";
  overlay.className = "event-photo-viewer";
  overlay.setAttribute('aria-label', `Foto ${eventName || 'Event'}`);
  overlay.previousOverflow = document.body.style.overflow;
  overlay.innerHTML = `
    <div class="event-photo-viewer-inner">
      <button type="button" class="event-photo-viewer-close" aria-label="Tutup" onclick="closeEventPhotoViewer()">&times;</button>
      <img class="event-photo-viewer-image" src="${escapeHtml(photoPath)}" alt="${escapeHtml(eventName || "Foto Event")}">
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
        <a class="btn btn-primary event-photo-download" href="${escapeHtml(photoPath)}" download>
          <i class="fa-solid fa-download"></i> Download Foto
        </a>
        ${currentIsAdmin ? `<button type="button" class="btn btn-outline event-photo-delete-viewer" style="color:#ef4444;border-color:#fecaca;">
          <i class="fa-solid fa-trash"></i> Hapus Foto
        </button>` : ""}
      </div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeEventPhotoViewer();
  });
  overlay.addEventListener('cancel', event => { event.preventDefault(); closeEventPhotoViewer(); });
  overlay.querySelector('.event-photo-delete-viewer')?.addEventListener('click', function () {
    deleteEventPhoto(this, Number(eventId || 0), photoPath);
  });
  const previousFocus = document.activeElement;
  overlay.restoreFocus = () => previousFocus?.focus();
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); closeEventPhotoViewer(); }
    if (event.key === 'Tab') {
      const controls = [...overlay.querySelectorAll('button,a[href]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.body.appendChild(overlay);
  overlay.showModal();
  overlay.querySelector('.event-photo-viewer-close').focus();
  document.body.style.overflow = "hidden";
}

function closeEventPhotoViewer() {
  const overlay = document.getElementById("event-photo-viewer");
  if (!overlay) return;
  overlay.close();
  overlay?.remove();
  overlay?.restoreFocus?.();
  document.body.style.overflow = overlay.previousOverflow;
}

async function loadEventParticipants(eventId) {
  const list = document.getElementById("event-participants-list");
  const count = document.getElementById("event-participant-count");
  if (!list) return;
  try {
    const response = await fetch(`api.php?action=get_event_participants&event_id=${encodeURIComponent(eventId)}&_=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.status === "error") throw new Error(data.message || "Peserta gagal dimuat.");

    if (count) count.textContent = `${data.length} Peserta`;
    if (!data.length) {
      list.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:22px;border:1px dashed #d9dee8;border-radius:12px;">Belum ada peserta yang disetujui untuk event ini.</div>`;
      return;
    }

    list.innerHTML = data.map((participant, index) => {
      const photo = participant.foto_path ? escapeHtml(participant.foto_path) : "";
      const name = escapeHtml(participant.nama_lengkap || "Peserta");
      const alias = participant.alias_nama ? escapeHtml(participant.alias_nama) : "";
      const photoButton = photo
        ? `<button type="button" onclick="showParticipantEventHistory(${Number(participant.id)})" title="Lihat event yang pernah diikuti" aria-label="Lihat event yang pernah diikuti ${name}" style="border:0;background:transparent;padding:0;cursor:pointer;border-radius:50%;flex:0 0 auto;">
            <img src="${photo}" alt="${name}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #f2b100;display:block;transition:transform .18s ease;">
          </button>`
        : `<button type="button" onclick="showParticipantEventHistory(${Number(participant.id)})" title="Lihat event yang pernah diikuti" aria-label="Lihat event yang pernah diikuti ${name}" style="width:52px;height:52px;border-radius:50%;border:0;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-weight:700;color:#374151;cursor:pointer;flex:0 0 auto;">${escapeHtml((participant.nama_lengkap || "P").trim().charAt(0).toUpperCase())}</button>`;
      return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
        ${photoButton}
        <div style="min-width:0;">
          <div style="font-weight:700;color:#111827;">${name}</div>
          ${alias ? `<div style="font-size:12px;color:var(--text-muted);">${alias}</div>` : `<div style="font-size:12px;color:#16a34a;">Peserta disetujui</div>`}
          <div style="font-size:11px;color:#667085;margin-top:3px;">Klik foto untuk melihat riwayat event</div>
        </div>
      </div>`;
    }).join("");
  } catch (error) {
    if (count) count.textContent = "-";
    list.innerHTML = `<div style="grid-column:1/-1;color:#dc2626;padding:16px;">Gagal memuat peserta: ${escapeHtml(error.message || "Terjadi kesalahan")}</div>`;
  }
}

async function showParticipantEventHistory(registrationId) {
  const existing = document.getElementById("participant-event-history-modal");
  if (existing) existing.remove();

  const modal = document.createElement("dialog");
  modal.id = "participant-event-history-modal";
  modal.style.cssText = "border:0;border-radius:18px;padding:0;width:min(620px,calc(100vw - 28px));max-height:82vh;box-shadow:0 24px 70px rgba(15,23,42,.25);overflow:hidden;";
  modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#111827,#243746);color:#fff;padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div><div style="font-size:11px;color:#ffcf00;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Riwayat Peserta</div><h3 id="participant-history-name" style="margin:4px 0 0;font-size:20px;">Memuat...</h3></div>
      <button type="button" onclick="closeParticipantEventHistory()" aria-label="Tutup" style="width:36px;height:36px;border:0;border-radius:50%;background:#ffffff18;color:#fff;font-size:24px;cursor:pointer;">&times;</button>
    </div>
    <div id="participant-history-body" style="padding:20px;max-height:62vh;overflow:auto;color:#263746;">Memuat event yang pernah diikuti...</div>
  `;
  modal.addEventListener("click", e => { if (e.target === modal) closeParticipantEventHistory(); });
  modal.addEventListener("cancel", e => { e.preventDefault(); closeParticipantEventHistory(); });
  document.body.appendChild(modal);
  modal.showModal();

  try {
    const response = await fetch(`api.php?action=get_participant_events&registration_id=${encodeURIComponent(registrationId)}&_=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.status === "error") throw new Error(data.message || "Riwayat event gagal dimuat.");

    const nameEl = document.getElementById("participant-history-name");
    const bodyEl = document.getElementById("participant-history-body");
    const participant = data.participant || {};
    const events = Array.isArray(data.events) ? data.events : [];
    if (nameEl) nameEl.textContent = participant.nama_lengkap || "Peserta";

    if (!events.length) {
      bodyEl.innerHTML = `<div style="text-align:center;padding:28px;color:#667085;">Belum ada riwayat event yang disetujui untuk peserta ini.</div>`;
      return;
    }

    bodyEl.innerHTML = `
      <div style="font-size:13px;color:#667085;margin-bottom:12px;">${events.length} event yang pernah diikuti</div>
      <div style="display:grid;gap:10px;">
        ${events.map((ev, i) => `
          <div style="padding:14px;border:1px solid #e5e7eb;border-radius:13px;background:#fff;box-shadow:0 4px 12px rgba(17,24,39,.05);">
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div style="width:32px;height:32px;border-radius:10px;background:#fff3c4;color:#9a6b00;display:grid;place-items:center;font-weight:800;flex:0 0 auto;">${i + 1}</div>
              <div style="min-width:0;flex:1;">
                <div style="font-weight:800;color:#111827;">${escapeHtml(ev.nama_event || "Event")}</div>
                <div style="font-size:12px;color:#667085;margin-top:5px;">${escapeHtml(formatEventDate(ev.tanggal_pelaksanaan))}${ev.jam_pelaksanaan ? ` • ${escapeHtml(normalizeTime(ev.jam_pelaksanaan))}` : ""}</div>
                ${ev.lokasi ? `<div style="font-size:12px;color:#667085;margin-top:3px;"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(ev.lokasi)}</div>` : ""}
                ${ev.jabatan ? `<span style="display:inline-block;margin-top:7px;font-size:10px;padding:5px 8px;border-radius:999px;background:#fff3c4;color:#8a6500;font-weight:800;text-transform:uppercase;">${escapeHtml(ev.jabatan)}</span>` : ""}
              </div>
            </div>
          </div>
        `).join("")}
      </div>`;
  } catch (error) {
    const bodyEl = document.getElementById("participant-history-body");
    if (bodyEl) bodyEl.innerHTML = `<div style="color:#dc2626;padding:16px;background:#fef2f2;border-radius:12px;">Gagal memuat riwayat: ${escapeHtml(error.message || "Terjadi kesalahan")}</div>`;
  }
}

function closeParticipantEventHistory() {
  const modal = document.getElementById("participant-event-history-modal");
  if (!modal) return;
  try { modal.close(); } catch (_) {}
  modal.remove();
}

async function deleteEventPhoto(button, eventId, photoPath) {
  // Tombol hapus harus berdiri sendiri dan tidak membuka viewer foto.
  if (button && typeof button.blur === "function") button.blur();

  if (!currentIsAdmin) {
    showToast("Akses hapus foto hanya untuk admin.", "danger");
    return;
  }

  eventId = Number(eventId || 0);
  photoPath = String(photoPath || "").trim();
  if (!eventId || !photoPath) {
    showToast("Data event atau foto tidak valid.", "danger");
    return;
  }

  const event = eventsCache.find((item) => Number(item.id) === eventId);
  const eventName = event?.nama_event || "Event";
  if (!window.confirm(`Hapus foto ini dari galeri event "${eventName}"?\n\nFoto yang dihapus tidak dapat dikembalikan.`)) return;

  try {
    if (button) {
      button.disabled = true;
      button.style.pointerEvents = "none";
      button.style.opacity = "0.55";
    }

    const response = await fetch("events.php?action=delete_photo&_=" + Date.now(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest"
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ event_id: eventId, photo_path: photoPath })
    });

    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; }
    catch (_) { throw new Error("Server tidak mengirim JSON yang valid."); }

    if (!response.ok || result.status === "error") {
      throw new Error(result.message || `Gagal menghapus foto (HTTP ${response.status}).`);
    }

    closeEventPhotoViewer();
    showToast(result.message || "Foto berhasil dihapus.", "success");
    await loadEvents();

    const updatedEvent = eventsCache.find((item) => Number(item.id) === eventId);
    if (updatedEvent && document.getElementById("page-event-detail")?.classList.contains("active")) {
      renderEventDetailPage(updatedEvent);
    }
  } catch (err) {
    if (button) {
      button.disabled = false;
      button.style.pointerEvents = "auto";
      button.style.opacity = "1";
    }
    console.error("deleteEventPhoto:", err);
    showToast(err.message || "Gagal menghapus foto.", "danger");
  }
}

// Event delegation: tombol hapus tetap bekerja walaupun galeri dibuat ulang dengan innerHTML.
document.addEventListener("click", function (e) {
  const button = e.target.closest?.(".detail-photo-delete");
  if (!button) return;
  e.preventDefault();
  e.stopPropagation();
  const eventId = Number(button.dataset.eventId || 0);
  const photoPath = button.dataset.photoPath || "";
  deleteEventPhoto(button, eventId, photoPath);
}, true);

function uploadEventPhotos(id) {
  const event = eventsCache.find((item) => Number(item.id) === Number(id));
  if (!event) {
    showToast("Data event tidak ditemukan.", "danger");
    return;
  }

  if (getEventStatus(event).toLowerCase() !== "selesai") {
    showToast("Foto dokumentasi hanya dapat diunggah setelah event selesai.", "danger");
    return;
  }

  openModal("Upload Foto Dokumentasi", `
    <div class="form-group">
      <p style="margin:0 0 12px;color:var(--text-muted);">Event: <strong>${escapeHtml(event.nama_event)}</strong></p>
      <label>Foto Dokumentasi Event</label>
      <input type="file" id="event-photo-upload" class="form-control" accept="image/*" multiple>
      <small style="display:block;margin-top:8px;color:var(--text-muted);">Pilih satu atau beberapa foto kegiatan. Foto yang sudah ada tetap tersimpan dan foto baru akan ditambahkan ke galeri.</small>
      <div id="event-photo-preview" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-top:14px;"></div>
    </div>
  `, async function () {
    const input = document.getElementById("event-photo-upload");
    const files = Array.from(input?.files || []);
    if (!files.length) {
      showToast("Pilih minimal satu foto.", "danger");
      return;
    }

    const formData = new FormData();
    formData.append("id", String(id));
    files.forEach((file) => formData.append("foto_event[]", file));

    try {
      const result = await fetchJson("events.php?action=upload_photos", {
        method: "POST",
        body: formData,
      });
      closeModal();
      showToast(result.message || "Foto berhasil diperbarui.", "success");
      await loadEvents();
      const updatedEvent = eventsCache.find((item) => Number(item.id) === Number(id));
      if (updatedEvent && document.getElementById("page-event-detail")?.classList.contains("active")) {
        renderEventDetailPage(updatedEvent);
      }
    } catch (err) {
      showToast(err.message || "Gagal mengupload foto event.", "danger");
    }
  });

  setTimeout(() => {
    const input = document.getElementById("event-photo-upload");
    const preview = document.getElementById("event-photo-preview");
    if (!input || !preview) return;
    input.addEventListener("change", () => {
      preview.innerHTML = "";
      Array.from(input.files || []).forEach((file) => {
        const url = URL.createObjectURL(file);
        const img = document.createElement("img");
        img.src = url;
        img.style.cssText = "width:100%;height:90px;object-fit:cover;border-radius:10px;border:1px solid var(--border-color);";
        preview.appendChild(img);
      });
    });
  }, 0);
}

function editEvent(id) {
  if (!currentIsAdmin) {
    showToast("Akses edit event hanya untuk admin.", "danger");
    return;
  }

  const event = eventsCache.find((item) => Number(item.id) === Number(id));
  if (!event) {
    showToast("Data event tidak ditemukan.", "danger");
    return;
  }

  openModal("Edit Event", `
    <div class="form-group">
      <label>Nama Event / Acara</label>
      <input type="text" id="edit-event-name" class="form-control" value="${escapeHtml(event.nama_event)}">
    </div>
    <div class="form-group">
      <label>Tanggal Pelaksanaan</label>
      <input type="date" id="edit-event-date" class="form-control" value="${escapeHtml(event.tanggal_pelaksanaan)}">
    </div>
    <div class="form-group">
      <label>Jam Pelaksanaan</label>
      <input type="time" id="edit-event-time" class="form-control" value="${escapeHtml(normalizeTime(event.jam_pelaksanaan))}">
    </div>
    <div class="form-group">
      <label>Lokasi</label>
      <input type="text" id="edit-event-location" class="form-control" value="${escapeHtml(event.lokasi || "GOR Kandilo")}">
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="edit-event-status" class="form-control">
        ${["Buka", "Selesai", "Dibatalkan"].map((status) => `
          <option value="${status}" ${status === getEventStatus(event) ? "selected" : ""}>${status}</option>
        `).join("")}
      </select>
    </div>
    <div class="form-group">
      <label>Logo Event ${event.logo_event ? '(pilih file hanya jika ingin mengganti)' : ''}</label>
      <input type="file" id="edit-event-logo" class="form-control" accept="image/png,image/jpeg,image/webp">
    </div>
  `, async function () {
    const payload = {
      id,
      nama_event: document.getElementById("edit-event-name").value.trim(),
      tanggal_pelaksanaan: document.getElementById("edit-event-date").value,
      jam_pelaksanaan: document.getElementById("edit-event-time").value,
      lokasi: document.getElementById("edit-event-location").value.trim(),
      status: document.getElementById("edit-event-status").value,
    };

    if (!payload.nama_event || !payload.tanggal_pelaksanaan) {
      showToast("Nama event dan tanggal wajib diisi.", "danger");
      return;
    }

    try {
      const formData = new FormData();
      Object.entries(payload).forEach(([key,value]) => formData.append(key, value ?? ""));
      const logo = document.getElementById("edit-event-logo").files[0];
      if (logo) formData.append("logo_event", logo);
      const result = await fetchJson("events.php?action=update_event", { method: "POST", body: formData });
      closeModal();
      showToast(result.message || "Event berhasil diupdate.", "success");
      await loadEvents();
      const updatedEvent = eventsCache.find((item) => Number(item.id) === Number(id));
      if (updatedEvent && document.getElementById("page-event-detail")?.classList.contains("active")) {
        renderEventDetailPage(updatedEvent);
      }
    } catch (err) {
      showToast(err.message || "Gagal mengupdate event.", "danger");
    }
  });
}

function populateHistoryFilters(events) {
  const yearSelect = document.getElementById("history-year-filter");
  const sportSelect = document.getElementById("history-sport-filter");
  if (!yearSelect || !sportSelect) return;

  const finished = events.filter((event) => getEventStatus(event).toLowerCase() === "selesai");
  const years = [...new Set(finished.map((event) => String(event.tanggal_pelaksanaan || "").slice(0, 4)).filter((year) => /^\d{4}$/.test(year)))].sort((a,b) => Number(b)-Number(a));
  const sports = [...new Set(finished.map((event) => String(event.cabang_olahraga || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, "id", {sensitivity:"base"}));

  const prevYear = yearSelect.value || "all";
  const prevSport = sportSelect.value || "all";

  yearSelect.innerHTML = '<option value="all">Semua Tahun</option>' + years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join("");
  sportSelect.innerHTML = '<option value="all">Semua Olahraga</option>' + sports.map((sport) => `<option value="${escapeHtml(sport)}">${escapeHtml(sport)}</option>`).join("");

  yearSelect.value = years.includes(prevYear) ? prevYear : "all";
  sportSelect.value = sports.includes(prevSport) ? prevSport : "all";
}

function applyHistoryFilters() {
  const year = document.getElementById("history-year-filter")?.value || "all";
  const sport = document.getElementById("history-sport-filter")?.value || "all";
  const filtered = (eventsCache || []).filter((event) => {
    if (getEventStatus(event).toLowerCase() !== "selesai") return false;
    const eventYear = String(event.tanggal_pelaksanaan || "").slice(0, 4);
    const eventSport = String(event.cabang_olahraga || "").trim();
    return (year === "all" || eventYear === year) && (sport === "all" || eventSport.toLowerCase() === sport.toLowerCase());
  });
  renderHistory(filtered, true);
}

function initHistoryFilters() {
  document.getElementById("history-year-filter")?.addEventListener("change", applyHistoryFilters);
  document.getElementById("history-sport-filter")?.addEventListener("change", applyHistoryFilters);
}

function renderHistory(events, skipFilterPopulate = false) {
  const container = document.getElementById("history-events");
  if (!container) return;
  if (!skipFilterPopulate) populateHistoryFilters(events);

  const finishedEvents = events.filter((event) => getEventStatus(event).toLowerCase() === "selesai");

  if (finishedEvents.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 40px; grid-column: 1 / -1;">
        <i class="fa-solid fa-inbox" style="font-size: 48px; color: var(--text-muted); margin-bottom: 15px;"></i>
        <h3 style="font-size: 18px; color: var(--text-dark); margin-bottom: 8px;">Belum Ada History</h3>
        <p style="font-size: 13px; color: var(--text-muted);">Event yang ditandai selesai akan muncul di sini.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  finishedEvents.forEach((event) => {
    container.appendChild(createEventCard(event));
  });
}

function renderSchedule(events) {
  const board = document.getElementById("schedule-board");
  if (!board) return;

  const activeEvents = events
    .filter((event) => {
      const status = getEventStatus(event).toLowerCase();
      return status !== "selesai" && status !== "dibatalkan";
    })
    .sort((a, b) => {
      const da = `${a.tanggal_pelaksanaan || "9999-12-31"} ${normalizeTime(a.jam_pelaksanaan) || "23:59"}`;
      const db = `${b.tanggal_pelaksanaan || "9999-12-31"} ${normalizeTime(b.jam_pelaksanaan) || "23:59"}`;
      return da.localeCompare(db);
    });

  if (activeEvents.length === 0) {
    board.innerHTML = `
      <div class="schedule-empty">
        <i class="fa-regular fa-calendar-xmark" style="font-size:42px;margin-bottom:12px;"></i>
        <h3 style="margin:0 0 6px;color:var(--text-dark);">Belum Ada Jadwal</h3>
        <p style="margin:0;">Event aktif yang dibuat di menu Event akan otomatis muncul di sini.</p>
      </div>`;
    return;
  }

  const groups = new Map();
  activeEvents.forEach((event) => {
    const key = event.tanggal_pelaksanaan || "tanpa-tanggal";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });

  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  board.innerHTML = Array.from(groups.entries()).map(([dateKey, dayEvents]) => {
    const date = parseLocalDate(dateKey);
    const validDate = date && !Number.isNaN(date.getTime());
    const day = validDate ? dayNames[date.getDay()] : "Tanggal";
    const dateNum = validDate ? String(date.getDate()).padStart(2, "0") : "--";
    const month = validDate ? monthNames[date.getMonth()] : "Belum ditentukan";

    return `
      <div class="schedule-date-group">
        <div class="schedule-date">
          <span class="day">${day}</span>
          <span class="date">${dateNum}</span>
          <span class="month">${month}</span>
        </div>
        <div class="schedule-events">
          ${dayEvents.map((event) => `
            <div class="schedule-event">
              <div class="time">${escapeHtml(normalizeTime(event.jam_pelaksanaan) || "--:--")}</div>
              <div>
                <div class="event-name">${escapeHtml(event.nama_event || "Tanpa Nama Event")}</div>
                <div class="event-meta">
                  <i class="fa-solid fa-location-dot"></i> ${escapeHtml(event.lokasi || "Lokasi belum ditentukan")}
                </div>
              </div>
              <span class="event-status">${escapeHtml(getEventStatus(event) || "Aktif")}</span>
            </div>
          `).join("")}
        </div>
      </div>`;
  }).join("");
}

function parseLocalDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function initGlobalButtonListeners() {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("button, .btn");
    if (!btn) return;

    const btnText = btn.innerText.trim();

    if (btnText.includes("Tambah Pengguna Baru")) {
      if (!currentIsAdmin) return;
      const formHTML = `
        <div class="form-group">
          <label>Nama Lengkap</label>
          <input type="text" id="input-nama" class="form-control" placeholder="Contoh: Budi Santoso">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="input-email" class="form-control" placeholder="Contoh: budi@gmail.com">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="input-password" class="form-control" placeholder="Minimal 6 karakter">
        </div>
        <div class="form-group">
          <label>Role / Jabatan</label>
          <select id="input-role" class="form-control">
            <option value="Admin">Admin</option>
            <option value="User">User</option>
          </select>
        </div>
      `;

      openModal("Tambah Pengguna Baru", formHTML, async function () {
        const name = document.getElementById("input-nama").value.trim();
        const email = document.getElementById("input-email").value.trim();
        const password = document.getElementById("input-password").value;
        const role = document.getElementById("input-role").value;

        if (!name || !email || !password) {
          showToast("Mohon isi nama, email, dan password!", "danger");
          return;
        }

        if (password.length < 6) {
          showToast("Password minimal 6 karakter!", "danger");
          return;
        }

        try {
          const result = await fetchJson("api.php?action=add_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nama: name, email, role, password }),
          });

          closeModal();
          showToast(result.message || "Pengguna berhasil ditambahkan", "success");
          loadUsers();
        } catch (err) {
          showToast(err.message || "Terjadi kesalahan koneksi server!", "danger");
        }
      });
    } else if (btnText.includes("Buat Acara Baru")) {
      if (!currentIsAdmin) return;
      const formHTML = `
        <div class="form-group">
          <label>Nama Event / Acara</label>
          <input type="text" id="input-event-name" class="form-control" placeholder="Contoh: Kandilo Cup 2024">
        </div>
        <div class="form-group">
          <label>Tanggal Pelaksanaan</label>
          <input type="date" id="input-event-date" class="form-control">
        </div>
        <div class="form-group">
          <label>Jam Pelaksanaan (Opsional)</label>
          <input type="time" id="input-event-time" class="form-control">
        </div>
        <div class="form-group">
          <label>Lokasi Event</label>
          <input type="text" id="input-event-location" class="form-control" placeholder="Contoh: Lapangan Kandilo / GOR Kandilo">
        </div>
        <div class="form-group">
          <label>Logo Event</label>
          <input type="file" id="input-event-logo" class="form-control" accept="image/png,image/jpeg,image/webp">
          <small style="color:#667085">Logo ini dipakai di Crew dan pilihan event.</small>
        </div>
        <div class="form-group">
          <label>Foto Dokumentasi / Rekapan</label>
          <input type="file" id="input-event-photo" class="form-control" accept="image/*" multiple>
        </div>
      `;

      openModal("Buat Acara Baru", formHTML, async function () {
        const title = document.getElementById("input-event-name").value.trim();
        const date = document.getElementById("input-event-date").value;
        const time = document.getElementById("input-event-time").value;
        const location = document.getElementById("input-event-location").value.trim();
        const logo = document.getElementById("input-event-logo").files[0];
        const photos = Array.from(document.getElementById("input-event-photo").files);

        if (!title || !date || !logo) {
          showToast("Nama acara, tanggal, dan logo event wajib diisi!", "danger");
          return;
        }

        try {
          const formData = new FormData();
          formData.append("nama_event", title);
          formData.append("tanggal_pelaksanaan", date);
          formData.append("jam_pelaksanaan", time || "");
          formData.append("lokasi", location || "GOR Kandilo");
          formData.append("logo_event", logo);
          photos.forEach((photo) => formData.append("foto_event[]", photo));

          const result = await fetchJson("events.php", {
            method: "POST",
            body: formData,
          });

          closeModal();
          showToast(result.message || "Acara berhasil ditambahkan", "success");
          loadEvents();
        } catch (err) {
          showToast(err.message || "Terjadi kesalahan koneksi server!", "danger");
        }
      });
    }
  });
}

function initSearchFeature() {
  const searchInput = document.querySelector(".search-box input");
  if (!searchInput) return;

  searchInput.addEventListener("keyup", function (e) {
    const keyword = e.target.value.toLowerCase();
    document.querySelectorAll(".custom-table tbody tr").forEach((row) => {
      row.style.display = row.innerText.toLowerCase().includes(keyword) ? "" : "none";
    });
    document.querySelectorAll(".event-card, .crew-card").forEach((card) => {
      card.style.display = card.innerText.toLowerCase().includes(keyword) ? "" : "none";
    });
  });
}

function renderScheduleLoading() {
  const board = document.getElementById("schedule-board");
  if (board) {
    board.innerHTML = `<div class="schedule-empty"><i class="fa-solid fa-spinner fa-spin" style="font-size:36px;margin-bottom:12px;"></i><h3 style="margin:0 0 6px;color:var(--text-dark);">Memuat Jadwal...</h3><p style="margin:0;">Mengambil data event terbaru.</p></div>`;
  }
}

async function loadEvents(options = {}) {
  const scheduleOnly = Boolean(options.scheduleOnly);
  const container = document.querySelector("#page-event .grid-3");

  try {
    const events = await fetchJson("events.php?_=" + Date.now());
    eventsCache = Array.isArray(events) ? events : [];

    // Jadwal tidak bergantung pada keberadaan container halaman Event.
    if (scheduleOnly) {
      renderSchedule(eventsCache);
      return;
    }

    if (!container) {
      renderSchedule(eventsCache);
      return;
    }

    if (!Array.isArray(events) || events.length === 0) {
      renderHomeCarousel([]);
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; grid-column: 1 / -1;">
          <i class="fa-solid fa-trophy" style="font-size: 48px; color: var(--text-muted); margin-bottom: 15px;"></i>
          <h3 style="font-size: 18px; color: var(--text-dark); margin-bottom: 8px;">Belum Ada Event</h3>
          <p style="font-size: 13px; color: var(--text-muted);">Klik "Buat Acara Baru" untuk menambahkan event pertama Anda.</p>
        </div>
      `;
      renderHistory([]);
      renderSchedule([]);
      return;
    }

    container.innerHTML = "";
    renderHomeCarousel(events);

    events.forEach((event) => {
      const card = createEventCard(event, { showFinish: true });
      container.appendChild(card);
    });

    renderHistory(events);
    renderSchedule(events);
    applyPermissions();
  } catch (err) {
    if (scheduleOnly) {
      const board = document.getElementById("schedule-board");
      if (board) {
        board.innerHTML = `<div class="schedule-empty"><i class="fa-solid fa-triangle-exclamation" style="font-size:42px;margin-bottom:12px;color:#ef4444;"></i><h3 style="margin:0 0 6px;color:var(--text-dark);">Jadwal Gagal Dimuat</h3><p style="margin:0;">${escapeHtml(err.message || "Periksa koneksi database.")}</p><button class="btn btn-primary" style="margin-top:16px;" onclick="loadEvents({scheduleOnly:true})">Coba Lagi</button></div>`;
      }
      showToast(err.message || "Gagal memuat jadwal!", "danger");
      return;
    }
    if (container) container.innerHTML = `
      <div class="card" style="text-align: center; padding: 40px; grid-column: 1 / -1;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 48px; color: #ef4444; margin-bottom: 15px;"></i>
        <h3 style="font-size: 18px; color: var(--text-dark); margin-bottom: 8px;">Gagal Memuat Event</h3>
        <p style="font-size: 13px; color: var(--text-muted);">${escapeHtml(err.message || "Periksa koneksi database.")}</p>
      </div>
    `;
    renderHistory([]);
    renderSchedule([]);
    renderHomeCarousel([]);
    applyPermissions();
    showToast(err.message || "Gagal memuat event!", "danger");
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  await requireSession();
  applyPermissions();
  initSearchFeature();
  initGlobalButtonListeners();
  initHistoryFilters();
  loadUsers();
  await loadEvents();


  // Buka detail event langsung jika URL berisi ?event_id=ID.
  const params = new URLSearchParams(window.location.search);
  const directEventId = params.get("event_id");
  if (directEventId) {
    const directEvent = eventsCache.find((item) => Number(item.id) === Number(directEventId));
    if (directEvent) {
      renderEventDetailPage(directEvent);
      showPage("event-detail");
      return;
    }
    showToast("Link event tidak ditemukan atau event sudah dihapus.", "danger");
  }

  // Buka tab yang diminta dari halaman lain, misalnya crew.html -> Jadwal/Registrasi.
  const requestedTab = params.get("tab") || window.location.hash.replace(/^#/, "");
  if (requestedTab) {
    const allowedTabs = ["beranda", "history", "event", "registrasi", "crew", "jadwal"];
    if (allowedTabs.includes(requestedTab)) {
      const targetNav = [...document.querySelectorAll(".nav-link")].find((link) =>
        (link.getAttribute("onclick") || "").includes(`switchTab('${requestedTab}'`)
      );
      switchTab(requestedTab, targetNav);
    }
  }
});
