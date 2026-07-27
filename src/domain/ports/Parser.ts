export interface ParsedExpense {
  amount: number;
  category: string;
  note: string;
  /** When the expense occurred. If undefined, defaults to now. */
  date?: Date;
}

/**
 * Shared contract for turning a raw message into expense(s).
 * Supports both single and multi-transaction messages.
 *
 * Returns a Promise to support both sync (Regex) and async (AI) parsers.
 * Returns an array: empty = no expense detected, 1+ = parsed transactions.
 */
export interface Parser {
  parse(text: string): Promise<ParsedExpense[]> | ParsedExpense[];
}
