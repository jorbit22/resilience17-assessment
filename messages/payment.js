const PaymentMessages = {
  SUCCESS_EXECUTED: 'Transaction executed successfully',
  SUCCESS_PENDING: 'Transaction scheduled for future execution',
  MISSING_KEYWORD: 'Missing required keyword',
  INVALID_KEYWORD_ORDER: 'Invalid keyword order',
  MALFORMED_INSTRUCTION: 'Malformed instruction',
  INVALID_AMOUNT: 'Invalid amount', // <-- updated to match test case
  CURRENCY_MISMATCH: 'Account currency mismatch',
  UNSUPPORTED_CURRENCY: 'Unsupported currency',
  INSUFFICIENT_FUNDS: 'Insufficient funds in debit account',
  SAME_ACCOUNT: 'Debit and credit accounts cannot be the same',
  ACCOUNT_NOT_FOUND: 'Account not found',
  INVALID_ACCOUNT_ID: 'Invalid account ID format',
  INVALID_DATE_FORMAT: 'Invalid date format',
};

module.exports = PaymentMessages;
