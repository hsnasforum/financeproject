import { describe, expect, it } from "vitest";
import { classifyEventTypes, normalizeEventTypes } from "./classify";

describe("planning v3 news events classify", () => {
  it("classifies deterministic event types from title/snippet with entities", () => {
    const eventTypes = classifyEventTypes({
      title: "FOMC 신호 이후 USD/KRW 변동성 확대",
      snippet: "연준 발언과 유가(WTI) 반등으로 외환시장이 흔들렸습니다.",
      entities: ["central_bank_fed", "currency_usdkrw", "commodity_wti"],
    });

    expect(eventTypes).toEqual([
      "policy_rate_signal",
      "fx_volatility",
      "commodity_supply_shock",
    ]);
  });

  it("requires entity match for entity-gated rules", () => {
    const eventTypes = classifyEventTypes({
      title: "Fed 신호에도 환율 반응 제한",
      snippet: "금리와 환율 키워드가 있지만 엔티티가 없는 테스트",
      entities: [],
    });

    expect(eventTypes).toEqual([]);
  });

  it("normalizes stored event type values", () => {
    const normalized = normalizeEventTypes([
      "fx_volatility",
      "invalid_event",
      "fx_volatility",
      "policy_rate_signal",
    ]);

    expect(normalized).toEqual([
      "fx_volatility",
      "policy_rate_signal",
    ]);
  });
});
