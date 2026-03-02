export function gov24BenefitDetailUrl(serviceId: string): string {
  const normalized = serviceId.trim();
  const encoded = encodeURIComponent(normalized);
  return `https://www.gov.kr/portal/rcvfvrSvc/dtlEx/${encoded}`;
}
