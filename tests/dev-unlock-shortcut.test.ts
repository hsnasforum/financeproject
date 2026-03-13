import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpsDataQualityCard } from "../src/components/OpsDataQualityCard";
import { OpsPlanningFeedbackClient } from "../src/components/OpsPlanningFeedbackClient";
import { ErrorState } from "../src/components/ui/ErrorState";
import { DevUnlockShortcutMessage, isDevUnlockCsrfMessage } from "../src/components/DevUnlockShortcutLink";
import { inferFixHrefByErrorCode } from "../src/lib/ops/errorFixHref";

describe("dev unlock shortcut", () => {
  it("maps dev guard errors to /ops/rules", () => {
    expect(inferFixHrefByErrorCode("UNAUTHORIZED")).toBe("/ops/rules");
    expect(inferFixHrefByErrorCode("CSRF_MISMATCH")).toBe("/ops/rules");
    expect(inferFixHrefByErrorCode("ORIGIN_MISMATCH")).toBe("/ops/rules");
    expect(inferFixHrefByErrorCode("LOCAL_ONLY")).toBe("/ops/rules");
  });

  it("detects dev unlock/csrf warning copy", () => {
    expect(isDevUnlockCsrfMessage("Dev unlock/CSRF가 필요합니다.")).toBe(true);
    expect(isDevUnlockCsrfMessage("Dev unlock 및 CSRF 확인이 필요합니다.")).toBe(true);
    expect(isDevUnlockCsrfMessage("CSRF 토큰이 없어 export를 실행할 수 없습니다.")).toBe(true);
    expect(isDevUnlockCsrfMessage("동일 origin 요청만 허용됩니다.")).toBe(true);
    expect(isDevUnlockCsrfMessage("로컬 환경에서만 사용할 수 있습니다.")).toBe(true);
    expect(isDevUnlockCsrfMessage("Vault CSRF 토큰이 없어 실행할 수 없습니다.")).toBe(false);
  });

  it("renders /ops/rules shortcut for dev guard messages in ErrorState", () => {
    const html = renderToStaticMarkup(createElement(ErrorState, {
      message: "CSRF 토큰이 없어 export를 실행할 수 없습니다.",
    }));

    expect(html).toContain("/ops/rules");
    expect(html).toContain("/ops/rules 바로가기");
  });

  it("does not render /ops/rules shortcut for vault csrf copy in ErrorState", () => {
    const html = renderToStaticMarkup(createElement(ErrorState, {
      message: "Vault CSRF 토큰이 없어 실행할 수 없습니다.",
    }));

    expect(html).not.toContain("/ops/rules");
  });

  it("renders inline /ops/rules shortcut for generic dev guard copy", () => {
    const html = renderToStaticMarkup(createElement(DevUnlockShortcutMessage, {
      className: "text-sm",
      linkClassName: "text-sm",
      message: "Dev unlock/CSRF 확인이 필요합니다.",
    }));

    expect(html).toContain("Dev unlock/CSRF 확인이 필요합니다.");
    expect(html).toContain("/ops/rules");
  });

  it("renders /ops/rules shortcut in ops planning feedback no-csrf banner", () => {
    const html = renderToStaticMarkup(createElement(OpsPlanningFeedbackClient));

    expect(html).toContain("Dev unlock/CSRF 토큰이 없어 목록 조회/수정이 차단됩니다.");
    expect(html).toContain("/ops/rules");
  });

  it("renders /ops/rules shortcut in ops data quality no-csrf banner", () => {
    const html = renderToStaticMarkup(createElement(OpsDataQualityCard, { csrf: "" }));

    expect(html).toContain("Dev unlock/CSRF가 없어 data quality를 조회할 수 없습니다.");
    expect(html).toContain("/ops/rules");
  });
});
