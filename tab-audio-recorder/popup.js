const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const status = document.getElementById("status");
const timerEl = document.getElementById("timer");
const limitSelect = document.getElementById("limitSelect");
const limitLabel = document.getElementById("limitLabel");

let timerInterval = null;

// Carrega a última opção de limite escolhida (persiste entre sessões,
// diferente do storage.session usado pro estado de gravação).
chrome.storage.local.get("limitMinutes", (data) => {
  if (data.limitMinutes !== undefined) {
    limitSelect.value = String(data.limitMinutes);
  }
});

limitSelect.addEventListener("change", () => {
  chrome.storage.local.set({ limitMinutes: Number(limitSelect.value) });
});

// Ao abrir o popup, verifica se já existe uma gravação em andamento
// (o popup é recriado do zero toda vez que fecha e abre, então todo
// esse estado precisa vir de fora, nunca de uma variável local).
chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
  if (res && res.recording) {
    setRecordingUI(true);
    startTimer(res.startTime);
    limitSelect.value = String(res.limitMinutes ?? 60);
    updateLimitLabel(res.limitMinutes);
  } else {
    setRecordingUI(false);
  }
});

startBtn.addEventListener("click", async () => {
  status.textContent = "Iniciando...";
  const limitMinutes = Number(limitSelect.value);
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
  if (!isRecording) {
    status.textContent = "Pronto.";
    timerEl.textContent = "";
    limitLabel.textContent = "";
  } else {
    status.textContent = "Gravando esta aba...";
  }
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
