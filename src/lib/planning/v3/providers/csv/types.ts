export type CsvColumnMapping = {
  dateKey?: string;
  amountKey?: string;
  inflowKey?: string;
  outflowKey?: string;
  descKey?: string;
};

export type CsvMappingConfidence = "high" | "mid" | "low";

export type CsvMappingInferResult = {
  dateKey?: string;
  amountKey?: string;
  inflowKey?: string;
  outflowKey?: string;
  descKey?: string;
  confidence: {
    date: CsvMappingConfidence;
    amount: CsvMappingConfidence;
    desc: CsvMappingConfidence;
  };
  reasons: string[];
};

export type CsvMappingValidationError = {
  field: string;
  message: string;
};

export type CsvMappingValidationResult =
  | { ok: true }
  | { ok: false; errors: CsvMappingValidationError[] };
