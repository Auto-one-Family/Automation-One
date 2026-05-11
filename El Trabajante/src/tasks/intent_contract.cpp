#include "intent_contract.h"

#include <ArduinoJson.h>
#include <Preferences.h>
#include <atomic>
#include <cstring>
#include <esp_log.h>
#include <freertos/portmacro.h>
#include <freertos/semphr.h>
#include <freertos/task.h>

#include "../services/communication/mqtt_client.h"
#include "../utils/logger.h"
#include "../utils/time_manager.h"
#include "../utils/topic_builder.h"
#ifndef MQTT_USE_PUBSUBCLIENT
#include "publish_queue.h"
#endif

static const char* IC_TAG = "INTENT";
static std::atomic<uint32_t> s_intent_fallback_counter{0};
static std::atomic<uint32_t> s_corr_fallback_counter{0};
static std::atomic<uint32_t> s_safety_epoch{0};
static constexpr uint8_t INTENT_FINAL_STORE_CAPACITY = 32;
// Queue-pressure can generate >30 terminal outcomes in short bursts.
// Keep enough NVS replay slots so critical terminals are not evicted immediately.
static constexpr uint8_t OUTCOME_OUTBOX_CAPACITY = 48;
static constexpr uint8_t OUTCOME_OUTBOX_RETRY_LIMIT = 5;
static Preferences s_outcome_outbox_prefs;
static bool s_outbox_stats_loaded = false;
static uint32_t s_outcome_retry_count = 0;
static uint32_t s_outcome_recovered_count = 0;
static uint32_t s_outcome_drop_count_critical = 0;
static uint32_t s_outcome_final_confirmed_count = 0;
static const char* kOutboxStatRetryTotalKey = "retry_total";
static const char* kOutboxStatRecoveredTotalKey = "recovered_total";
static const char* kOutboxStatDropTotalKey = "drop_total";
// NVS keys are limited in length, keep this short.
static const char* kOutboxStatFinalConfirmedTotalKey = "fin_ok_total";
static SemaphoreHandle_t s_outbox_mutex = nullptr;
static portMUX_TYPE s_outbox_mutex_init_mux = portMUX_INITIALIZER_UNLOCKED;

struct IntentFinalEntry {
    char intent_id[INTENT_ID_MAX_LEN];
    char final_outcome[16];
    uint32_t final_ts;
    bool valid;
};

static IntentFinalEntry s_intent_final_store[INTENT_FINAL_STORE_CAPACITY] = {};
static uint8_t s_intent_final_write_index = 0;
static portMUX_TYPE s_intent_final_mux = portMUX_INITIALIZER_UNLOCKED;

struct PendingOutcomeEntry {
    char flow[16];
    IntentMetadata metadata;
    char outcome[16];
    char code[64];
    char reason[160];
    bool retryable;
    uint8_t attempt;
};

static bool isTerminalOutcome(const char* outcome) {
    if (outcome == nullptr) {
        return true;
    }
    return strcmp(outcome, "accepted") != 0 && strcmp(outcome, "processing") != 0;
}

static bool isCriticalOutcomeClass(const char* flow, const char* outcome) {
    if (isTerminalOutcome(outcome)) {
        return true;
    }
    if (flow != nullptr && strcmp(flow, "publish") == 0) {
        return true;
    }
    return flow != nullptr && strcmp(flow, "command") == 0 &&
           outcome != nullptr && strcmp(outcome, "applied") == 0;
}

