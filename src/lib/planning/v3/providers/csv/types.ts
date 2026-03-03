export type CsvDelimiter = "," | "\t" | ";";
export type CsvEncoding = "utf-8" | "euc-kr";
export type CsvAmountSign = "inflowPositive" | "outflowPositive" | "signed";

export type CsvColumnMapping = {
  dateKey?: string;
  amountKey?: string;
  descKey?: string;
  typeKey?: string;
  inflowKey?: string;
  outflowKey?: string;
  dateFormatHint?: string;
  amountSign?: CsvAmountSign;
  delimiter?: CsvDelimiter;
  encoding?: CsvEncoding;
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

