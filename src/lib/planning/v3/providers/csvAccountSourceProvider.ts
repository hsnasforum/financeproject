import { type AccountTransaction } from "../domain/types";
import {
  AccountSourceValidationError,
  type AccountSourceProvider,
  type AccountSourceValidationIssue,
  type CsvAccountSourceInput,
} from "./accountSourceProvider";
import { parseCsvTransactions } from "./csv/csvProvider";

function toValidationIssue(error: {
  rowIndex: number;
  code: string;
  path: string[];
}): AccountSourceValidationIssue {
  const row = Math.max(error.rowIndex, 0);
  const path = `rows[${row}].${error.path.join(".")}`;
  const message = error.code === "MISSING_COLUMN"
    ? "required column is missing"
    : error.code === "INVALID_DATE"
      ? "invalid date format"
      : "invalid amount format";
  return {
    path,
    code: error.code,
    message,
  };
}

export class CsvAccountSourceProvider implements AccountSourceProvider<CsvAccountSourceInput> {
  readonly id = "csv";

  async loadTransactions(input: CsvAccountSourceInput): Promise<AccountTransaction[]> {
    const result = parseCsvTransactions(input.csvText, {
      delimiter: input.delimiter,
      hasHeader: input.hasHeader,
      mapping: {
        dateColumn: input.mapping.dateColumn,
        amountColumn: input.mapping.amountColumn,
        inflowColumn: input.mapping.inflowColumn,
        outflowColumn: input.mapping.outflowColumn,
        descColumn: input.mapping.descColumn,
        delimiter: input.mapping.delimiter,
      },
    });

    if (result.errors.length > 0) {
      throw new AccountSourceValidationError(
        "CSV transaction validation failed",
        result.errors.map(toValidationIssue),
      );
    }

    return result.transactions;
  }
}
