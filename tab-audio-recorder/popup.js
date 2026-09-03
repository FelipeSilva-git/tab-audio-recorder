const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const status = document.getElementById("status");
const timerEl = document.getElementById("timer");
const limitSelect = document.getElementById("limitSelect");
const limitLabel = document.getElementById("limitLabel");
const customMinutesRow = document.getElementById("customMinutesRow");
const customHoursInput = document.getElementById("customHoursInput");
const customMinutesInput = document.getElementById("customMinutesInput");

let timerInterval = null;

const PRESET_VALUES = ["15", "30", "60", "120", "180", "240", "0"];

// Carrega a última opção de limite escolhida (persiste entre sessões,
// diferente do storage.session usado pro estado de gravação).
chrome.storage.local.get(["limitMinutes", "customMinutesValue"], (data) => {
  if (data.customMinutesValue) {
    setCustomFields(data.customMinutesValue);
  }
  if (data.limitMinutes !== undefined) {
    applyLimitToSelect(data.limitMinutes);
  }
});

limitSelect.addEventListener("change", () => {
  toggleCustomRow();
  if (limitSelect.value !== "custom") {
    chrome.storage.local.set({ limitMinutes: Number(limitSelect.value) });
  }
});

function handleCustomInputChange() {
  const val = getCustomTotalMinutes();
  if (val > 0) {
    chrome.storage.local.set({ limitMinutes: val, customMinutesValue: val });
  }
}
customHoursInput.addEventListener("input", handleCustomInputChange);
customMinutesInput.addEventListener("input", handleCustomInputChange);

// Ao abrir o popup, verifica se já existe uma gravação em andamento
// (o popup é recriado do zero toda vez que fecha e abre, então todo
// esse estado precisa vir de fora, nunca de uma variável local).
chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
  if (res && res.recording) {
    setRecordingUI(true);
    startTimer(res.startTime);
    applyLimitToSelect(res.limitMinutes ?? 60);
    updateLimitLabel(res.limitMinutes);
  } else {
    setRecordingUI(false);
    toggleCustomRow();
  }
});

startBtn.addEventListener("click", async () => {
  const limitMinutes = getSelectedLimitMinutes();

  if (limitSelect.value === "custom" && limitMinutes <= 0) {
    status.textContent = "Digite horas ou minutos válidos.";
    return;
  }

  status.textContent = "Iniciando...";
  chrome.runtime.sendMessage(
    { type: "START_RECORDING", limitMinutes },
    (res) => {
      if (res && res.ok) {
        setRecordingUI(true);
        startTimer(res.startTime);
        updateLimitLabel(limitMinutes);
      } else {
        status.textContent = "Erro: " + (res?.error || "desconhecido");
      }
    }
  );
});

stopBtn.addEventListener("click", () => {
  status.textContent = "Finalizando e baixando...";
  chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, (res) => {
    stopTimer();
    setRecordingUI(false);
    status.textContent = res?.ok ? "Áudio salvo!" : "Erro ao parar.";
  });
});

function setRecordingUI(isRecording) {
  startBtn.disabled = isRecording;
  stopBtn.disabled = !isRecording;
  limitSelect.disabled = isRecording; // só pode trocar o limite antes de começar
  customHoursInput.disabled = isRecording;
  customMinutesInput.disabled = isRecording;
  if (!isRecording) {
    status.textContent = "Pronto.";
    timerEl.textContent = "";
    limitLabel.textContent = "";
  } else {
    status.textContent = "Gravando esta aba...";
  }
}

// Se o valor salvo bater com uma opção fixa do select, seleciona ela.
// Se não bater com nenhuma (ex: 90min, digitado como "adaptativo"),
// seleciona "custom" e preenche horas/minutos com esse valor.
function applyLimitToSelect(limitMinutes) {
  const str = String(limitMinutes);
  if (PRESET_VALUES.includes(str)) {
    limitSelect.value = str;
  } else {
    limitSelect.value = "custom";
    setCustomFields(limitMinutes);
  }
  toggleCustomRow();
}

function setCustomFields(totalMinutes) {
  customHoursInput.value = Math.floor(totalMinutes / 60) || "";
  customMinutesInput.value = totalMinutes % 60 || "";
}

function getCustomTotalMinutes() {
  const h = Number(customHoursInput.value) || 0;
  const m = Number(customMinutesInput.value) || 0;
  return h * 60 + m;
}

function toggleCustomRow() {
  customMinutesRow.classList.toggle("visible", limitSelect.value === "custom");
}

function getSelectedLimitMinutes() {
  if (limitSelect.value === "custom") {
    return getCustomTotalMinutes();
  }
  return Number(limitSelect.value);
}

function updateLimitLabel(limitMinutes) {
  limitLabel.textContent = limitMinutes > 0
    ? `Vai parar e baixar sozinho em ${formatLimit(limitMinutes)}.`
    : "Sem limite — pare manualmente.";
}

function formatLimit(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

// O cronômetro é calculado a partir do startTime real (salvo no
// background), nunca de um contador local — assim ele mostra o tempo
// certo mesmo se o popup foi fechado e reaberto no meio da gravação.
function startTimer(startTime) {
  stopTimer();
  if (!startTime) return;

  const update = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    timerEl.textContent = `${h}:${m}:${s}`;
  };

  update();
  timerInterval = setInterval(update, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
