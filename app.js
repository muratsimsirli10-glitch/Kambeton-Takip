const LS = {
  workers: "ist_standalone_workers",
  jobTypes: "ist_standalone_jobtypes",
  stations: "ist_standalone_stations",
  logs: "ist_standalone_logs",
};

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

let state = {
  worker: null,
  workers: [],
  jobTypes: [],
  stations: [],
  logs: [],
  activeLogs: [], // Çoklu aktif iş listesi
  endingLog: null, // O an bitirilmek istenen spesifik iş
  selJobType: null,
  selStation: null,
};

const el = (id) => document.getElementById(id);

function showError(msg) {
  const bar = el("errorBar");
  if (!msg) { bar.hidden = true; return; }
  bar.textContent = msg;
  bar.hidden = false;
  setTimeout(() => { bar.hidden = true; }, 4000);
}

function fmtTime(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

function getShiftLabel(date) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = 7 * 60 + 45;
  const end = 17 * 60 + 45;
  if (minutes >= start && minutes < end) return "07:45-17:45";
  return "Mesai Dışı";
}

function initials(name) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function showScreen(name) {
  ["screenWorkerSelect", "screenDashboard", "screenStart", "screenEnd"].forEach((id) => {
    el(id).hidden = id !== name;
  });
}

// ---------------- İşçi Yönetimi ----------------

