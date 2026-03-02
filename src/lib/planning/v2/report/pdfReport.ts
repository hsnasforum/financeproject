import fs from "node:fs";
import { type ResultDtoV1 } from "../resultDto";
import { renderHtmlReport } from "./htmlReport";

type RenderPdfReportOptions = {
  title?: string;
};

type PdfFailureCode = "PDF_FONT_MISSING" | "PDF_ENGINE_MISSING" | "PDF_RENDER_FAILED";

const KOREAN_FONT_CANDIDATES: Array<{ family: string; paths: string[] }> = [
  {
    family: '"Noto Sans KR", "Noto Sans CJK KR", sans-serif',
    paths: [
      "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
      "/usr/share/fonts/opentype/noto/NotoSansKR-Regular.otf",
      "/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf",
      "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
      "/Library/Fonts/NotoSansKR-Regular.otf",
    ],
  },
  {
    family: '"NanumGothic", "Apple SD Gothic Neo", sans-serif',
    paths: [
      "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
      "/usr/local/share/fonts/NanumGothic.ttf",
      "/Library/Fonts/NanumGothic.ttf",
      "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ],
  },
  {
    family: '"Malgun Gothic", sans-serif',
    paths: [
      "C:/Windows/Fonts/malgun.ttf",
      "C:/Windows/Fonts/malgunbd.ttf",
    ],
  },
];

export class PdfReportError extends Error {
  code: PdfFailureCode;

  constructor(code: PdfFailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

function detectKoreanFontFamily(): string | null {
  for (const candidate of KOREAN_FONT_CANDIDATES) {
    if (candidate.paths.some((fontPath) => fs.existsSync(fontPath))) {
      return candidate.family;
    }
  }
  return null;
}

function injectPdfFontStyle(html: string, fontFamily: string): string {
  const stylePatch = `\n    body, table, th, td, li, p, span, strong { font-family: ${fontFamily}; }\n`;
  if (html.includes("</style>")) {
    return html.replace("</style>", `${stylePatch}</style>`);
  }
  return html;
}

function hasChromiumMissingMessage(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("executable")
    || message.includes("browser has not been found")
    || message.includes("please run")
    || message.includes("playwright install");
}

type ChromiumLauncher = {
  launch: (options?: Record<string, unknown>) => Promise<{
    newPage: (options?: Record<string, unknown>) => Promise<{
      setContent: (html: string, options?: Record<string, unknown>) => Promise<void>;
      pdf: (options?: Record<string, unknown>) => Promise<Uint8Array | Buffer>;
      close: () => Promise<void>;
    }>;
    close: () => Promise<void>;
  }>;
};

async function importPlaywrightRuntime(): Promise<{ chromium?: ChromiumLauncher }> {
  const dynamicImport = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<unknown>;
  return dynamicImport("playwright") as Promise<{ chromium?: ChromiumLauncher }>;
}

export async function renderPdfReport(dto: ResultDtoV1, options?: RenderPdfReportOptions): Promise<Buffer> {
  const fontFamily = detectKoreanFontFamily();
  if (!fontFamily) {
    throw new PdfReportError("PDF_FONT_MISSING", "PDF 한글 폰트를 찾을 수 없습니다. 시스템 폰트를 설치하거나 HTML 리포트를 사용하세요.");
  }

  let chromium: ChromiumLauncher;

  try {
    const playwright = await importPlaywrightRuntime();
    if (!playwright.chromium) {
      throw new Error("PLAYWRIGHT_CHROMIUM_MISSING");
    }
    chromium = playwright.chromium;
  } catch {
    throw new PdfReportError("PDF_ENGINE_MISSING", "PDF 엔진을 찾을 수 없습니다. 서버 환경에서 Playwright를 확인하세요.");
  }

  const html = injectPdfFontStyle(
    renderHtmlReport(dto, {
      title: options?.title,
      locale: "ko-KR",
      theme: "light",
    }),
    fontFamily,
  );

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "6mm",
        right: "6mm",
        bottom: "6mm",
        left: "6mm",
      },
      preferCSSPageSize: true,
    });
    await page.close();

    return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  } catch (error) {
    if (hasChromiumMissingMessage(error)) {
      throw new PdfReportError("PDF_ENGINE_MISSING", "PDF 엔진 실행 파일을 찾을 수 없습니다. 브라우저 런타임을 설치하세요.");
    }
    throw new PdfReportError("PDF_RENDER_FAILED", "PDF 렌더링에 실패했습니다. HTML 리포트 다운로드를 사용하세요.");
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