static int findFinalIntentEntry(const char* intent_id) {
    if (intent_id == nullptr || strlen(intent_id) == 0) {
        return -1;
    }
    for (uint8_t i = 0; i < INTENT_FINAL_STORE_CAPACITY; i++) {
        if (!s_intent_final_store[i].valid) {
            continue;
        }
        if (strcmp(s_intent_final_store[i].intent_id, intent_id) == 0) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

// Arduino Preferences::remove() logs ERROR when the key is absent; eviction/clear must be idempotent.
static void prefsRemoveIfPresent(Preferences& prefs, const char* key) {
    if (key == nullptr || !prefs.isKey(key)) {
        return;
    }
    prefs.remove(key);
}

static const char* mapLegacyStatus(const char* normalized_outcome) {
    if (normalized_outcome == nullptr) {
        return "failed";
    }
    if (strcmp(normalized_outcome, "persisted") == 0) {
        return "success";
    }
    if (strcmp(normalized_outcome, "accepted") == 0 || strcmp(normalized_outcome, "applied") == 0) {
        return "processing";
    }
    return normalized_outcome;
}

static String buildFallbackId(const char* prefix, std::atomic<uint32_t>& counter_ref) {
    uint32_t idx = counter_ref.fetch_add(1) + 1;
    String p = prefix != nullptr ? String(prefix) : String("fw");
    return p + "_" + String(millis()) + "_" + String(idx);
}

static SemaphoreHandle_t getOutboxMutex() {
    if (s_outbox_mutex != nullptr) {
        return s_outbox_mutex;
    }
    portENTER_CRITICAL(&s_outbox_mutex_init_mux);
    if (s_outbox_mutex == nullptr) {
        s_outbox_mutex = xSemaphoreCreateMutex();
    }
    portEXIT_CRITICAL(&s_outbox_mutex_init_mux);
    return s_outbox_mutex;
}

static bool acquireOutboxLock(TickType_t wait_ticks = pdMS_TO_TICKS(200)) {
    if (xTaskGetSchedulerState() == taskSCHEDULER_NOT_STARTED) {
        // setup()-Phase: single-threaded path, no mutex required.
        return true;
    }
    SemaphoreHandle_t mutex = getOutboxMutex();
    if (mutex == nullptr) {
        return false;
    }
    return xSemaphoreTake(mutex, wait_ticks) == pdTRUE;
}

static void releaseOutboxLock() {
    if (xTaskGetSchedulerState() == taskSCHEDULER_NOT_STARTED) {
        return;
    }
    if (s_outbox_mutex != nullptr) {
        xSemaphoreGive(s_outbox_mutex);
    }
}

class OutboxLockGuard {
public:
    explicit OutboxLockGuard(TickType_t wait_ticks = pdMS_TO_TICKS(200))
        : locked_(acquireOutboxLock(wait_ticks)) {}
    ~OutboxLockGuard() {
        if (locked_) {
            releaseOutboxLock();
        }
    }
    bool locked() const { return locked_; }

private:
    bool locked_;
};

static bool beginOutcomeOutboxPrefs(bool read_only) {
    esp_log_level_set("Preferences", ESP_LOG_NONE);
    esp_log_level_set("Preferences.cpp", ESP_LOG_NONE);
    bool ok = s_outcome_outbox_prefs.begin("io_outbox", read_only);
    esp_log_level_set("Preferences", ESP_LOG_WARN);
    esp_log_level_set("Preferences.cpp", ESP_LOG_WARN);
    return ok;
}

static String outboxKey(uint8_t idx, const char* suffix) {
    return "s" + String(idx) + "_" + String(suffix);
}

static void loadOutboxStatsLocked() {
    if (s_outbox_stats_loaded) {
        return;
    }
    if (!beginOutcomeOutboxPrefs(true)) {
        s_outbox_stats_loaded = true;
        return;
    }
    s_outcome_retry_count = s_outcome_outbox_prefs.getUInt(kOutboxStatRetryTotalKey, 0);
    s_outcome_recovered_count = s_outcome_outbox_prefs.getUInt(kOutboxStatRecoveredTotalKey, 0);
    s_outcome_drop_count_critical = s_outcome_outbox_prefs.getUInt(kOutboxStatDropTotalKey, 0);
    s_outcome_final_confirmed_count =
        s_outcome_outbox_prefs.getUInt(kOutboxStatFinalConfirmedTotalKey, 0);
    s_outcome_outbox_prefs.end();
    s_outbox_stats_loaded = true;
}

static void loadOutboxStatsIfNeeded() {
    OutboxLockGuard guard;
    if (!guard.locked()) {
        LOG_W(IC_TAG, "Outbox stats lock timeout (load)");
        return;
    }
    loadOutboxStatsLocked();
}

static void persistOutboxStats() {
    OutboxLockGuard guard;
    if (!guard.locked()) {
        LOG_W(IC_TAG, "Outbox stats lock timeout (persist)");
        return;
    }
    if (!beginOutcomeOutboxPrefs(false)) {
        return;
    }
    s_outcome_outbox_prefs.putUInt(kOutboxStatRetryTotalKey, s_outcome_retry_count);
    s_outcome_outbox_prefs.putUInt(kOutboxStatRecoveredTotalKey, s_outcome_recovered_count);
    s_outcome_outbox_prefs.putUInt(kOutboxStatDropTotalKey, s_outcome_drop_count_critical);
    s_outcome_outbox_prefs.putUInt(kOutboxStatFinalConfirmedTotalKey,
                                   s_outcome_final_confirmed_count);
    s_outcome_outbox_prefs.end();
}

static bool saveOutboxEntryAt(uint8_t idx, const PendingOutcomeEntry& entry) {
    s_outcome_outbox_prefs.putString(outboxKey(idx, "flow").c_str(), String(entry.flow));
    s_outcome_outbox_prefs.putString(outboxKey(idx, "intent").c_str(), String(entry.metadata.intent_id));
    s_outcome_outbox_prefs.putString(outboxKey(idx, "corr").c_str(), String(entry.metadata.correlation_id));
    s_outcome_outbox_prefs.putUInt(outboxKey(idx, "gen").c_str(), entry.metadata.generation);
    s_outcome_outbox_prefs.putUInt(outboxKey(idx, "created").c_str(), entry.metadata.created_at_ms);
    s_outcome_outbox_prefs.putUInt(outboxKey(idx, "ttl").c_str(), entry.metadata.ttl_ms);
    s_outcome_outbox_prefs.putUInt(outboxKey(idx, "epoch").c_str(), entry.metadata.epoch_at_accept);
    s_outcome_outbox_prefs.putString(outboxKey(idx, "outcome").c_str(), String(entry.outcome));
    s_outcome_outbox_prefs.putString(outboxKey(idx, "code").c_str(), String(entry.code));
    s_outcome_outbox_prefs.putString(outboxKey(idx, "reason").c_str(), String(entry.reason));
    s_outcome_outbox_prefs.putBool(outboxKey(idx, "retryable").c_str(), entry.retryable);
    s_outcome_outbox_prefs.putUChar(outboxKey(idx, "attempt").c_str(), entry.attempt);
    return true;
}

static bool loadOutboxEntryAt(uint8_t idx, PendingOutcomeEntry* entry_out) {
    if (entry_out == nullptr) {
        return false;
    }
    String intent = s_outcome_outbox_prefs.getString(outboxKey(idx, "intent").c_str(), "");
    if (intent.length() == 0) {
        return false;
    }
    memset(entry_out, 0, sizeof(PendingOutcomeEntry));
    String flow = s_outcome_outbox_prefs.getString(outboxKey(idx, "flow").c_str(), "unknown");
    String corr = s_outcome_outbox_prefs.getString(outboxKey(idx, "corr").c_str(), "");
    String outcome = s_outcome_outbox_prefs.getString(outboxKey(idx, "outcome").c_str(), "failed");
    String code = s_outcome_outbox_prefs.getString(outboxKey(idx, "code").c_str(), "EXECUTE_FAIL");
    String reason = s_outcome_outbox_prefs.getString(outboxKey(idx, "reason").c_str(), "Pending outcome replay");

    strncpy(entry_out->flow, flow.c_str(), sizeof(entry_out->flow) - 1);
    strncpy(entry_out->metadata.intent_id, intent.c_str(), sizeof(entry_out->metadata.intent_id) - 1);
    strncpy(entry_out->metadata.correlation_id, corr.c_str(), sizeof(entry_out->metadata.correlation_id) - 1);
    entry_out->metadata.generation = s_outcome_outbox_prefs.getUInt(outboxKey(idx, "gen").c_str(), 0);
    entry_out->metadata.created_at_ms = s_outcome_outbox_prefs.getUInt(outboxKey(idx, "created").c_str(), millis());
    entry_out->metadata.ttl_ms = s_outcome_outbox_prefs.getUInt(outboxKey(idx, "ttl").c_str(), 0);
    entry_out->metadata.epoch_at_accept = s_outcome_outbox_prefs.getUInt(outboxKey(idx, "epoch").c_str(), 0);
    strncpy(entry_out->outcome, outcome.c_str(), sizeof(entry_out->outcome) - 1);
    strncpy(entry_out->code, code.c_str(), sizeof(entry_out->code) - 1);
    strncpy(entry_out->reason, reason.c_str(), sizeof(entry_out->reason) - 1);
    entry_out->retryable = s_outcome_outbox_prefs.getBool(outboxKey(idx, "retryable").c_str(), true);
    entry_out->attempt = s_outcome_outbox_prefs.getUChar(outboxKey(idx, "attempt").c_str(), 1);
    return true;
}

static void clearOutboxEntryAt(uint8_t idx) {
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "flow").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "intent").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "corr").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "gen").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "created").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "ttl").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "epoch").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "outcome").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "code").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "reason").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "retryable").c_str());
    prefsRemoveIfPresent(s_outcome_outbox_prefs, outboxKey(idx, "attempt").c_str());
}

