import StreamingAvatar, { StreamingEvents, TaskType } from "@heygen/streaming-avatar";

const API_BASE = import.meta.env.VITE_API_BASE as string;

const videoEl = document.getElementById("avatarVideo") as HTMLVideoElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
const interruptBtn = document.getElementById("interruptBtn") as HTMLButtonElement;
const askBtn = document.getElementById("askBtn") as HTMLButtonElement;
const askStreamBtn = document.getElementById("askStreamBtn") as HTMLButtonElement;
const promptEl = document.getElementById("prompt") as HTMLTextAreaElement;
const logEl = document.getElementById("log") as HTMLPreElement;

let avatar: StreamingAvatar | null = null;
let sessionId: string | null = null;

function log(msg: string) {
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

async function getHeyGenToken(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/heygen/token`, { method: "POST" });
  const data = await r.json();
  if (!data?.token) throw new Error("No HeyGen token returned");
  return data.token;
}

function sentenceChunker() {
  let acc = "";
  const enders = /([.!?;\n]+)/g;
  return (text: string) => {
    acc += text;
    const out: string[] = [];
    while (enders.exec(acc) !== null) {
      const cut = enders.lastIndex;
      const chunk = acc.slice(0, cut).trim();
      if (chunk) out.push(chunk);
      acc = acc.slice(cut);
      enders.lastIndex = 0;
    }
    return out;
  };
}
const pushSentence = sentenceChunker();

async function startSession() {
  try {
    const token = await getHeyGenToken();
    avatar = new StreamingAvatar({ token });

    avatar.on(StreamingEvents.STREAM_READY, (e: any) => {
      if (e?.detail) {
        videoEl.srcObject = e.detail;
        videoEl.onloadedmetadata = () => videoEl.play().catch(console.error);
      }
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      videoEl.srcObject = null;
      log("Stream disconnected.");
    });

    // Known-working avatar
    const session = await avatar.createStartAvatar({
      avatarName: "Wayne_20240711"
    });
    sessionId = (session as any)?.session_id || null;
    log(`Session started: ${sessionId ?? "(no id returned)"}`);

    // Unmute after the Start button (user gesture) to allow audio
    setTimeout(() => {
      try {
        videoEl.muted = false;
        videoEl.volume = 1.0;
        videoEl.play().catch(() => {});
      } catch {}
    }, 100);

    startBtn.disabled = true;
    stopBtn.disabled = false;
    askBtn.disabled = false;
    askStreamBtn.disabled = false;
    interruptBtn.disabled = false;
  } catch (err: any) {
    log("Failed to start session: " + (err?.message || err));
  }
}

async function stopSession() {
  try {
    if (avatar) {
      await avatar.stopAvatar();
      log("Session stopped.");
    }
  } catch (e) {
    log("Stop error: " + e);
  }
  videoEl.srcObject = null;
  avatar = null;
  sessionId = null;

  startBtn.disabled = false;
  stopBtn.disabled = true;
  askBtn.disabled = true;
  askStreamBtn.disabled = true;
  interruptBtn.disabled = true;
}

async function speak(text: string) {
  if (!avatar) throw new Error("No avatar session");
  await avatar.speak({ text, task_type: TaskType.REPEAT });
}

async function askNonStream() {
  const q = promptEl.value.trim();
  if (!q) return;
  log(`User: ${q}`);
  const r = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: q })
  });
  const data = await r.json();
  const text = data?.text || "(no text)";
  log(`Latimer: ${text}`);
  await speak(text);
}

async function askStream() {
  const q = promptEl.value.trim();
  if (!q) return;

  log(`User: ${q}`);
  const es = new EventSource(`${API_BASE}/api/chat/stream?q=${encodeURIComponent(q)}`);

  es.onmessage = async (evt) => {
    try {
      const piece = JSON.parse(evt.data);
      for (const sentence of pushSentence(piece)) {
        log(`↳ chunk: ${sentence}`);
        await speak(sentence);
      }
    } catch {
      // ignore parse issues
    }
  };

  es.addEventListener("done", () => {
    log("Latimer: [stream finished]");
    es.close();
  });

  es.onerror = () => {
    log("Stream error (closed).");
    es.close();
  };
}

async function interruptSpeech() {
  if (!avatar) return;
  await avatar.interrupt();
  log("Interrupted current speech.");
}

startBtn.addEventListener("click", startSession);
stopBtn.addEventListener("click", stopSession);
askBtn.addEventListener("click", askNonStream);
askStreamBtn.addEventListener("click", askStream);
interruptBtn.addEventListener("click", interruptSpeech);



