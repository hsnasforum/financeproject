export type Gov24OfficialDetail = {
  title?: string;
  sections?: Record<string, string[]>;
  contact?: string;
  applyMethod?: string;
  externalUrl?: string;
} | null;

// Official endpoint is optional and should only be used when explicitly configured.
export async function fetchOfficialGov24Detail(serviceId: string): Promise<Gov24OfficialDetail> {
  void serviceId;
  return null;
}