static bool enqueueCriticalOutcome(const PendingOutcomeEntry& entry) {
    OutboxLockGuard guard;
    if (!guard.locked()) {
        LOG_E(IC_TAG, "Outbox lock timeout while enqueueing critical outcome");
        return false;
    }
    loadOutboxStatsLocked();
    if (!beginOutcomeOutboxPrefs(false)) {
        return false;
    }
    uint8_t head = s_outcome_outbox_prefs.getUChar("head", 0);
    uint8_t count = s_outcome_outbox_prefs.getUChar("count", 0);

    // P0 Strategy A: NVS outcome outbox full → evict oldest pending replay slot so a new
    // critical outcome is never silently dropped. Superseded entry is counted in
    // outcome_drop_count_critical (heartbeat + outcome payload telemetry).
    if (count >= OUTCOME_OUTBOX_CAPACITY) {
        clearOutboxEntryAt(head);
        head = static_cast<uint8_t>((head + 1) % OUTCOME_OUTBOX_CAPACITY);
        count--;
        s_outcome_drop_count_critical++;
        LOG_W(IC_TAG,
              "Critical outcome outbox full — evicted oldest NVS slot to enqueue new critical");
        s_outcome_outbox_prefs.putUInt(kOutboxStatDropTotalKey, s_outcome_drop_count_critical);
    }

    uint8_t idx = static_cast<uint8_t>((head + count) % OUTCOME_OUTBOX_CAPACITY);
    saveOutboxEntryAt(idx, entry);
    s_outcome_outbox_prefs.putUChar("head", head);
    s_outcome_outbox_prefs.putUChar("count", static_cast<uint8_t>(count + 1));
    s_outcome_outbox_prefs.end();
    return true;
}

