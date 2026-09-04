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
  activeLogs: [],
  endingLog: null,
  editingLogId: null,
  selJobType: null,
  selStation: null,
  selActivity: "İŞLEM",
  workerCount: 2,
};

const el = (id) => document.getElementById(id);

function showError(msg) {
  const bar = el("errorBar");
  if (!bar) return;
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
    const target = el(id);
    if (target) target.hidden = id !== name;
  });
}

// ---------------- Sorumlu Yönetimi ----------------

function renderWorkerGrid() {
  const grid = el("workerGrid");
  if (!grid) return;
  grid.innerHTML = "";

  state.workers.forEach((w) => {
    const tile = document.createElement("div");
    tile.className = "worker-tile";
    tile.innerHTML = `
      <div class="worker-tile-actions">
        <button class="worker-action-btn" title="İsmi Düzenle" data-action="edit">✏️</button>
        <button class="worker-action-btn btn-del" title="Sil" data-action="delete">🗑️</button>
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
  addBtn.innerHTML = `<span style="font-size:20px;">+</span><span>Sorumlu Ekle</span>`;
  addBtn.onclick = () => { 
    const f = el("addWorkerForm");
    if (f) f.hidden = false; 
  };
  grid.appendChild(addBtn);
}

function deleteWorker(w) {
  if (!confirm(`"${w.name}" kaydını silmek istediğinize emin misiniz?`)) return;
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

function selectWorker(w) {
  state.worker = w;
  el("workerBar").hidden = false;
  el("workerName").textContent = w.name;
  el("workerId").textContent = w.id;
  showScreen("screenDashboard");
  refreshDashboard();
}

// ---------------- Dashboard ----------------

function refreshDashboard() {
  if (!state.worker) return;
  const wid = state.worker.id;
  // Sadece BU KULLANICIYA ait devam eden işler
  state.activeLogs = state.logs.filter((l) => l.worker_id === wid && l.status === "active");
  renderDashboard();
}

function renderDashboard() {
  const container = el("activeJobsList");
  if (!container) return;
  container.innerHTML = "";

  state.activeLogs.forEach((log) => {
    const card = document.createElement("div");
    card.className = "active-card";
    card.innerHTML = `
      <div class="active-tag"><span class="pulse-dot"></span>${log.activity || "İŞLEM"} &middot; ${log.worker_count || 1} Kişi</div>
      <div class="active-title">${log.job_type}</div>
      <div class="active-meta">
        <span>${log.station}</span>
        <span>Başlangıç ${fmtTime(log.start_time)}</span>
      </div>
      <div class="timer" id="timer-${log.id}">00:00:00</div>
      <button class="btn-danger btn-block" style="margin-top:12px;">İŞLEMİ BİTİR</button>
    `;

    card.querySelector("button").onclick = () => openEndFlow(log);
    container.appendChild(card);
  });

  const wid = state.worker.id;
  const historyList = el("historyList");
  const historyBlock = el("historyBlock");

  // SADECE BU KULLANICININ TAMAMLADIĞI İŞLER
  const myHistory = state.logs
    .filter((l) => l.worker_id === wid && l.status === "done")
    .reverse();

  if (myHistory.length > 0) {
    historyBlock.hidden = false;
    historyList.innerHTML = "";
    myHistory.forEach((l) => {
      const durMin = Math.round((new Date(l.end_time) - new Date(l.start_time)) / 60000);
      const adamSaat = ((durMin * (l.worker_count || 1)) / 60).toFixed(2);
      
      const row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML = `
        <div>
          <div class="history-name" style="font-weight:600; color:#fff;">[${l.activity || "İŞLEM"}] ${l.job_type}</div>
          <div class="history-sub" style="font-size:12px; color:#aaa;">${l.station} &middot; ${l.worker_count || 1} Kişi &middot; ${durMin} dk &middot; ${adamSaat} Adam-Saat ${l.stop_reason ? `<br><span style="color:#f39c12;">Duruş: ${l.stop_reason}</span>` : ""}</div>
        </div>
        <div class="history-actions">
          <div style="text-align:right; margin-right:4px;">
            <div class="history-time" style="font-family:monospace; font-size:12px;">${fmtTime(l.start_time)}&ndash;${fmtTime(l.end_time)}</div>
            <div class="history-done" style="font-size:11px; color:#2ecc71;">Tamamlandı</div>
          </div>
          <button class="item-action-btn" title="Düzenle" data-act="edit">✏️</button>
          <button class="item-action-btn btn-del" title="Sil" data-act="del">🗑️</button>
        </div>
      `;

      row.querySelector('[data-act="edit"]').onclick = () => openEditModal(l);
      row.querySelector('[data-act="del"]').onclick = () => deleteHistoryLog(l.id);

      historyList.appendChild(row);
    });
  } else {
    historyBlock.hidden = true;
  }
}

// ---------------- Modal Yönetimi ----------------

function openEditModal(log) {
  state.editingLogId = log.id;
  el("modalJobTitle").textContent = `[${log.activity}] ${log.job_type}`;
  el("modalWorkerCount").value = log.worker_count || 1;
  el("modalStopReason").value = log.stop_reason || "";
  el("modalNote").value = log.note || "";
  el("editLogModal").hidden = false;
}

function closeEditModal() {
  state.editingLogId = null;
  el("editLogModal").hidden = true;
}

function deleteHistoryLog(id) {
  if (!confirm("Bu işlem kaydını silmek istediğinize emin misiniz?")) return;
  state.logs = state.logs.filter((l) => l.id !== id);
  saveLS(LS.logs, state.logs);
  refreshDashboard();
}

// ---------------- SADECE BU KULLANICIYA ÖZEL EXCEL ÇIKTISI ----------------

function exportExcel() {
  if (!state.worker) {
    alert("Lütfen bir kullanıcı seçin.");
    return;
  }

  const wid = state.worker.id;

  // 1. KURAL: Kesinlikle ve sadece BU kişinin tamamlanmış kayıtlarını al
  const myLogs = state.logs
    .filter((l) => l.worker_id === wid && l.status === "done")
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  if (myLogs.length === 0) {
    alert(`${state.worker.name} adına ait tamamlanmış işlem bulunmuyor.`);
    return;
  }

  // 2. KURAL: 0. dakika bu kişinin İLK işleminin başlama anıdır
  const baseTime = new Date(myLogs[0].start_time).getTime();

  const wsData = [
    ["KAMBETON A.Ş. - ZAMAN ETÜDÜ FORMU"],
    ["Etüt Sorumlusu:", `${state.worker.name} (Sicil: ${state.worker.id})`, "", "Tarih:", new Date().toLocaleDateString("tr-TR")],
    ["Vardiya:", "07:45 - 17:45", "", "Tesis / Firma:", "KAMBETON A.Ş."],
    [],
    [
      "İŞLEM NO",
      "İŞLEM ADI",
      "FAALİYET",
      "BAŞLANGIÇ SAATİ",
      "BAŞLAMA",
      "BİTİŞ SAATİ",
      "BİTİŞ",
      "SÜRE (dk)",
      "KİŞİ",
      "ADAM SAAT",
      "DURUŞ / GECİKME NEDENİ"
    ]
  ];

  let sumIslem = 0;
  let sumTasima = 0;
  let sumBekleme = 0;
  let sumHazirlik = 0;
  let sumAdamSaat = 0;

  myLogs.forEach((log, index) => {
    const startMs = new Date(log.start_time).getTime();
    const endMs = new Date(log.end_time).getTime();

    // Bu kişinin ilk işine göre kümülatif dakika
    const baslamaDakika = Math.max(0, Math.round((startMs - baseTime) / 60000));
    const bitisDakika = Math.max(0, Math.round((endMs - baseTime) / 60000));
    const durationMin = Math.max(0, Math.round((endMs - startMs) / 60000));
    const adamSaat = Number(((durationMin * (log.worker_count || 1)) / 60).toFixed(2));

    const act = (log.activity || "İŞLEM").toUpperCase();
    if (act === "İŞLEM") sumIslem += durationMin;
    else if (act === "TAŞIMA") sumTasima += durationMin;
    else if (act === "BEKLEME") sumBekleme += durationMin;
    else if (act === "HAZIRLIK") sumHazirlik += durationMin;

    sumAdamSaat += adamSaat;

    wsData.push([
      index + 1, // KESİNLİKLE 1'DEN BAŞLAR
      log.job_type,
      log.activity || "İŞLEM",
      fmtTime(log.start_time),
      baslamaDakika, // KESİNLİKLE 0'DAN BAŞLAR
      fmtTime(log.end_time),
      bitisDakika,
      durationMin,
      log.worker_count || 1,
      adamSaat,
      log.stop_reason || "-"
    ]);
  });

  const totalFaaliyet = sumIslem + sumTasima + sumBekleme + sumHazirlik;

  wsData.push([]);
  wsData.push([]);
  wsData.push(["FAALİYET", "SÜRE (DK)", "", "ÖZET TABLOSU", "DEĞER"]);
  wsData.push(["İŞLEM", sumIslem, "", "TOPLAM İŞLEM SÜRESİ", sumIslem]);
  wsData.push(["TAŞIMA", sumTasima, "", "TOPLAM TAŞIMA SÜRESİ", sumTasima]);
  wsData.push(["BEKLEME", sumBekleme, "", "TOPLAM BEKLEME SÜRESİ", sumBekleme]);
  wsData.push(["HAZIRLIK", sumHazirlik, "", "TOPLAM HAZIRLIK SÜRESİ", sumHazirlik]);
  wsData.push(["", "", "", "TOPLAM ADAM SAAT SÜR.", Number(sumAdamSaat.toFixed(2))]);
  wsData.push(["", "", "", "TOPLAM FAALİYET SÜRESİ", totalFaaliyet]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [
    { wch: 10 }, { wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 10 },
    { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 25 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Zaman_Etudu");

  // Dosya adı KİŞİYE ÖZEL iner: etut_test2_2026-09-04.xlsx
  const cleanName = state.worker.name.replace(/\s+/g, "_").toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `etut_${cleanName}_${dateStr}.xlsx`);
}

// ---------------- Start Flow ----------------

function renderStartFlow() {
  const jtGrid = el("jobTypeGrid");
  if (!jtGrid) return;
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
        const n = prompt("İşlem Adını Güncelle:", jt.name);
        if (n && n.trim()) {
          jt.name = n.trim();
          saveLS(LS.jobTypes, state.jobTypes);
          renderStartFlow();
        }
      } else if (act === "del-jt") {
        e.stopPropagation();
        if (confirm(`"${jt.name}" işlemini silmek istediğinize emin misiniz?`)) {
          state.jobTypes = state.jobTypes.filter((x) => x.id !== jt.id);
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
  addJtBtn.innerHTML = `<span>+ İşlem Adı Ekle</span>`;
  addJtBtn.onclick = () => {
    const n = prompt("Yeni İşlem Adı (Örn: Halat kesimi):");
    if (n && n.trim()) {
      state.jobTypes.push({ id: Date.now(), name: n.trim() });
      saveLS(LS.jobTypes, state.jobTypes);
      renderStartFlow();
    }
  };
  jtGrid.appendChild(addJtBtn);

  const stGrid = el("stationGrid");
  if (!stGrid) return;
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
          state.stations = state.stations.filter((x) => x.id !== st.id);
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
  addStBtn.innerHTML = `<span>+ İstasyon / Hat Ekle</span>`;
  addStBtn.onclick = () => {
    const n = prompt("Yeni İstasyon / Hat Adı:");
    if (n && n.trim()) {
      state.stations.push({ id: Date.now(), name: n.trim() });
      saveLS(LS.stations, state.stations);
      renderStartFlow();
    }
  };
  stGrid.appendChild(addStBtn);

  if (el("confirmStartBtn")) {
    el("confirmStartBtn").disabled = !(state.selJobType && state.selStation);
  }
}

// ---------------- End Flow ----------------

function openEndFlow(log) {
  state.endingLog = log;
  el("endJobType").textContent = log.job_type;
  el("endMeta").textContent = `[${log.activity || "İŞLEM"}] ${log.station} \u00b7 ${log.worker_count || 1} Kişi \u00b7 Başlangıç ${fmtTime(log.start_time)}`;
  el("endStopReason").value = "";
  showScreen("screenEnd");
}

// ---------------- Sayaçlar ----------------

function tick() {
  const now = new Date();
  if (el("clock")) el("clock").textContent = now.toLocaleTimeString("tr-TR");
  if (state.worker && el("shiftLabel")) el("shiftLabel").textContent = getShiftLabel(now);

  if (!el("screenDashboard").hidden && state.activeLogs.length > 0) {
    state.activeLogs.forEach((log) => {
      const timerDom = document.getElementById(`timer-${log.id}`);
      if (timerDom) {
        timerDom.textContent = fmtDuration(now - new Date(log.start_time));
      }
    });
  }

  if (state.endingLog && !el("screenEnd").hidden) {
    el("endTimer").textContent = fmtDuration(now - new Date(state.endingLog.start_time));
  }
}
setInterval(tick, 1000);

// ---------------- Başlatma & Event Listeners ----------------

function setupEvents() {
  if (el("closeAddWorker")) el("closeAddWorker").onclick = () => { el("addWorkerForm").hidden = true; };
  if (el("submitAddWorker")) {
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
  }

  if (el("logoutBtn")) {
    el("logoutBtn").onclick = () => {
      state.worker = null;
      el("workerBar").hidden = true;
      showScreen("screenWorkerSelect");
    };
  }

  if (el("closeEditModal")) el("closeEditModal").onclick = closeEditModal;
  if (el("cancelEditModal")) el("cancelEditModal").onclick = closeEditModal;
  if (el("saveEditModal")) {
    el("saveEditModal").onclick = () => {
      if (!state.editingLogId) return;
      const target = state.logs.find((l) => l.id === state.editingLogId);
      if (target) {
        target.worker_count = parseInt(el("modalWorkerCount").value) || 1;
        target.stop_reason = el("modalStopReason").value.trim();
        target.note = el("modalNote").value.trim();
        saveLS(LS.logs, state.logs);
      }
      closeEditModal();
      refreshDashboard();
    };
  }

  if (el("exportBtn")) el("exportBtn").onclick = exportExcel;

  document.querySelectorAll("#activitySelector .selector-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#activitySelector .selector-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.selActivity = btn.getAttribute("data-val");
    };
  });

  document.querySelectorAll("#workerCountSelector .selector-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#workerCountSelector .selector-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.workerCount = parseInt(btn.getAttribute("data-count"));
      if (el("customWorkerCount")) el("customWorkerCount").value = "";
    };
  });

  if (el("customWorkerCount")) {
    el("customWorkerCount").oninput = (e) => {
      const val = parseInt(e.target.value);
      if (val && val > 0) {
        document.querySelectorAll("#workerCountSelector .selector-btn").forEach((b) => b.classList.remove("active"));
        state.workerCount = val;
      }
    };
  }

  if (el("startJobBtn")) {
    el("startJobBtn").onclick = () => {
      state.selJobType = null;
      state.selStation = null;
      el("startNote").value = "";
      renderStartFlow();
      showScreen("screenStart");
    };
  }

  if (el("startBack")) el("startBack").onclick = () => showScreen("screenDashboard");

  if (el("confirmStartBtn")) {
    el("confirmStartBtn").onclick = () => {
      if (!state.selJobType || !state.selStation) return;
      const now = new Date();

      const newLog = {
        id: "log-" + Date.now(),
        worker_id: state.worker.id,
        worker_name: state.worker.name,
        job_type: state.selJobType,
        activity: state.selActivity || "İŞLEM",
        station: state.selStation,
        worker_count: state.workerCount || 1,
        shift: getShiftLabel(now),
        start_time: now.toISOString(),
        end_time: null,
        note: el("startNote").value.trim(),
        stop_reason: "",
        status: "active",
      };

      state.logs.push(newLog);
      saveLS(LS.logs, state.logs);

      showScreen("screenDashboard");
      refreshDashboard();
    };
  }

  if (el("endBack")) {
    el("endBack").onclick = () => {
      state.endingLog = null;
      showScreen("screenDashboard");
    };
  }

  if (el("confirmEndBtn")) {
    el("confirmEndBtn").onclick = () => {
      if (!state.endingLog) return;
      
      const target = state.logs.find((l) => l.id === state.endingLog.id);
      if (target) {
        target.end_time = new Date().toISOString();
        target.stop_reason = el("endStopReason").value.trim();
        target.status = "done";
        saveLS(LS.logs, state.logs);
      }

      state.endingLog = null;
      showScreen("screenDashboard");
      refreshDashboard();
    };
  }
}

function init() {
  state.workers = loadLS(LS.workers, []);
  state.jobTypes = loadLS(LS.jobTypes, []);
  state.stations = loadLS(LS.stations, []);
  state.logs = loadLS(LS.logs, []);

  setupEvents();
  renderWorkerGrid();
  showScreen("screenWorkerSelect");
  tick();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}