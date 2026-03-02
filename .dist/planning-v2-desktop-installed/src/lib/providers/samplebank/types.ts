export type SamplebankProviderRequest = {
  kind?: "deposit" | "saving";
};

export type SamplebankFixtureOption = {
  termMonths: number;
  baseRate: number;
  maxRate: number;
};

export type SamplebankFixtureItem = {
  productCode: string;
  bankName: string;
  productName: string;
  kind: "deposit" | "saving";
  options: SamplebankFixtureOption[];
};

export type SamplebankFixture = {
  generatedAt: string;
  items: SamplebankFixtureItem[];
};

export type SamplebankNormalizedItem = {
  stableId: string;
  sourceId: "samplebank";
  kind: "deposit" | "saving";
  externalKey: string;
  providerName: string;
  productName: string;
  options: Array<{
    sourceId: "samplebank";
    termMonths: number | null;
    saveTrm?: string;
    intrRate: number | null;
    intrRate2: number | null;
  }>;
};

export type SamplebankProviderData = {
  items: SamplebankNormalizedItem[];
};