static bool buildOutcomePayload(const char* flow,
                                const IntentMetadata& metadata,
                                const char* normalized_outcome,
                                const char* code,
                                const String& reason,
                                bool retryable,
                                bool critical,
                                uint8_t retry_count,
                                bool recovered,
                                String* payload_out) {
    if (payload_out == nullptr) {
        return false;
    }

    // 26 fields × 12 bytes/slot = 312, plus ~463 bytes for key+value strings.
    // Using 1024 gives a safe 250-byte margin against overflow-silent field drops.
    DynamicJsonDocument doc(1024);
    doc["seq"] = mqttClient.getNextSeq();
    doc["flow"] = flow != nullptr ? flow : "unknown";
    doc["intent_id"] = metadata.intent_id;
    doc["correlation_id"] = metadata.correlation_id;
    doc["generation"] = metadata.generation;
    doc["created_at_ms"] = metadata.created_at_ms;
    doc["ttl_ms"] = metadata.ttl_ms;
    doc["epoch"] = metadata.epoch_at_accept;
    doc["outcome"] = normalized_outcome;
    doc["contract_version"] = 2;
    doc["semantic_mode"] = "target";
    doc["legacy_status"] = mapLegacyStatus(normalized_outcome);
    doc["target_status"] = normalized_outcome;
    doc["code"] = code != nullptr ? code : "UNKNOWN_ERROR";
    doc["reason"] = reason;
    doc["retryable"] = retryable;
    doc["critical"] = critical;
    doc["retry_limit"] = OUTCOME_OUTBOX_RETRY_LIMIT;
    doc["retry_count"] = retry_count;
    doc["recovered"] = recovered;
    doc["delivery_mode"] = recovered ? "recovered" : "direct";
    doc["outcome_retry_count"] = s_outcome_retry_count;
    doc["outcome_recovered_count"] = s_outcome_recovered_count;
    doc["outcome_drop_count_critical"] = s_outcome_drop_count_critical;
    doc["outcome_final_confirmed_count"] = s_outcome_final_confirmed_count;
    doc["ts"] = static_cast<unsigned long>(timeManager.getUnixTimestamp());

    payload_out->clear();
    size_t written = serializeJson(doc, *payload_out);
    return written > 0 && payload_out->length() > 0;
}

