const validator = require('@app-core/validator');
const PaymentMessages = require('@app/messages/payment');

const spec = `root {
  instruction string
}`;
const parsedSpec = validator.parse(spec);

const CURRENT_DATE = '2025-11-14';
const ALLOWED_CURRENCIES = ['USD', 'NGN', 'GBP', 'GHS'];
const VALID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._@';

// Split string into words manually
function splitBySpace(str) {
  const words = [];
  let current = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ' ') {
      if (current !== '') {
        words.push(current);
        current = '';
      }
    } else {
      current += str[i];
    }
  }
  if (current !== '') words.push(current);
  return words;
}

// Manual account validation
function validateAccounts(accounts) {
  if (!Array.isArray(accounts)) throw new Error('Accounts must be an array');

  for (const acc of accounts) {
    if (typeof acc.id !== 'string' || !acc.id.trim()) {
      throw new Error(`Account ID is invalid: ${acc.id}`);
    }
    if (typeof acc.balance !== 'number' || acc.balance < 0) {
      throw new Error(`Account balance invalid for ${acc.id}`);
    }
  }

  return accounts.map((a) => ({
    id: a.id,
    balance: a.balance,
    currency: a.currency.toUpperCase(),
  }));
}

async function parseInstruction(serviceData) {
  try {
    const validated = validator.validate(serviceData, parsedSpec);
    const { instruction } = validated;
    if (!instruction) return failed(PaymentMessages.MALFORMED_INSTRUCTION, 'SY03');

    let accounts;
    try {
      accounts = validateAccounts(serviceData.accounts);
    } catch (err) {
      return failed(err.message, 'AC03');
    }

    const trimmed = instruction.trim();
    const words = splitBySpace(trimmed);
    const lower = words.map((w) => w.toLowerCase());

    let pos = 0;

    // Step 2: Instruction type
    const type = lower[pos] === 'debit' ? 'DEBIT' : lower[pos] === 'credit' ? 'CREDIT' : null;
    if (!type) return failed(PaymentMessages.MALFORMED_INSTRUCTION, 'SY03');
    pos++;

    // Step 3: Amount
    const amountStr = words[pos++];
    for (let i = 0; i < amountStr.length; i++) {
      if (amountStr[i] < '0' || amountStr[i] > '9') {
        return failed(PaymentMessages.INVALID_AMOUNT, 'AM01');
      }
    }
    const amount = parseInt(amountStr, 10);
    if (amount <= 0) return failed(PaymentMessages.INVALID_AMOUNT, 'AM01');

    // Step 4: Currency
    const currency = words[pos++].toUpperCase();
    if (!ALLOWED_CURRENCIES.includes(currency))
      return failed(PaymentMessages.UNSUPPORTED_CURRENCY, 'CU02');

    let debitId;
    let creditId;
    let executeBy = null;

    // Step 5: Keywords + account IDs
    if (type === 'DEBIT') {
      if (lower[pos++] !== 'from' || lower[pos++] !== 'account')
        return failed(PaymentMessages.INVALID_KEYWORD_ORDER, 'SY02');
      debitId = words[pos++];
      if (
        lower[pos++] !== 'for' ||
        lower[pos++] !== 'credit' ||
        lower[pos++] !== 'to' ||
        lower[pos++] !== 'account'
      )
        return failed(PaymentMessages.INVALID_KEYWORD_ORDER, 'SY02');
      creditId = words[pos++];
    } else {
      if (lower[pos++] !== 'to' || lower[pos++] !== 'account')
        return failed(PaymentMessages.INVALID_KEYWORD_ORDER, 'SY02');
      creditId = words[pos++];
      if (
        lower[pos++] !== 'for' ||
        lower[pos++] !== 'debit' ||
        lower[pos++] !== 'from' ||
        lower[pos++] !== 'account'
      )
        return failed(PaymentMessages.INVALID_KEYWORD_ORDER, 'SY02');
      debitId = words[pos++];
    }

    // Step 6: Optional execution date
    if (pos < lower.length && lower[pos] === 'on') {
      pos++;
      if (pos >= words.length) return failed(PaymentMessages.INVALID_DATE_FORMAT, 'DT01');
      executeBy = words[pos++];
      if (executeBy.length !== 10 || executeBy[4] !== '-' || executeBy[7] !== '-') {
        return failed(PaymentMessages.INVALID_DATE_FORMAT, 'DT01');
      }
    }

    if (pos !== words.length) return failed(PaymentMessages.MALFORMED_INSTRUCTION, 'SY03');

    // Step 7: Validate account IDs
    for (const id of [debitId, creditId]) {
      for (const c of id) {
        if (!VALID_CHARS.includes(c)) return failed(PaymentMessages.INVALID_ACCOUNT_ID, 'AC04');
      }
    }

    // Step 8: Lookup accounts
    const accMap = {};
    accounts.forEach((a) => (accMap[a.id] = a));
    const debitAcc = accMap[debitId];
    const creditAcc = accMap[creditId];
    if (!debitAcc || !creditAcc) return failed(PaymentMessages.ACCOUNT_NOT_FOUND, 'AC03');
    if (debitAcc.currency !== currency || creditAcc.currency !== currency)
      return failed(PaymentMessages.CURRENCY_MISMATCH, 'CU01');
    if (debitId === creditId) return failed(PaymentMessages.SAME_ACCOUNT, 'AC02');

    // Step 9: Execution
    const executeNow = !executeBy || executeBy <= CURRENT_DATE;
    if (executeNow && debitAcc.balance < amount)
      return failed(PaymentMessages.INSUFFICIENT_FUNDS, 'AC01');

    const involved = accounts
      .filter((a) => a.id === debitId || a.id === creditId)
      .map((a) => ({
        id: a.id,
        balance_before: a.balance,
        balance: executeNow
          ? a.id === debitId
            ? a.balance - amount
            : a.balance + amount
          : a.balance,
        currency: a.currency,
      }));

    return {
      type,
      amount,
      currency,
      debit_account: debitId,
      credit_account: creditId,
      execute_by: executeNow ? null : executeBy,
      status: executeNow ? 'successful' : 'pending',
      status_reason: executeNow
        ? PaymentMessages.SUCCESS_EXECUTED
        : PaymentMessages.SUCCESS_PENDING,
      status_code: executeNow ? 'AP00' : 'AP02',
      accounts: involved.map((a) => ({
        id: a.id,
        balance: a.balance,
        balance_before: a.balance_before,
        currency: a.currency,
      })),
    };
  } catch (err) {
    return failed(PaymentMessages.MALFORMED_INSTRUCTION, 'SY03');
  }

  function failed(reason, code) {
    return {
      type: null,
      amount: null,
      currency: null,
      debit_account: null,
      credit_account: null,
      execute_by: null,
      status: 'failed',
      status_reason: reason,
      status_code: code,
      accounts: [],
    };
  }
}

module.exports = parseInstruction;
