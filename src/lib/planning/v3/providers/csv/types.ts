export type CsvAmountSign = "inflowPositive" | "outflowPositive" | "signed";
export type CsvDelimiter = "," | "\t" | ";";
export type CsvEncoding = "utf-8" | "euc-kr";

export type CsvColumnMapping = {
  dateKey: string;
  // amountKey is optional when inflowKey+outflowKey are both provided.
  amountKey?: string;
  inflowKey?: string;
  outflowKey?: string;
  descKey?: string;
  typeKey?: string;
  dateFormatHint?: string;
  amountSign?: CsvAmountSign;
  delimiter?: CsvDelimiter;
  encoding?: CsvEncoding;
};

export type CsvInferResult = {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestions: Partial<CsvColumnMapping>;
};