void processIntentOutcomeOutbox() {
    OutboxLockGuard guard;
    if (!guard.locked()) {
        LOG_W(IC_TAG, "Outbox lock timeout during replay");
        return;
    }
    loadOutboxStatsLocked();
    if (!mqttClient.isConnected()) {
        return;
    }
    // AUT-56 hardening: do not consume replay attempts while registration gate is closed.
    // During reconnect windows safePublish() would fail with REGISTRATION_PENDING/timeout,
    // which previously increased attempt counters and could evict critical outcomes before
    // the first valid heartbeat ACK reopened the gate.
    if (!mqttClient.isRegistrationConfirmed()) {
        return;
    }
    if (!beginOutcomeOutboxPrefs(false)) {
        return;
    }

    uint8_t head = s_outcome_outbox_prefs.getUChar("head", 0);
    uint8_t count = s_outcome_outbox_prefs.getUChar("count", 0);
    bool changed = false;
    uint8_t processed = 0;
    String topic = TopicBuilder::buildIntentOutcomeTopic();

    while (count > 0 && processed < 2) {
        PendingOutcomeEntry entry;
        if (!loadOutboxEntryAt(head, &entry)) {
            clearOutboxEntryAt(head);
            head = static_cast<uint8_t>((head + 1) % OUTCOME_OUTBOX_CAPACITY);
            count--;
            changed = true;
            processed++;
            continue;
        }

        String replay_payload;
        if (!buildOutcomePayload(entry.flow,
                                 entry.metadata,
                                 entry.outcome,
                                 entry.code,
                                 String(entry.reason),
                                 entry.retryable,
                                 true,
                                 entry.attempt,
                                 true,
                                 &replay_payload)) {
            clearOutboxEntryAt(head);
            head = static_cast<uint8_t>((head + 1) % OUTCOME_OUTBOX_CAPACITY);
            count--;
            changed = true;
            processed++;
            continue;
        }

        if (mqttClient.safePublish(topic, replay_payload, 1, 1)) {
            recordIntentChainStage(entry.metadata,
                                   "outcome_publish_ok",
                                   entry.flow,
                                   entry.code,
                                   "[INC-EA5484] critical outcome replay delivered");
            clearOutboxEntryAt(head);
            head = static_cast<uint8_t>((head + 1) % OUTCOME_OUTBOX_CAPACITY);
            count--;
            s_outcome_recovered_count++;
            s_outcome_final_confirmed_count++;
            changed = true;
            processed++;
            continue;
        }

        s_outcome_retry_count++;
        if (entry.attempt >= OUTCOME_OUTBOX_RETRY_LIMIT) {
            s_outcome_drop_count_critical++;
            clearOutboxEntryAt(head);
            head = static_cast<uint8_t>((head + 1) % OUTCOME_OUTBOX_CAPACITY);
            count--;
            changed = true;
            processed++;
            continue;
        }
        entry.attempt++;
        saveOutboxEntryAt(head, entry);
        changed = true;
        break;
    }

    if (changed) {
        s_outcome_outbox_prefs.putUChar("head", head);
        s_outcome_outbox_prefs.putUChar("count", count);
        s_outcome_outbox_prefs.putUInt(kOutboxStatRetryTotalKey, s_outcome_retry_count);
        s_outcome_outbox_prefs.putUInt(kOutboxStatRecoveredTotalKey, s_outcome_recovered_count);
        s_outcome_outbox_prefs.putUInt(kOutboxStatDropTotalKey, s_outcome_drop_count_critical);
        s_outcome_outbox_prefs.putUInt(kOutboxStatFinalConfirmedTotalKey,
                                       s_outcome_final_confirmed_count);
    }
    s_outcome_outbox_prefs.end();
}

void initIntentMetadata(IntentMetadata* metadata) {
    if (metadata == nullptr) {
        return;
    }
    memset(metadata->intent_id, 0, sizeof(metadata->intent_id));
    memset(metadata->correlation_id, 0, sizeof(metadata->correlation_id));
    metadata->generation = 0;
    metadata->created_at_ms = millis();
    metadata->ttl_ms = 0;
    metadata->epoch_at_accept = getSafetyEpoch();
}

