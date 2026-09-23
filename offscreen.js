let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let compressorNode = null;
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

  /*
   * Main compressor.
   *
   * Goal:
   * - Leave quieter dialogue relatively untouched.
   * - Reduce louder music and sound effects.
   *
   * These values are intentionally more aggressive than the first MVP.
   */
  compressorNode = audioContext.createDynamicsCompressor();
  compressorNode.threshold.value = -28;
  compressorNode.knee.value = 12;
  compressorNode.ratio.value = 8;
  compressorNode.attack.value = 0.01;
  compressorNode.release.value = 0.30;

  /*
   * Final peak control.
   *
   * This is not a true brick-wall limiter, but a second compressor with
   * a very high ratio that keeps sudden peaks under better control.
   */
  limiterNode = audioContext.createDynamicsCompressor();
  limiterNode.threshold.value = -3;
  limiterNode.knee.value = 0;
  limiterNode.ratio.value = 20;
  limiterNode.attack.value = 0.003;
  limiterNode.release.value = 0.10;

  /*
   * Important difference from v0.1:
   *
   * There is NO makeup gain.
   *
   * The first MVP compressed loud sections and then boosted the complete
   * signal again. That made dialogue louder as well.
   *
   * Now the loud sections stay attenuated after compression.
   */
  sourceNode
    .connect(compressorNode)
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
  console.log("Compressor reduction:", compressorNode.reduction, "dB");
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
    limiterNode?.disconnect();
  } catch {
    // Nodes may already be disconnected.
  }

  sourceNode = null;
  compressorNode = null;
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
      tabId: currentTabId,
      reduction: compressorNode?.reduction ?? 0
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
