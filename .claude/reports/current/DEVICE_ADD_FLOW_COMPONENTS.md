# Frontend: Device-Hinzufügen-Flow – Vollständige Komponentenliste

**Erstellt:** 2025-02-15  
**Zweck:** Analyse und Trace des kompletten Device-Add-Flows (Real ESP + Mock ESP)

---

## 1. Zwei parallele Flows

| Flow | Trigger | Ziel |
|------|---------|------|
| **Real ESP** | ESP sendet Heartbeat → Server broadcastet `device_discovered` | PendingDevicesPanel → Genehmigen/Ablehnen |
| **Mock ESP** | User klickt „+ Mock“ / „Gerät erstellen“ | CreateMockEspModal → API createDevice |

---

## 2. Vue-Komponenten (nach Pfad)

### 2.1 Kerneinfluss – Real ESP (Pending/Discovery)

| Pfad | Rolle |
|------|-------|
| `src/views/DashboardView.vue` | Hostet PendingDevicesPanel, ruft `fetchPendingDevices()` onMounted, sync `pendingCount` → dashboard.store |
| `src/components/esp/PendingDevicesPanel.vue` | Panel mit Tabs „Wartend“/„Anleitung“, Liste pending devices, Genehmigen/Ablehnen |
| `src/components/modals/RejectDeviceModal.vue` | Modal für Ablehnungsgrund bei Reject |
| `src/shared/design/layout/TopBar.vue` | Button „✨ X Neue“ / „Geräte“, setzt `showPendingPanel = true` oder zeigt `showCreateMock` |
| `src/components/dashboard/ActionBar.vue` | Alternative Action-Bar mit „X Neue“ / „Geräte“ und `openPendingDevices` (falls genutzt) |

### 2.2 Kerneinfluss – Mock ESP

| Pfad | Rolle |
|------|-------|
| `src/components/modals/CreateMockEspModal.vue` | Modal für Mock-ESP-Erstellung, Formular, `espStore.createDevice()` |
| `src/views/DashboardView.vue` | Bindet CreateMockEspModal via `dashStore.showCreateMock`, EmptyState-Button „Gerät erstellen“ |

### 2.3 Verwandte UI (Status/Anzeige)

| Pfad | Rolle |
|------|-------|
| `src/components/esp/ESPCard.vue` | Badge `pending_approval` für wartende Geräte |
| `src/components/dashboard/UnassignedDropBar.vue` | Unzugewiesene Geräte, Kontext Drag&Drop |
| `src/components/common/EmptyState.vue` | „Keine ESP-Geräte“ + CTA „Gerät erstellen“ |
| `src/components/common/LoadingState.vue` | Loading beim initialen Ladevorgang |
| `src/shared/design/patterns/ToastContainer.vue` | Toast-Ausgabe für „Neues Gerät entdeckt“, „Genehmigt“, „Abgelehnt“ |

---

## 3. Pinia-Stores

| Store | Pfad | Relevante State/Actions |
|-------|------|------------------------|
| **esp** | `src/stores/esp.ts` | `pendingDevices`, `pendingCount`, `fetchPendingDevices()`, `approveDevice()`, `rejectDevice()`, `createDevice()`, WebSocket-Handler `device_discovered`/`device_approved`/`device_rejected`/`device_rediscovered` |
| **dashboard** | `src/shared/stores/dashboard.store.ts` | `showPendingPanel`, `showCreateMock`, `pendingCount`, `hasPendingDevices`, `activate()`/`deactivate()` |

---

## 4. API-Schicht

| Modul | Pfad | Endpoints / Methoden |
|-------|------|----------------------|
| **esp** | `src/api/esp.ts` | `getPendingDevices()` → GET `/esp/devices/pending`, `approveDevice()` → POST `/esp/devices/{id}/approve`, `rejectDevice()` → POST `/esp/devices/{id}/reject`, `createDevice()` (Mock) |

---

## 5. Composables & Services

| Modul | Pfad | Rolle |
|-------|------|-------|
| **useWebSocket** | `src/composables/useWebSocket.ts` | WebSocket-Subscription, `on()` für Event-Handler |
| **useToast** | `src/composables/useToast.ts` | Toast für „Neues Gerät entdeckt“, Erfolg/Fehler bei Approve/Reject |
| **websocketService** | `src/services/websocket.ts` | Singleton, `subscribe()`, `on()`, `connect()` |

---

## 6. Typen (src/types/)

| Datei | Relevante Typen |
|-------|-----------------|
| `index.ts` | `PendingESPDevice`, `ESPApprovalRequest`, `ESPRejectionRequest`, `PendingDevicesListResponse`, `DeviceDiscoveredPayload`, `MockESPCreate` |
| `websocket-events.ts` | `event: 'device_discovered'`, Device-Lifecycle-Events |

---

## 7. Utilities

