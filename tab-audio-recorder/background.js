const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

// IMPORTANTE: nunca usar variável comum (let recording = false) aqui.
// O service worker é descarregado pelo Chrome após ~30s de inatividade,
// e qualquer variável em memória perde o valor quando ele "acorda" de novo.
// chrome.storage.session sobrevive a esse ciclo (só é limpo quando o
// navegador fecha de vez).
async function setRecordingState(value, startTime = null, limitMinutes = null) {
  await chrome.storage.session.set({ recording: value, startTime, limitMinutes });
}

async function getRecordingState() {
  const data = await chrome.storage.session.get(["recording", "startTime", "limitMinutes"]);
  return {
    recording: !!data.recording,
    startTime: data.startTime || null,
    limitMinutes: data.limitMinutes ?? null,
  };
}

const STOP_ALARM_NAME = "stopRecordingAlarm";

// chrome.alarms sobrevive ao descarregamento do service worker (diferente
// de setTimeout, que seria cancelado se o worker dormir no meio da espera).
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STOP_ALARM_NAME) {
    stopRecording({ auto: true });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_RECORDING") {
    startRecording(message.limitMinutes)
      .then((startTime) => sendResponse({ ok: true, startTime }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // resposta assíncrona
  }

  if (message.type === "STOP_RECORDING") {
    stopRecording().then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "GET_STATUS") {
    // Fonte da verdade dupla: storage (sobrevive ao reload do worker) +
    // existência real do offscreen document (sobrevive a tudo, é o que
    // segura o MediaRecorder de fato).
    (async () => {
      const { recording: stored, startTime, limitMinutes } = await getRecordingState();
      const offscreenAlive = await hasOffscreenDocument();
      const actuallyRecording = stored && offscreenAlive;

      // Se o storage dizia "gravando" mas o offscreen já morreu (ex: o
      // usuário fechou o navegador e reabriu), corrige o estado sujo.
      if (stored && !offscreenAlive) {
        await setRecordingState(false);
      }

      sendResponse({
        recording: actuallyRecording,
        startTime: actuallyRecording ? startTime : null,
        limitMinutes: actuallyRecording ? limitMinutes : null,
      });
    })();
    return true;
  }
});

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  return contexts.length > 0;
}

async function setupOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Gravar o áudio de uma aba específica via MediaRecorder.",
  });
}

async function startRecording(limitMinutes = 60) {
  // Pega a aba ativa da janela atual
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("Nenhuma aba ativa encontrada.");

  // Gera um streamId vinculado a essa aba especificamente
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id,
  });

  await setupOffscreenDocument();

  // Repassa o streamId pro offscreen document, que tem acesso a getUserMedia
  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_START",
    target: "offscreen",
    streamId,
  });

  const startTime = Date.now();
  await setRecordingState(true, startTime, limitMinutes);

  // limitMinutes = 0 significa "sem limite" -> não cria alarme.
  if (limitMinutes > 0) {
    chrome.alarms.create(STOP_ALARM_NAME, { delayInMinutes: limitMinutes });
  }

  return startTime;
}

async function stopRecording({ auto = false } = {}) {
  chrome.alarms.clear(STOP_ALARM_NAME);

  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_STOP",
    target: "offscreen",
  });
  await setRecordingState(false);

  if (auto) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "Gravação finalizada",
      message: "O limite de tempo foi atingido — o áudio foi salvo automaticamente.",
    });
  }
}
