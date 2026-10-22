// Converts a numeric amount into English currency words.
// e.g. 1265250 -> "One Million, Two Hundred Sixty-Five Thousand, Two Hundred Fifty AED Only"
// Handles decimals as "and XX/100" (fils/cents fraction).

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function threeDigitsToWords(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let words = "";
  if (hundred > 0) words += `${ONES[hundred]} Hundred`;
  if (rest > 0) {
    if (words) words += " ";
    if (rest < 20) {
      words += ONES[rest];
    } else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      words += TENS[t];
      if (o > 0) words += `-${ONES[o]}`;
    }
  }
  return words;
}

function integerToWords(num) {
  if (num === 0) return "Zero";
  let words = "";
  let scaleIdx = 0;
  let first = true;
  while (num > 0) {
    const chunk = num % 1000;
    num = Math.floor(num / 1000);
    if (chunk > 0) {
      const chunkWords = threeDigitsToWords(chunk);
      const scale = SCALES[scaleIdx];
      const piece = scale ? `${chunkWords} ${scale}` : chunkWords;
      words = first ? piece : `${piece}, ${words}`;
      first = false;
    }
    scaleIdx++;
  }
  return words;
}

export function amountToWords(amount, currency = "AED") {
  const n = Number(amount || 0);
  if (!isFinite(n)) return "";
  const integerPart = Math.floor(Math.abs(n));
  const fraction = Math.round((Math.abs(n) - integerPart) * 100);
  let words = integerToWords(integerPart);
  if (fraction > 0) {
    words += ` and ${fraction}/100`;
  }
  return `${words} ${currency} Only`;
}