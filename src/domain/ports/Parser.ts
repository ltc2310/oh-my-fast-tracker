export interface ParsedExpense {
  amount: number;
  category: string;
  note: string;
}

/**
 * Shared contract for turning a raw message into an expense.
 * Both RegexParser (MVP) and AIParser (future) implement this
 * interface, so the bot logic never changes when swapping engines.
 */
export interface Parser {
  parse(text: string): ParsedExpense | null;
}
