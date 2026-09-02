let recorder;
let audioContext;
let currentRecordingId = null;
let chunkIndex = 0;

const DB_NAME = "tab-audio-recorder-db";
const STORE_NAME = "chunks";

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "offscreen") return;

  if (message.type === "OFFSCREEN_START") {
    startCapture(message.streamId);
  }

  if (message.type === "OFFSCREEN_STOP") {
    stopCapture();
  }
});

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveChunkToDB(recordingId, index, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ recordingId, index, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllChunksForRecording(recordingId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const rows = req.result
        .filter((r) => r.recordingId === recordingId)
        .sort((a, b) => a.index - b.index);
      resolve(rows.map((r) => r.blob));
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearChunksForRecording(recordingId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      req.result
        .filter((r) => r.recordingId === recordingId)
        .forEach((r) => store.delete(r.id));
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function startCapture(streamId) {
  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // Sem isso, o áudio da aba fica mudo pro usuário enquanto grava.
  // Reconectamos o stream de volta nos alto-falantes.
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(media);
  source.connect(audioContext.destination);

  currentRecordingId = Date.now();
  chunkIndex = 0;

  recorder = new MediaRecorder(media, { mimeType: "audio/webm" });

  // Em vez de acumular tudo na RAM, cada pedaço já é salvo em disco
  // (IndexedDB) assim que fica pronto. Isso limita o quanto se perde
  // se o navegador travar/fechar no meio de uma gravação longa.
  recorder.ondataavailable = async (e) => {
    if (e.data.size > 0) {
      await saveChunkToDB(currentRecordingId, chunkIndex++, e.data);
    }
  };

  recorder.onstop = async () => {
    const blobs = await getAllChunksForRecording(currentRecordingId);
    const blob = new Blob(blobs, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `gravacao-aba-${currentRecordingId}.webm`;
    a.click();

    URL.revokeObjectURL(url);
    await clearChunksForRecording(currentRecordingId);

    media.getTracks().forEach((t) => t.stop());
    audioContext.close();
    currentRecordingId = null;
  };

  // timeslice de 60s: a cada 1 minuto o navegador entrega um chunk
  // pronto pro ondataavailable, em vez de só no final.
  recorder.start(60000);
}

function stopCapture() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }
}
