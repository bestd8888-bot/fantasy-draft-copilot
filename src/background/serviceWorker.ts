/**
 * MV3 service worker.
 *
 * Deliberately thin: all draft logic runs in the content script so nothing has
 * to be forwarded off the page. This worker only opens the options page and
 * answers health pings.
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") void chrome.runtime.openOptionsPage();
});

chrome.action?.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message?.type === "ping") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }
  return undefined;
});
