const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Process and play the captured tab audio."
  });
}

async function getProcessorState() {
  try {
    return await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "get-state"
    });
  } catch {
    return { active: false, tabId: null };
  }
}

async function stopProcessing(tabId) {
  try {
    await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "stop-processing"
    });
  } catch (error) {
    console.warn("Could not stop offscreen processing:", error);
  }

  if (tabId != null) {
    await chrome.action.setBadgeText({
      tabId,
      text: ""
    });
  }
}

async function startProcessing(tab) {
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id
  });

  const result = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "start-processing",
    streamId,
    tabId: tab.id
  });

  if (!result?.ok) {
    throw new Error(result?.error || "Could not start audio processing.");
  }

  await chrome.action.setBadgeText({
    tabId: tab.id,
    text: "ON"
  });

  await chrome.action.setBadgeBackgroundColor({
    tabId: tab.id,
    color: "#5e2750"
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  try {
    await ensureOffscreenDocument();

    const state = await getProcessorState();

    if (state.active) {
      await stopProcessing(state.tabId);

      if (state.tabId === tab.id) {
        return;
      }
    }

    await startProcessing(tab);
  } catch (error) {
    console.error("Dynamic Audio error:", error);

    await chrome.action.setBadgeText({
      tabId: tab.id,
      text: "ERR"
    });

    await chrome.action.setBadgeBackgroundColor({
      tabId: tab.id,
      color: "#a51d2d"
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "background") {
    return;
  }

  if (message.type === "capture-ended" && message.tabId != null) {
    chrome.action.setBadgeText({
      tabId: message.tabId,
      text: ""
    });
  }
});
