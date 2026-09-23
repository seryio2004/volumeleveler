let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let compressorNode = null;
let makeupGainNode = null;
let limiterNode = null;
let currentTabId = null;

async function startProcessing(streamId, tabId) {
  await stopProcessing();

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  audioContext = new AudioContext();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  sourceNode = audioContext.createMediaStreamSource(mediaStream);

  // Main compressor: reduces the difference between quiet and loud passages.
  compressorNode = audioContext.createDynamicsCompressor();
  compressorNode.threshold.value = -24;
  compressorNode.knee.value = 20;
  compressorNode.ratio.value = 6;
  compressorNode.attack.value = 0.01;
  compressorNode.release.value = 0.25;

  // Small makeup gain to recover some perceived loudness after compression.
  makeupGainNode = audioContext.createGain();
  makeupGainNode.gain.value = 1.25;

  // Final limiter-like compressor to control peaks after makeup gain.
  limiterNode = audioContext.createDynamicsCompressor();
  limiterNode.threshold.value = -3;
  limiterNode.knee.value = 0;
  limiterNode.ratio.value = 20;
  limiterNode.attack.value = 0.003;
  limiterNode.release.value = 0.1;

  sourceNode
    .connect(compressorNode)
    .connect(makeupGainNode)
    .connect(limiterNode)
    .connect(audioContext.destination);

  currentTabId = tabId;

  const audioTrack = mediaStream.getAudioTracks()[0];

  if (audioTrack) {
    audioTrack.addEventListener("ended", async () => {
      const endedTabId = currentTabId;
      await stopProcessing();

      chrome.runtime.sendMessage({
        target: "background",
        type: "capture-ended",
        tabId: endedTabId
      });
    });
  }

  console.log("Dynamic Audio enabled for tab:", tabId);
}

async function stopProcessing() {
  const stream = mediaStream;
  const context = audioContext;

  mediaStream = null;
  audioContext = null;
  currentTabId = null;

  try {
    sourceNode?.disconnect();
    compressorNode?.disconnect();
    makeupGainNode?.disconnect();
    limiterNode?.disconnect();
  } catch {
    // Nodes may already be disconnected.
  }

  sourceNode = null;
  compressorNode = null;
  makeupGainNode = null;
  limiterNode = null;

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  if (context && context.state !== "closed") {
    await context.close();
  }

  console.log("Dynamic Audio disabled");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") {
    return;
  }

  if (message.type === "get-state") {
    sendResponse({
      active: mediaStream !== null,
      tabId: currentTabId
    });
    return;
  }

  if (message.type === "start-processing") {
    startProcessing(message.streamId, message.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error(error);
        sendResponse({
          ok: false,
          error: error.message
        });
      });

    return true;
  }

  if (message.type === "stop-processing") {
    stopProcessing()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error(error);
        sendResponse({
          ok: false,
          error: error.message
        });
      });

    return true;
  }
});