| Modul | Pfad | Verwendung |
|-------|------|------------|
| **wifiStrength** | `src/utils/wifiStrength.ts` | `getWifiStrength()` für RSSI-Anzeige im PendingDevicesPanel |
| **eventTypeIcons** | `src/utils/eventTypeIcons.ts` | Icon für `device_discovered` (Radio) |
| **eventTransformer** | `src/utils/eventTransformer.ts` | Mapping für `device_discovered` im System Monitor |
| **logger** | `src/utils/logger.ts` | Strukturiertes Logging in esp.store |

---

## 8. Styles

| Datei | Relevanz |
|-------|----------|
| `src/styles/tokens.css` | `--z-modal-backdrop`, `--z-popover`, `--color-*`, `--glass-*` |
| `src/styles/animations.css` | `iridescent-pulse` für Pending-Button |
| `PendingDevicesPanel.vue` (scoped) | `.pending-panel`, `.pending-device`, `.pending-backdrop` |

---

## 9. WebSocket-Events (Device Lifecycle)

| Event | Handler | Store-Aktion |
|-------|---------|--------------|
| `device_discovered` | `handleDeviceDiscovered` | `pendingDevices.push()`, `toast.info()` |
| `device_approved` | `handleDeviceApproved` | `pendingDevices.filter()`, `fetchAll()`, `toast.success()` |
| `device_rejected` | `handleDeviceRejected` | `pendingDevices.filter()`, `toast.warning()` |
| `device_rediscovered` | `handleDeviceRediscovered` | `fetchPendingDevices()`, `toast.info()` |

---

## 10. Routen & Mount-Kontext

| Route | View | Enthält |
|-------|------|---------|
| `/` (dashboard) | `DashboardView` | PendingDevicesPanel, CreateMockEspModal, EmptyState, TopBar Controls |
| Andere Routes | – | TopBar sichtbar, aber PendingDevicesPanel nur wenn DashboardView gemountet |

**Hinweis:** PendingDevicesPanel ist Kind von DashboardView. Der „✨ 1 Neue“-Button in der TopBar ist auf allen Routes sichtbar; das Panel wird nur gerendert, wenn der User auf `/` (Dashboard) ist.

---

## 11. Reihenfolge für Trace (Real ESP)

```
1. ESP32 Heartbeat → Server
2. Server: device_discovered Broadcast (WebSocket)
3. esp.store: handleDeviceDiscovered → pendingDevices.push(), toast
4. dashboard.store: pendingCount (via watch in DashboardView)
5. TopBar: "✨ X Neue" sichtbar
6. User klickt → showPendingPanel = true
7. PendingDevicesPanel: v-if="isOpen", fetchPendingDevices()
8. API: GET /esp/devices/pending
9. User klickt "Genehmigen" → approveDevice()
10. API: POST /esp/devices/{id}/approve
11. WebSocket: device_approved → handleDeviceApproved, fetchAll()
12. User klickt "Ablehnen" → RejectDeviceModal → rejectDevice()
13. API: POST /esp/devices/{id}/reject
14. WebSocket: device_rejected → handleDeviceRejected
```

---

## 12. Reihenfolge für Trace (Mock ESP)

```
1. User klickt "+ Mock" (TopBar) oder "Gerät erstellen" (EmptyState)
2. dashStore.showCreateMock = true
3. CreateMockEspModal: v-model, Formular
4. User klickt "Erstellen" → espStore.createDevice()
5. API: POST /esp/devices (Mock-Create)
6. @created → espStore.fetchAll(), Modal schließen
```

---

## 13. Tests (Referenz)

| Pfad | Typ |
|------|-----|
| `tests/unit/stores/esp.test.ts` | fetchPendingDevices, approveDevice, rejectDevice |
| `tests/unit/utils/eventTypeIcons.test.ts` | device_discovered Icon |
| `tests/unit/utils/eventTransformer.test.ts` | device_discovered Transform |
| `tests/e2e/scenarios/esp-registration-flow.spec.ts` | E2E: Pending Panel, Approve |
| `tests/e2e/scenarios/device-discovery.spec.ts` | E2E: Device Discovery |
| `tests/mocks/websocket.ts` | device_discovered Mock |

---

## 14. Checkliste für vollständige Analyse

- [ ] DashboardView: onMounted, watch pendingCount, PendingDevicesPanel/CreateMockEspModal Binding
- [ ] TopBar: showControls, hasPendingDevices, showPendingPanel/showCreateMock
- [ ] PendingDevicesPanel: updatePosition, Teleport, Tabs, approve/reject
- [ ] RejectDeviceModal: reason, confirm/cancel
- [ ] esp.store: fetchPendingDevices, approveDevice, rejectDevice, WebSocket-Handler
- [ ] dashboard.store: showPendingPanel, showCreateMock, pendingCount, activate
- [ ] API esp.ts: getPendingDevices, approveDevice, rejectDevice
- [ ] useWebSocket / websocketService: Subscription für device_discovered etc.
- [ ] CreateMockEspModal: createDevice, Formular
- [ ] Types: PendingESPDevice, ESPApprovalRequest, ESPRejectionRequest
