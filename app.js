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
  selJobType: null,
  selStation: null,
  selActivity: "İŞLEM",
  workerCount: 2,
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

// ---------------- İşçi / Sorumlu Yönetimi ----------------

function renderWorkerGrid() {
  const grid = el("workerGrid");
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
  addBtn.onclick = () => { el("addWorkerForm").hidden = false; };
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
  state.activeLogs = state.logs.filter((l) => l.worker_id === wid && l.status === "active");
  renderDashboard();
}

function renderDashboard() {
  const container = el("activeJobsList");
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
  const userHistory = state.logs
    .filter((l) => l.worker_id === wid && l.status === "done")
    .slice(-6)
    .reverse();

  if (userHistory.length > 0) {
    historyBlock.hidden = false;
    historyList.innerHTML = "";
    userHistory.forEach((l) => {
      const durMin = Math.round((new Date(l.end_time) - new Date(l.start_time)) / 60000);
      const adamSaat = ((durMin * (l.worker_count || 1)) / 60).toFixed(2);
      const row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML = `
        <div>
          <div class="history-name">[${l.activity || "İŞLEM"}] ${l.job_type}</div>
          <div class="history-sub">${l.station} &middot; ${l.worker_count || 1} Kişi &middot; ${durMin} dk &middot; ${adamSaat} Adam-Saat</div>
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

// ---------------- Görseldeki Gibi Excel Çıktısı ----------------

el("exportBtn").onclick = () => {
  if (state.logs.length === 0) {
    alert("Dışa aktarılacak kayıt bulunmuyor.");
    return;
  }

  // İlk işin başlangıç zamanı = 0. dakika referansı
  const baseTime = new Date(state.logs[0].start_time).getTime();

  // Excel Başlık ve Tablo Sütunları
  const wsData = [
    ["KÖPRÜ KİRİŞİ ETÜDÜ - ZAMAN ETÜDÜ FORMU"],
    ["Tarih:", new Date().toLocaleDateString("tr-TR"), "", "Tesis / Firma:", "KAMBETON A.Ş."],
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
      "ADAM SAAT"
    ]
  ];

  let sumIslem = 0;
  let sumTasima = 0;
  let sumBekleme = 0;
  let sumHazirlik = 0;
  let sumAdamSaat = 0;

  state.logs.forEach((log, index) => {
    const startMs = new Date(log.start_time).getTime();
    const baslamaDakika = Math.max(0, Math.round((startMs - baseTime) / 60000));

    let bitisSaatStr = "-";
    let bitisDakikaStr = "-";
    let durationMin = 0;
    let adamSaat = 0;

    if (log.end_time) {
      const endMs = new Date(log.end_time).getTime();
      bitisSaatStr = fmtTime(log.end_time);
      bitisDakikaStr = Math.max(0, Math.round((endMs - baseTime) / 60000));
      durationMin = Math.max(0, Math.round((endMs - startMs) / 60000));
      adamSaat = Number(((durationMin * (log.worker_count || 1)) / 60).toFixed(2));

      // Faaliyet toplamları
      const act = (log.activity || "İŞLEM").toUpperCase();
      if (act === "İŞLEM") sumIslem += durationMin;
      else if (act === "TAŞIMA") sumTasima += durationMin;
      else if (act === "BEKLEME") sumBekleme += durationMin;
      else if (act === "HAZIRLIK") sumHazirlik += durationMin;

      sumAdamSaat += adamSaat;
    }

    wsData.push([
      index + 1,
      log.job_type,
      log.activity || "İŞLEM",
      fmtTime(log.start_time),
      baslamaDakika,
      bitisSaatStr,
      bitisDakikaStr,
      durationMin || "",
      log.worker_count || 1,
      adamSaat || 0
    ]);
  });

  const totalFaaliyet = sumIslem + sumTasima + sumBekleme + sumHazirlik;

  // Görseldeki gibi alt özet tablosu
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

  // Sütun genişlikleri
  ws["!cols"] = [
    { wch: 10 }, // İŞLEM NO
    { wch: 32 }, // İŞLEM ADI
    { wch: 14 }, // FAALİYET
    { wch: 16 }, // BAŞLANGIÇ SAATİ
    { wch: 10 }, // BAŞLAMA
    { wch: 14 }, // BİTİŞ SAATİ
    { wch: 10 }, // BİTİŞ
    { wch: 12 }, // SÜRE (dk)
    { wch: 8 },  // KİŞİ
    { wch: 14 }  // ADAM SAAT
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Zaman_Etudu");

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `kopru_kirisi_etudu_${dateStr}.xlsx`);
};

// ---------------- Start Flow Dinleyicileri ----------------

// 1. Faaliyet Seçimi
document.querySelectorAll("#activitySelector .selector-btn").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("#activitySelector .selector-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.selActivity = btn.getAttribute("data-val");
  };
});

// 2. Kişi Sayısı Seçimi
document.querySelectorAll("#workerCountSelector .selector-btn").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("#workerCountSelector .selector-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.workerCount = parseInt(btn.getAttribute("data-count"));
    el("customWorkerCount").value = "";
  };
});

el("customWorkerCount").oninput = (e) => {
  const val = parseInt(e.target.value);
  if (val && val > 0) {
    document.querySelectorAll("#workerCountSelector .selector-btn").forEach((b) => b.classList.remove("active"));
    state.workerCount = val;
  }
};

el("startJobBtn").onclick = () => {
  state.selJobType = null;
  state.selStation = null;
  el("startNote").value = "";
  renderStartFlow();
  showScreen("screenStart");
};
el("startBack").onclick = () => showScreen("screenDashboard");

function renderStartFlow() {
  // İşlem Adları Grid
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
        const n = prompt("İşlem Adını Güncelle:", jt.name);
        if (n && n.trim()) {
          jt.name = n.trim();
          saveLS(LS.jobTypes, state.jobTypes);
          renderStartFlow();
        }
      } else if (act === "del-jt") {
        e.stopPropagation();
        if (confirm(`"${jt.name}" işlemini silmek istediğinize emin misiniz?`)) {
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
  addJtBtn.innerHTML = `<span>+ İşlem Adı Ekle</span>`;
  addJtBtn.onclick = () => {
    const n = prompt("Yeni İşlem Adı (Örn: Çadır kapatma, Halat kesimi):");
    if (n && n.trim()) {
      state.jobTypes.push({ id: Date.now(), name: n.trim() });
      saveLS(LS.jobTypes, state.jobTypes);
      renderStartFlow();
    }
  };
  jtGrid.appendChild(addJtBtn);

  // İstasyonlar Grid
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

// ---------------- End Flow ----------------

function openEndFlow(log) {
  state.endingLog = log;
  el("endJobType").textContent = log.job_type;
  el("endMeta").textContent = `[${log.activity || "İŞLEM"}] ${log.station} \u00b7 ${log.worker_count || 1} Kişi \u00b7 Başlangıç ${fmtTime(log.start_time)}`;
  el("endStopReason").value = "";
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
    target.stop_reason = el("endStopReason").value.trim();
    target.status = "done";
    saveLS(LS.logs, state.logs);
  }

  state.endingLog = null;
  showScreen("screenDashboard");
  refreshDashboard();
};

// ---------------- Saat & Sayaçlar ----------------

function tick() {
  const now = new Date();
  el("clock").textContent = now.toLocaleTimeString("tr-TR");
  if (state.worker) el("shiftLabel").textContent = getShiftLabel(now);

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