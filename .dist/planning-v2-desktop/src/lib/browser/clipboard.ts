export async function copyToClipboard(text: string): Promise<{ ok: boolean; message?: string }> {
  const value = String(text ?? "");
  if (!value) {
    return { ok: false, message: "복사할 내용이 없습니다." };
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return { ok: true };
    } catch {
      // fallback below
    }
  }

  if (typeof document === "undefined") {
    return { ok: false, message: "클립보드 API를 사용할 수 없습니다." };
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) {
      return { ok: false, message: "브라우저에서 복사 기능이 차단되었습니다." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "복사에 실패했습니다." };
  }
}
