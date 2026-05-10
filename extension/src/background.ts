// Service worker.
// Owns: side panel open/close, popup-side-panel bridge, message routing,
// keyboard commands, cloud-sync SSE listener.

import type { Patch } from '@vibelayer/shared';
import { startSyncLoop } from './sync.js';

chrome.runtime.onInstalled.addListener(() => {
  // Don't auto-open panel — we want popup to be the default click target.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
});

// Keyboard command: Ctrl/Cmd+Shift+L opens the side panel.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-side-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) await chrome.sidePanel.open({ tabId: tab.id });
});

// Message bus between popup / side panel / content / background.
type Msg =
  | { kind: 'snapshot.request'; tabId: number }
  | { kind: 'snapshot.response'; snapshot: unknown }
  | { kind: 'patch.apply'; tabId: number; patch: Patch }
  | { kind: 'patch.remove'; tabId: number; patchId: string }
  | { kind: 'open.side-panel' };

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  switch (msg.kind) {
    case 'snapshot.request':
      chrome.tabs.sendMessage(msg.tabId, { kind: 'snapshot.collect' }, (resp) => {
        sendResponse(resp);
      });
      return true;
    case 'patch.apply':
    case 'patch.remove':
      chrome.tabs.sendMessage(msg.tabId, msg);
      return false;
    case 'open.side-panel':
      // Triggered from popup's "Expand" button.
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id != null) chrome.sidePanel.open({ tabId: tab.id });
      });
      return false;
    default:
      return false;
  }
});

startSyncLoop();