function renderWorkerGrid() {
  const grid = el("workerGrid");
  grid.innerHTML = "";
  
  state.workers.forEach((w) => {
    const tile = document.createElement("div");
    tile.className = "worker-tile";
    tile.innerHTML = `
      <div class="worker-tile-actions">
        <button class="worker-action-btn" title="İsmi Düzenle" data-action="edit">✏️</button>
        <button class="worker-action-btn btn-del" title="İşçiyi Sil" data-action="delete">🗑️</button>
      </div>
      <div class="worker-avatar">${initials(w.name)}</div>
      <div class="worker-tile-name">${w.name}</div>
      <div class="worker-tile-id">Sicil ${w.id}</div>
    `;

    tile.onclick = (e) => {
      const action = e.target.getAttribute("data-action");
      if (action === "edit") {
        e.stopPropagation();
        editWorker(w);
      } else if (action === "delete") {
        e.stopPropagation();
        deleteWorker(w);
      } else {
        selectWorker(w);
      }
    };
    grid.appendChild(tile);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "add-worker-tile";
  addBtn.innerHTML = `<span style="font-size:20px;">+</span><span>İşçi Ekle</span>`;
  addBtn.onclick = () => { el("addWorkerForm").hidden = false; };
  grid.appendChild(addBtn);
}

function deleteWorker(w) {
  if (!confirm(`"${w.name}" (Sicil: ${w.id}) isimli işçiyi silmek istediğinize emin misiniz?`)) return;
  state.workers = state.workers.filter((item) => item.id !== w.id);
  saveLS(LS.workers, state.workers);
  renderWorkerGrid();
}

function editWorker(w) {
  const newName = prompt(`Sicil No: ${w.id}\nYeni Ad Soyad:`, w.name);
  if (!newName || !newName.trim() || newName.trim() === w.name) return;
  w.name = newName.trim();
  saveLS(LS.workers, state.workers);
  renderWorkerGrid();
}

el("closeAddWorker").onclick = () => { el("addWorkerForm").hidden = true; };

el("submitAddWorker").onclick = () => {
  const id = el("newWorkerId").value.trim();
  const name = el("newWorkerName").value.trim();
  if (!id || !name) return;

  if (state.workers.some((w) => w.id === id)) {
    showError("Bu sicil no zaten kayıtlı.");
    return;
  }

  state.workers.push({ id, name });
  saveLS(LS.workers, state.workers);

  el("newWorkerId").value = "";
  el("newWorkerName").value = "";
  el("addWorkerForm").hidden = true;
  renderWorkerGrid();
};

function selectWorker(w) {
  state.worker = w;
  el("workerBar").hidden = false;
  el("workerName").textContent = w.name;
  el("workerId").textContent = w.id;
  showScreen("screenDashboard");
  refreshDashboard();
}

el("logoutBtn").onclick = () => {
  state.worker = null;
  el("workerBar").hidden = true;
  showScreen("screenWorkerSelect");
};

// ---------------- Dashboard ----------------

function refreshDashboard() {
  if (!state.worker) return;
  const wid = state.worker.id;

  // Seçili işçiye ait TÜM aktif işleri getir
  state.activeLogs = state.logs.filter((l) => l.worker_id === wid && l.status === "active");
  renderDashboard();
}

function renderDashboard() {
  const container = el("activeJobsList");
  container.innerHTML = "";

  // Aktif iş kartlarını oluştur
  state.activeLogs.forEach((log) => {
    const card = document.createElement("div");
    card.className = "active-card";
    card.innerHTML = `
      <div class="active-tag"><span class="pulse-dot"></span>Devam Eden İş</div>
      <div class="active-title">${log.job_type}</div>
      <div class="active-meta">
        <span>${log.station}</span>
        <span>Başlangıç ${fmtTime(log.start_time)}</span>
      </div>
      <div class="timer" id="timer-${log.id}">00:00:00</div>
      <button class="btn-danger btn-block" style="margin-top:12px;">İŞİ BİTİR</button>
    `;

    card.querySelector("button").onclick = () => openEndFlow(log);
    container.appendChild(card);
  });

  // Geçmiş listesi
  const wid = state.worker.id;
  const historyList = el("historyList");
  const historyBlock = el("historyBlock");
  const userHistory = state.logs
    .filter((l) => l.worker_id === wid && l.status === "done")
    .slice(-6)
    .reverse();

  if (userHistory.length > 0) {
    historyBlock.hidden = false;
    historyList.innerHTML = "";
    userHistory.forEach((l) => {
      const row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML = `
        <div>
          <div class="history-name">${l.job_type}</div>
          <div class="history-sub">${l.station} &middot; ${fmtDate(l.start_time)}</div>
        </div>
        <div>
          <div class="history-time">${fmtTime(l.start_time)}&ndash;${fmtTime(l.end_time)}</div>
          <div class="history-done">Tamamlandı</div>
        </div>
      `;
      historyList.appendChild(row);
    });
  } else {
    historyBlock.hidden = true;
  }
}

// ---------------- Excel Dışa Aktarma ----------------

el("exportBtn").onclick = () => {
  if (state.logs.length === 0) {
    alert("Dışa aktarılacak kayıt bulunmuyor.");
    return;
  }

  const rows = [
    ["Sicil No", "Ad Soyad", "İş Türü", "İstasyon", "Vardiya", "Tarih", "Başlangıç", "Bitiş", "Süre (dk)", "Durum", "Not", "Bitiş Notu"]
  ];

  state.logs.forEach((log) => {
    let durationMin = "";
    if (log.end_time) {
      durationMin = Math.round((new Date(log.end_time) - new Date(log.start_time)) / 60000);
    }
    const d = new Date(log.start_time);
    rows.push([
      log.worker_id,
      log.worker_name,
      log.job_type,
      log.station,
      log.shift,
      d.toLocaleDateString("tr-TR"),
      fmtTime(log.start_time),
      log.end_time ? fmtTime(log.end_time) : "",
      durationMin,
      log.status === "done" ? "Tamamlandı" : "Devam ediyor",
      log.note || "",
      log.end_note || ""
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "İş Kayıtları");

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `kambeton_is_kayitlari_${dateStr}.xlsx`);
};

// ---------------- Start Flow ----------------

el("startJobBtn").onclick = () => {
  state.selJobType = null;
  state.selStation = null;
  el("startNote").value = "";
  renderStartFlow();
  showScreen("screenStart");
};
el("startBack").onclick = () => showScreen("screenDashboard");

function renderStartFlow() {
  const jtGrid = el("jobTypeGrid");
  jtGrid.innerHTML = "";
  state.jobTypes.forEach((jt) => {
    const tile = document.createElement("div");
    tile.className = "tile" + (state.selJobType === jt.name ? " active-orange" : "");
    tile.innerHTML = `
      <div class="tile-actions">
        <button class="item-action-btn" title="Düzenle" data-action="edit-jt">✏️</button>
        <button class="item-action-btn btn-del" title="Sil" data-action="del-jt">🗑️</button>
      </div>
      <span>${jt.name}</span>
    `;
    tile.onclick = (e) => {
      const act = e.target.getAttribute("data-action");
      if (act === "edit-jt") {
        e.stopPropagation();
        const n = prompt("İş Türünü Güncelle:", jt.name);
        if (n && n.trim()) {
          jt.name = n.trim();
          saveLS(LS.jobTypes, state.jobTypes);
          renderStartFlow();
        }
      } else if (act === "del-jt") {
        e.stopPropagation();
        if (confirm(`"${jt.name}" iş türünü silmek istediğinize emin misiniz?`)) {
          state.jobTypes = state.jobTypes.filter(x => x.id !== jt.id);
          saveLS(LS.jobTypes, state.jobTypes);
          renderStartFlow();
        }
      } else {
        state.selJobType = jt.name;
        renderStartFlow();
      }
    };
    jtGrid.appendChild(tile);
  });

  const addJtBtn = document.createElement("div");
  addJtBtn.className = "add-item-tile";
  addJtBtn.innerHTML = `<span>+ İş Türü Ekle</span>`;
  addJtBtn.onclick = () => {
    const n = prompt("Yeni İş Türü adı:");
    if (n && n.trim()) {
      state.jobTypes.push({ id: Date.now(), name: n.trim() });
      saveLS(LS.jobTypes, state.jobTypes);
      renderStartFlow();
    }
  };
  jtGrid.appendChild(addJtBtn);

  const stGrid = el("stationGrid");
  stGrid.innerHTML = "";
  state.stations.forEach((st) => {
    const tile = document.createElement("div");
    tile.className = "tile" + (state.selStation === st.name ? " active-yellow" : "");
    tile.innerHTML = `
      <div class="tile-actions">
        <button class="item-action-btn" title="Düzenle" data-action="edit-st">✏️</button>
        <button class="item-action-btn btn-del" title="Sil" data-action="del-st">🗑️</button>
      </div>
      <span>${st.name}</span>
    `;
    tile.onclick = (e) => {
      const act = e.target.getAttribute("data-action");
      if (act === "edit-st") {
        e.stopPropagation();
        const n = prompt("İstasyon Adını Güncelle:", st.name);
        if (n && n.trim()) {
          st.name = n.trim();
          saveLS(LS.stations, state.stations);
          renderStartFlow();
        }
      } else if (act === "del-st") {
        e.stopPropagation();
        if (confirm(`"${st.name}" istasyonunu silmek istediğinize emin misiniz?`)) {
          state.stations = state.stations.filter(x => x.id !== st.id);
          saveLS(LS.stations, state.stations);
          renderStartFlow();
        }
      } else {
        state.selStation = st.name;
        renderStartFlow();
      }
    };
    stGrid.appendChild(tile);
  });

  const addStBtn = document.createElement("div");
  addStBtn.className = "add-item-tile";
  addStBtn.innerHTML = `<span>+ İstasyon Ekle</span>`;
  addStBtn.onclick = () => {
    const n = prompt("Yeni İstasyon / Makine adı:");
    if (n && n.trim()) {
      state.stations.push({ id: Date.now(), name: n.trim() });
      saveLS(LS.stations, state.stations);
      renderStartFlow();
    }
  };
  stGrid.appendChild(addStBtn);

  el("confirmStartBtn").disabled = !(state.selJobType && state.selStation);
}

el("confirmStartBtn").onclick = () => {
  if (!state.selJobType || !state.selStation) return;
  const now = new Date();

  const newLog = {
    id: "log-" + Date.now(),
    worker_id: state.worker.id,
    worker_name: state.worker.name,
    job_type: state.selJobType,
    station: state.selStation,
    shift: getShiftLabel(now),
    start_time: now.toISOString(),
    end_time: null,
    note: el("startNote").value.trim(),
    end_note: "",
    status: "active",
  };

  state.logs.push(newLog);
  saveLS(LS.logs, state.logs);

  showScreen("screenDashboard");
  refreshDashboard();
};

// ---------------- End Flow ----------------

function openEndFlow(log) {
  state.endingLog = log;
  el("endJobType").textContent = log.job_type;
  el("endMeta").textContent = `${log.station} \u00b7 Başlangıç ${fmtTime(log.start_time)}`;
  el("endNote").value = "";
  showScreen("screenEnd");
}

el("endBack").onclick = () => {
  state.endingLog = null;
  showScreen("screenDashboard");
};

el("confirmEndBtn").onclick = () => {
  if (!state.endingLog) return;
  
  const target = state.logs.find((l) => l.id === state.endingLog.id);
  if (target) {
    target.end_time = new Date().toISOString();
    target.end_note = el("endNote").value.trim();
    target.status = "done";
    saveLS(LS.logs, state.logs);
  }

  state.endingLog = null;
  showScreen("screenDashboard");
  refreshDashboard();
};

// ---------------- Saat & Zamanlayıcılar ----------------

function tick() {
  const now = new Date();
  el("clock").textContent = now.toLocaleTimeString("tr-TR");
  if (state.worker) el("shiftLabel").textContent = getShiftLabel(now);

  // Ana paneldeki tüm aktif kartların sayaçlarını canlı güncelle
  if (!el("screenDashboard").hidden && state.activeLogs.length > 0) {
    state.activeLogs.forEach((log) => {
      const timerDom = document.getElementById(`timer-${log.id}`);
      if (timerDom) {
        timerDom.textContent = fmtDuration(now - new Date(log.start_time));
      }
    });
  }

  // Bitir ekranı açıksa onun sayacını güncelle
  if (state.endingLog && !el("screenEnd").hidden) {
    el("endTimer").textContent = fmtDuration(now - new Date(state.endingLog.start_time));
  }
}
setInterval(tick, 1000);

// ---------------- Başlatma ----------------

function init() {
  state.workers = loadLS(LS.workers, []);
  state.jobTypes = loadLS(LS.jobTypes, []);
  state.stations = loadLS(LS.stations, []);
  state.logs = loadLS(LS.logs, []);

  renderWorkerGrid();
  showScreen("screenWorkerSelect");
  tick();
}

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}