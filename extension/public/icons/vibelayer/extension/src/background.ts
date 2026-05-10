// Service worker. Owns: side-panel open/close, message routing between content
// script and panel, and the cloud-sync SSE listener. We keep zero business logic
// in the panel itself — it only renders state — so background can survive panel
// closure without losing work.

import type { Patch } from '@vibelayer/shared';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Some Chromium forks lack sidePanel; we fail open — user can still reach
    // the panel via the action click event below.
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Message bus: panel ↔ background ↔ content. Use one discriminated union so
// adding a new message type is a single switch case, not three.
type Msg =
  | { kind: 'snapshot.request'; tabId: number }
  | { kind: 'snapshot.response'; snapshot: unknown }
  | { kind: 'patch.apply'; tabId: number; patch: Patch }
  | { kind: 'patch.remove'; tabId: number; patchId: string };

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  switch (msg.kind) {
    case 'snapshot.request':
      chrome.tabs.sendMessage(msg.tabId, { kind: 'snapshot.collect' }, (resp) => {
        sendResponse(resp);
      });
      return true; // keep channel open for async sendResponse
    case 'patch.apply':
      chrome.tabs.sendMessage(msg.tabId, msg);
      return false;
    case 'patch.remove':
      chrome.tabs.sendMessage(msg.tabId, msg);
      return false;
    default:
      return false;
  }
});

// Sync bootstrap. Lives here so it survives panel close. The actual SSE
// implementation is in lib/sync.ts; background just keeps the connection alive.
import { startSyncLoop } from './sync.js';
startSyncLoop();
