import { Conversation } from "https://esm.sh/@elevenlabs/client";

// Shared voice-agent orb logic. Each page calls initAgent({ agentId }).
// agentId can also come from a ?agent=... URL param (overrides config if set).
export function initAgent(config = {}) {
  const agentId =
    new URLSearchParams(location.search).get("agent") ||
    (config.agentId && config.agentId !== "PASTE_YOUR_AGENT_ID_HERE"
      ? config.agentId
      : null);

  const orb = document.getElementById("orb");
  const caption = document.getElementById("caption");

  let conversation = null;
  let state = "idle"; // idle | connecting | listening | speaking | error
  let volumeRaf = null;

  const CAPTIONS = {
    idle: "Click to start",
    connecting: "Connecting…",
    listening: "Listening…  ·  tap to end",
    speaking: "Speaking…  ·  tap to end",
    error: "",
  };

  function render(visualState, message) {
    orb.dataset.state = visualState;
    caption.textContent = message ?? CAPTIONS[visualState] ?? "";
    orb.setAttribute(
      "aria-label",
      visualState === "idle" ? "Start conversation" : "End conversation"
    );
  }

  function setState(next, message) {
    state = next;
    render(next, message);
  }

  // Speaking animation: pulse the orb with the agent's output volume.
  function startVolumeLoop() {
    if (typeof conversation?.getOutputVolume !== "function") return; // CSS fallback
    const tick = () => {
      const v = Math.min(1, Math.max(0, conversation.getOutputVolume() || 0));
      orb.style.setProperty("--scale", (1 + v * 0.18).toFixed(3));
      orb.style.setProperty("--glow", `${Math.round(40 + v * 70)}px`);
      volumeRaf = requestAnimationFrame(tick);
    };
    volumeRaf = requestAnimationFrame(tick);
  }

  function stopVolumeLoop() {
    if (volumeRaf) cancelAnimationFrame(volumeRaf);
    volumeRaf = null;
    orb.style.removeProperty("--scale");
    orb.style.removeProperty("--glow");
  }

  async function start() {
    if (!agentId) {
      setState("error", "No agent ID set. Add it on this page or use ?agent=YOUR_ID");
      return;
    }
    setState("connecting");
    try {
      conversation = await Conversation.startSession({
        agentId,
        onConnect: () => setState("listening"),
        onDisconnect: () => {
          stopVolumeLoop();
          conversation = null;
          setState("idle");
        },
        onError: (msg) => {
          stopVolumeLoop();
          conversation = null;
          setState("error", typeof msg === "string" ? msg : "Something went wrong. Tap to retry.");
        },
        onModeChange: ({ mode }) => {
          if (state === "connecting") return; // wait for onConnect
          if (mode === "speaking") {
            setState("speaking");
            startVolumeLoop();
          } else {
            stopVolumeLoop();
            setState("listening");
          }
        },
      });
    } catch (err) {
      conversation = null;
      const denied = err && (err.name === "NotAllowedError" || /permission|denied/i.test(String(err.message || err)));
      setState("error", denied
        ? "Microphone access is needed. Allow it and tap to retry."
        : "Couldn't start the conversation. Tap to retry.");
    }
  }

  async function stop() {
    const c = conversation;
    conversation = null;
    stopVolumeLoop();
    setState("idle");
    try { await c?.endSession(); } catch (_) { /* already closed */ }
  }

  orb.addEventListener("click", () => {
    if (state === "idle" || state === "error") {
      start();
    } else if (state === "connecting") {
      // ignore clicks while connecting to avoid double sessions
    } else {
      stop();
    }
  });
}
