#pragma once

#include <Arduino.h>
#include <functional>
#include <vector>

class MockMQTTBroker {
public:
    struct Subscription {
        String client_id;
        String topic_pattern;
        std::function<void(const String&, const String&)> callback;
    };

    struct PublishedMessage {
        String topic;
        String payload;
        unsigned long timestamp;
    };

    MockMQTTBroker() = default;

    // Subscription management ------------------------------------------------
    void subscribe(const String& client_id,
                   const String& topic_pattern,
                   std::function<void(const String&, const String&)> callback) {
        subscriptions_.push_back({client_id, topic_pattern, callback});
    }

    // Publishing -------------------------------------------------------------
    void publish(const String& topic, const String& payload) {
        published_.push_back({topic, payload, millis()});
        for (const auto& sub : subscriptions_) {
            if (topicMatches(topic, sub.topic_pattern)) {
                sub.callback(topic, payload);
            }
        }
    }

    // Test assertions --------------------------------------------------------
    bool wasPublished(const String& topic_substring) const {
        for (const auto& msg : published_) {
            if (msg.topic.indexOf(topic_substring) != -1) {
                return true;
            }
        }
        return false;
    }

    String getLastPayload(const String& topic_substring) const {
        for (int i = static_cast<int>(published_.size()) - 1; i >= 0; --i) {
            if (published_[i].topic.indexOf(topic_substring) != -1) {
                return published_[i].payload;
            }
        }
        return "";
    }

    int getPublishCount(const String& topic_substring) const {
        int count = 0;
        for (const auto& msg : published_) {
            if (msg.topic.indexOf(topic_substring) != -1) {
                count++;
            }
        }
        return count;
    }

    void clearPublished() {
        published_.clear();
    }

    const std::vector<PublishedMessage>& getPublishedMessages() const {
        return published_;
    }

private:
    std::vector<Subscription> subscriptions_;
    std::vector<PublishedMessage> published_;

    // Topic matching (MQTT 3.1.1) -------------------------------------------
    bool topicMatches(const String& topic, const String& pattern) const {
        auto split = [](const String& src) {
            std::vector<String> parts;
            int start = 0;
            while (true) {
                int slash = src.indexOf('/', start);
                if (slash == -1) {
                    parts.push_back(src.substring(start));
                    break;
                }
                parts.push_back(src.substring(start, slash));
                start = slash + 1;
            }
            return parts;
        };

        std::vector<String> tp = split(topic);
        std::vector<String> pp = split(pattern);

        for (size_t i = 0; i < pp.size(); ++i) {
            if (pp[i] == "#") {
                return true;  // multi-level wildcard matches remainder
            }
            if (pp[i] == "+") {
                if (i >= tp.size()) {
                    return false;  // wildcard expects a level
                }
                continue;
            }
            if (i >= tp.size() || tp[i] != pp[i]) {
                return false;
            }
        }
        return tp.size() == pp.size();
    }
};