static IntentMetadata extractIntentMetadataFromPayloadInternal(const char* payload,
                                                               const char* fallback_prefix,
                                                               bool allow_correlation_fallback) {
    IntentMetadata metadata;
    initIntentMetadata(&metadata);

    // Contract: primary fields are top-level (intent_id, correlation_id, generation, …).
    // Optional nested mirror under "data" is supported when the server wraps metadata
    // (data.intent_id, data.correlation_id, …). Top-level wins if both are present.
    // 384 B was too tight for some large config payloads and caused false-negative
    // "missing correlation_id" contract violations.
    StaticJsonDocument<1024> doc;
    StaticJsonDocument<256> filter;
    filter["intent_id"] = true;
    filter["correlation_id"] = true;
    filter["generation"] = true;
    filter["created_at_ms"] = true;
    filter["ttl_ms"] = true;
    filter["data"]["intent_id"] = true;
    filter["data"]["correlation_id"] = true;
    filter["data"]["generation"] = true;
    filter["data"]["created_at_ms"] = true;
    filter["data"]["ttl_ms"] = true;
    bool parsed = false;
    if (payload != nullptr && strlen(payload) > 0) {
        DeserializationError err = deserializeJson(doc,
                                                   payload,
                                                   DeserializationOption::Filter(filter));
        parsed = !err;
    }

    if (parsed) {
        JsonObject data_obj = doc["data"].as<JsonObject>();
        String intent_id = doc["intent_id"] | "";
        if (intent_id.length() == 0 && !data_obj.isNull()) {
            intent_id = data_obj["intent_id"] | "";
        }
        String corr_id = doc["correlation_id"] | "";
        if (corr_id.length() == 0 && !data_obj.isNull()) {
            corr_id = data_obj["correlation_id"] | "";
        }
        metadata.generation = doc["generation"] | 0;
        if (metadata.generation == 0 && !data_obj.isNull()) {
            metadata.generation = data_obj["generation"] | 0;
        }
        {
            uint32_t default_now = static_cast<uint32_t>(millis());
            if (!doc["created_at_ms"].isNull()) {
                metadata.created_at_ms = doc["created_at_ms"].as<uint32_t>();
            } else if (!data_obj.isNull() && !data_obj["created_at_ms"].isNull()) {
                metadata.created_at_ms = data_obj["created_at_ms"].as<uint32_t>();
            } else {
                metadata.created_at_ms = default_now;
            }
        }
        metadata.ttl_ms = doc["ttl_ms"] | 0;
        if (metadata.ttl_ms == 0 && !data_obj.isNull()) {
            metadata.ttl_ms = data_obj["ttl_ms"] | 0;
        }

        if (intent_id.length() == 0) {
            intent_id = buildFallbackId(fallback_prefix, s_intent_fallback_counter);
        }
        if (allow_correlation_fallback && corr_id.length() == 0) {
            corr_id = buildFallbackId("corr", s_corr_fallback_counter);
        }

        strncpy(metadata.intent_id, intent_id.c_str(), sizeof(metadata.intent_id) - 1);
        metadata.intent_id[sizeof(metadata.intent_id) - 1] = '\0';
        strncpy(metadata.correlation_id, corr_id.c_str(), sizeof(metadata.correlation_id) - 1);
        metadata.correlation_id[sizeof(metadata.correlation_id) - 1] = '\0';
    } else {
        String intent_id = buildFallbackId(fallback_prefix, s_intent_fallback_counter);
        strncpy(metadata.intent_id, intent_id.c_str(), sizeof(metadata.intent_id) - 1);
        metadata.intent_id[sizeof(metadata.intent_id) - 1] = '\0';
        if (allow_correlation_fallback) {
            String corr_id = buildFallbackId("corr", s_corr_fallback_counter);
            strncpy(metadata.correlation_id, corr_id.c_str(), sizeof(metadata.correlation_id) - 1);
            metadata.correlation_id[sizeof(metadata.correlation_id) - 1] = '\0';
        }
    }

    metadata.epoch_at_accept = getSafetyEpoch();
    return metadata;
}

IntentMetadata extractIntentMetadataFromPayload(const char* payload, const char* fallback_prefix) {
    return extractIntentMetadataFromPayloadInternal(payload, fallback_prefix, true);
}

IntentMetadata extractIntentMetadataFromPayloadNoCorrelationFallback(const char* payload,
                                                                     const char* fallback_prefix) {
    return extractIntentMetadataFromPayloadInternal(payload, fallback_prefix, false);
}

IntentInvalidationReason getIntentInvalidationReason(const IntentMetadata& metadata, uint32_t current_epoch) {
    if (metadata.epoch_at_accept != current_epoch) {
        return IntentInvalidationReason::SAFETY_EPOCH_INVALIDATED;
    }
    if (metadata.ttl_ms == 0) {
        return IntentInvalidationReason::NONE;
    }
    uint32_t now = millis();
    if (now > metadata.created_at_ms && (now - metadata.created_at_ms) > metadata.ttl_ms) {
        return IntentInvalidationReason::TTL_EXPIRED;
    }
    return IntentInvalidationReason::NONE;
}

