import { describe, expect, it } from "vitest";
import {
  FEEDBACK_MANAGEMENT_COOKIE_NAME,
  FEEDBACK_MANAGEMENT_COOKIE_MAX_AGE_SECONDS,
  hasFeedbackManagementCapability,
  issueFeedbackManagementCapability,
} from "../src/lib/feedback/feedbackManagementCapability";

const NOW = Date.parse("2026-07-12T00:00:00.000Z");
const ENV = { DEV_ACTION_TOKEN: "feedback-capability-test-secret" };

function capabilityRequest(value: string): Request {
  return new Request("http://localhost:3000/api/feedback/list", {
    headers: {
      host: "localhost:3000",
      cookie: `${FEEDBACK_MANAGEMENT_COOKIE_NAME}=${value}`,
    },
  });
}

describe("feedback management capability", () => {
  it("accepts only a signed unexpired capability issued from DEV_ACTION_TOKEN", () => {
    const capability = issueFeedbackManagementCapability(ENV, NOW);
    expect(capability).not.toBeNull();
    if (!capability) return;

    expect(hasFeedbackManagementCapability(capabilityRequest(capability.value), ENV, NOW)).toBe(true);
    expect(hasFeedbackManagementCapability(
      capabilityRequest(capability.value),
      { DEV_ACTION_TOKEN: "different-secret" },
      NOW,
    )).toBe(false);
    expect(hasFeedbackManagementCapability(
      capabilityRequest(capability.value),
      ENV,
      NOW + FEEDBACK_MANAGEMENT_COOKIE_MAX_AGE_SECONDS * 1000 + 1,
    )).toBe(false);
  });

  it("fails closed when the signing secret or signed value is missing", () => {
    expect(issueFeedbackManagementCapability({}, NOW)).toBeNull();
    expect(hasFeedbackManagementCapability(capabilityRequest("1"), ENV, NOW)).toBe(false);
    expect(hasFeedbackManagementCapability(capabilityRequest("v1.9999999999999.nonce.invalid"), {}, NOW)).toBe(false);
  });
});
