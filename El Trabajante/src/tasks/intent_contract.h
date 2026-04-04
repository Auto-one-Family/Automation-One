#pragma once

#include <Arduino.h>
#include <stdint.h>

static const size_t INTENT_ID_MAX_LEN = 64;
static const size_t CORRELATION_ID_MAX_LEN = 64;

struct IntentMetadata {
    char intent_id[INTENT_ID_MAX_LEN];
    char correlation_id[CORRELATION_ID_MAX_LEN];
    uint32_t generation;
    uint32_t created_at_ms;
    uint32_t ttl_ms;
    uint32_t epoch_at_accept;
};

enum class IntentInvalidationReason : uint8_t {
    NONE = 0,
    SAFETY_EPOCH_INVALIDATED = 1,
    TTL_EXPIRED = 2
};

void initIntentMetadata(IntentMetadata* metadata);
IntentMetadata extractIntentMetadataFromPayload(const char* payload, const char* fallback_prefix);
IntentMetadata extractIntentMetadataFromPayloadNoCorrelationFallback(const char* payload,
                                                                     const char* fallback_prefix);
bool isIntentExpired(const IntentMetadata& metadata, uint32_t current_epoch);
IntentInvalidationReason getIntentInvalidationReason(const IntentMetadata& metadata, uint32_t current_epoch);
bool isRecoveryIntentAllowed(const char* topic, const char* payload);

bool publishIntentOutcome(const char* flow,
                          const IntentMetadata& metadata,
                          const char* outcome,
                          const char* code,
                          const String& reason,
                          bool retryable);
void processIntentOutcomeOutbox();

uint32_t getSafetyEpoch();
uint32_t bumpSafetyEpoch(const char* reason);