bool isIntentExpired(const IntentMetadata& metadata, uint32_t current_epoch) {
    return getIntentInvalidationReason(metadata, current_epoch) != IntentInvalidationReason::NONE;
}

bool isRecoveryIntentAllowed(const char* topic, const char* payload) {
    if (topic == nullptr || payload == nullptr) {
        return false;
    }
    String t(topic);
    if (t.indexOf("/actuator/emergency") == -1) {
        return false;
    }
    StaticJsonDocument<192> doc;
    if (deserializeJson(doc, payload)) {
        return false;
    }
    String cmd = doc["command"] | "";
    return cmd == "clear_emergency";
}

void recordIntentChainStage(const IntentMetadata& metadata,
                            const char* stage,
                            const char* flow,
                            const char* code,
                            const char* detail) {
    if (stage == nullptr || strlen(stage) == 0 || strlen(metadata.intent_id) == 0) {
        return;
    }

    DynamicJsonDocument event_doc(512);
    event_doc["seq"] = mqttClient.getNextSeq();
    event_doc["event_type"] = "intent_chain_stage";
    event_doc["schema"] = "intent_chain_stage_v1";
    event_doc["flow"] = flow != nullptr ? flow : "command";
    event_doc["stage"] = stage;
    event_doc["intent_id"] = metadata.intent_id;
    event_doc["correlation_id"] = metadata.correlation_id;
    event_doc["generation"] = metadata.generation;
    event_doc["epoch"] = metadata.epoch_at_accept;
    if (code != nullptr && strlen(code) > 0) {
        event_doc["code"] = code;
    }
    if (detail != nullptr && strlen(detail) > 0) {
        event_doc["detail"] = detail;
    }
    event_doc["ts"] = static_cast<unsigned long>(timeManager.getUnixTimestamp());

    String payload;
    if (serializeJson(event_doc, payload) > 0) {
#ifndef MQTT_USE_PUBSUBCLIENT
        // [INC-EA5484] AUT-56: Route lifecycle through publish queue for retry resilience.
        const char* lifecycle_topic = TopicBuilder::buildIntentOutcomeLifecycleTopic();
        if (!queuePublish(lifecycle_topic, payload.c_str(), 1, false, true, nullptr)) {
            LOG_W(IC_TAG, "[INC-EA5484] Lifecycle chain-stage enqueue failed: " + String(stage));
        }
#else
        mqttClient.publish(TopicBuilder::buildIntentOutcomeLifecycleTopic(), payload, 1);
#endif
    }
}

