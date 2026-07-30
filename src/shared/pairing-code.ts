const PAIRING_CODE_PREFIX = "134";
const PAIRING_CODE_ALPHABET = "2346789ABCDEFGHJKMNPQRTUVWXYZ";
const PAIRING_CODE_PATTERN = new RegExp(
  `^${PAIRING_CODE_PREFIX}-[${PAIRING_CODE_ALPHABET}]{4}-[${PAIRING_CODE_ALPHABET}]{4}$`,
);

export type PairingCode = {
  value: string;
};

export function normalizePairingCode(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (compact.length !== 11) {
    return compact;
  }

  return `${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7)}`;
}

export function parsePairingCode(input: string): PairingCode {
  const value = normalizePairingCode(input);

  if (!PAIRING_CODE_PATTERN.test(value)) {
    throw new Error("Некорректный код привязки");
  }

  return { value };
}

