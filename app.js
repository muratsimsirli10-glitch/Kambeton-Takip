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
  activeLog: null,
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

  // Aktif işi bul
  state.activeLog = state.logs.find((l) => l.worker_id === wid && l.status === "active") || null;
  renderDashboard();
}

function renderDashboard() {
  const activeCard = el("activeJobCard");
  const startBtn = el("startJobBtn");

  if (state.activeLog) {
    activeCard.hidden = false;
    startBtn.hidden = true;
    el("activeJobType").textContent = state.activeLog.job_type;
    el("activeStation").textContent = state.activeLog.station;
    el("activeStart").textContent = fmtTime(state.activeLog.start_time);
  } else {
    activeCard.hidden = true;
    startBtn.hidden = false;
  }

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

// ---------------- Excel Dışa Aktarma (İstemci Tabanlı) ----------------

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
  XLSX.writeFile(wb, `is-kayitlari_${dateStr}.xlsx`);
};

// ---------------- Dinamik İş Türü ve İstasyon Akışı ----------------

el("startJobBtn").onclick = () => {
  state.selJobType = null;
  state.selStation = null;
  el("startNote").value = "";
  renderStartFlow();
  showScreen("screenStart");
};
el("startBack").onclick = () => showScreen("screenDashboard");

function renderStartFlow() {
  // İş Türleri
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

  // İstasyonlar
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

// ---------------- İş Bitir Akışı ----------------

el("endJobBtn").onclick = () => {
  if (!state.activeLog) return;
  el("endJobType").textContent = state.activeLog.job_type;
  el("endMeta").textContent = `${state.activeLog.station} \u00b7 Başlangıç ${fmtTime(state.activeLog.start_time)}`;
  el("endNote").value = "";
  showScreen("screenEnd");
};
el("endBack").onclick = () => showScreen("screenDashboard");

el("confirmEndBtn").onclick = () => {
  if (!state.activeLog) return;
  state.activeLog.end_time = new Date().toISOString();
  state.activeLog.end_note = el("endNote").value.trim();
  state.activeLog.status = "done";

  saveLS(LS.logs, state.logs);
  state.activeLog = null;

  showScreen("screenDashboard");
  refreshDashboard();
};

// ---------------- Saat & Zamanlayıcılar ----------------

function tick() {
  const now = new Date();
  el("clock").textContent = now.toLocaleTimeString("tr-TR");
  if (state.worker) el("shiftLabel").textContent = getShiftLabel(now);
  if (state.activeLog && !el("screenDashboard").hidden) {
    el("activeTimer").textContent = fmtDuration(now - new Date(state.activeLog.start_time));
  }
  if (state.activeLog && !el("screenEnd").hidden) {
    el("endTimer").textContent = fmtDuration(now - new Date(state.activeLog.start_time));
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
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}