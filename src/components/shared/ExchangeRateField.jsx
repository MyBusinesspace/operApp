import React from "react";
import { Input } from "@/components/ui/input";
import { toBaseAmount, formatMoney } from "@/lib/currency";

/**
 * Exchange rate input shown next to the currency selector on financial
 * documents (invoices, quotes, bills, POs). When the document currency
 * matches the base currency the rate is fixed at 1 and the field is disabled.
 *
 * Props:
 *  - currency: document currency code
 *  - exchangeRate: current rate (1 base unit = rate doc units)
 *  - total: document grand total (in document currency)
 *  - baseCurrency: organization base currency
 *  - onChange: (rate: number) => void
 */
export default function ExchangeRateField({ currency, exchangeRate, total, baseCurrency, onChange }) {
  const sameCurrency = !currency || !baseCurrency || currency === baseCurrency;
  const rate = sameCurrency ? 1 : Number(exchangeRate) || 0;
  const baseTotal = sameCurrency ? (total || 0) : toBaseAmount(total || 0, rate);

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        Exchange Rate {baseCurrency && currency && !sameCurrency && (
          <span className="text-muted-foreground/70">(1 {baseCurrency} = ? {currency})</span>
        )}
      </label>
      <Input
        type="number"
        step="0.0001"
        min="0"
        disabled={sameCurrency}
        value={sameCurrency ? "1.00" : (exchangeRate ?? "")}
        placeholder={sameCurrency ? "1.00" : "0.0000"}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
      {!sameCurrency && (
        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
          Base total: {formatMoney(baseTotal, baseCurrency)}
        </p>
      )}
    </div>
  );
}