bool publishIntentOutcome(const char* flow,
                          const IntentMetadata& metadata,
                          const char* outcome,
                          const char* code,
                          const String& reason,
                          bool retryable) {
    loadOutboxStatsIfNeeded();
    const char* normalized_outcome = outcome != nullptr ? outcome : "failed";

    // Defensive guard: intent_id must never be empty in the published payload.
    // An empty intent_id (e.g. from NVS migration, corruption or missing field) causes
    // permanent server-side rejection ("Missing required field: intent_id").
    // Generate a fallback so the event is at least traceable rather than silently broken.
    IntentMetadata safe_metadata = metadata;
    if (strlen(safe_metadata.intent_id) == 0) {
        String fallback = buildFallbackId(flow != nullptr ? flow : "unknown",
                                         s_intent_fallback_counter);
        strncpy(safe_metadata.intent_id, fallback.c_str(), sizeof(safe_metadata.intent_id) - 1);
        safe_metadata.intent_id[sizeof(safe_metadata.intent_id) - 1] = '\0';
        LOG_W(IC_TAG, String("publishIntentOutcome: empty intent_id — generated fallback [") +
                      String(safe_metadata.intent_id) + "] flow=" +
                      String(flow != nullptr ? flow : "null") +
                      " outcome=" + String(normalized_outcome));
    }
    const IntentMetadata& active_metadata = safe_metadata;
    bool command_flow = flow != nullptr && strcmp(flow, "command") == 0;
    if (command_flow) {
        recordIntentChainStage(active_metadata,
                               "outcome_publish_attempted",
                               flow,
                               code,
                               "attempting outcome publish");
    }
    bool critical = isCriticalOutcomeClass(flow, normalized_outcome);
    if (isTerminalOutcome(normalized_outcome)) {
        bool allow_publish = true;
        bool regression_blocked = false;
        char previous_final_outcome[16] = {0};
        portENTER_CRITICAL(&s_intent_final_mux);
        int existing_idx = findFinalIntentEntry(active_metadata.intent_id);
        if (existing_idx >= 0) {
            if (strcmp(s_intent_final_store[existing_idx].final_outcome, normalized_outcome) == 0) {
                allow_publish = false;
            } else {
                allow_publish = false;
                regression_blocked = true;
                strncpy(previous_final_outcome,
                        s_intent_final_store[existing_idx].final_outcome,
                        sizeof(previous_final_outcome) - 1);
            }
        } else {
            IntentFinalEntry& slot = s_intent_final_store[s_intent_final_write_index];
            memset(&slot, 0, sizeof(slot));
            strncpy(slot.intent_id, active_metadata.intent_id, sizeof(slot.intent_id) - 1);
            strncpy(slot.final_outcome, normalized_outcome, sizeof(slot.final_outcome) - 1);
            slot.final_ts = millis();
            slot.valid = true;
            s_intent_final_write_index = static_cast<uint8_t>((s_intent_final_write_index + 1) % INTENT_FINAL_STORE_CAPACITY);
        }
        portEXIT_CRITICAL(&s_intent_final_mux);
        if (regression_blocked) {
            LOG_W(IC_TAG, "Intent final outcome regression blocked [" +
                          String(active_metadata.intent_id) + "] old=" +
                          String(previous_final_outcome) +
                          " new=" + String(normalized_outcome));
        }
        if (!allow_publish) {
            return !regression_blocked;
        }
    }

    String payload;
    if (!buildOutcomePayload(flow,
                             active_metadata,
                             normalized_outcome,
                             code,
                             reason,
                             retryable,
                             critical,
                             0,
                             false,
                             &payload)) {
        LOG_E(IC_TAG, "Failed to serialize intent outcome payload");
        return false;
    }

    // Replay pending critical outcomes first when broker is reachable.
    processIntentOutcomeOutbox();

    String topic = TopicBuilder::buildIntentOutcomeTopic();
    bool ok = mqttClient.safePublish(topic, payload, 1);
    bool persisted_for_replay = false;
    if (ok) {
        if (command_flow) {
            recordIntentChainStage(active_metadata,
                                   "outcome_publish_ok",
                                   flow,
                                   code,
                                   "outcome publish delivered");
        }
        s_outcome_final_confirmed_count++;
        persistOutboxStats();
    }
    if (!ok) {
        if (command_flow) {
            recordIntentChainStage(active_metadata,
                                   "outcome_publish_failed",
                                   flow,
                                   code,
                                   "outcome publish failed");
        }
        LOG_W(IC_TAG, "[INC-EA5484] Intent outcome publish failed [" + String(active_metadata.intent_id) + "]");
        if (critical) {
            PendingOutcomeEntry entry = {};
            strncpy(entry.flow, flow != nullptr ? flow : "unknown", sizeof(entry.flow) - 1);
            entry.metadata = active_metadata;
            strncpy(entry.outcome, normalized_outcome, sizeof(entry.outcome) - 1);
            strncpy(entry.code, code != nullptr ? code : "UNKNOWN_ERROR", sizeof(entry.code) - 1);
            strncpy(entry.reason, reason.c_str(), sizeof(entry.reason) - 1);
            entry.retryable = retryable;
            entry.attempt = 1;

            s_outcome_retry_count++;
            if (!enqueueCriticalOutcome(entry)) {
                s_outcome_drop_count_critical++;
                LOG_E(IC_TAG, "[INC-EA5484] Critical outcome NVS persist failed after eviction attempt [" +
                                  String(active_metadata.intent_id) + "]");
            } else {
                persisted_for_replay = true;
                LOG_W(IC_TAG, "[INC-EA5484] Critical outcome persisted for replay [" + String(active_metadata.intent_id) + "]");
            }
            persistOutboxStats();
        }
    }
    return ok || persisted_for_replay;
}

uint32_t getSafetyEpoch() {
    return s_safety_epoch.load();
}

uint32_t bumpSafetyEpoch(const char* reason) {
    uint32_t next_epoch = s_safety_epoch.fetch_add(1) + 1;
    String msg = "Safety epoch incremented to " + String(next_epoch);
    if (reason != nullptr && strlen(reason) > 0) {
        msg += " reason=" + String(reason);
    }
    LOG_W(IC_TAG, msg);
    return next_epoch;
}

uint32_t getCriticalOutcomeDropCountTelemetry() {
    loadOutboxStatsIfNeeded();
    return s_outcome_drop_count_critical;
}
