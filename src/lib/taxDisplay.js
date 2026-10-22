import { lineTaxPct as adapterLineTaxPct } from "@/lib/docTaxSemantics";

// Display percent for a document line.
// Native documents store the tax RATE (e.g. 5) in line.tax_rate. Imported (Xero)
// documents store the line tax AMOUNT there (e.g. 75 or -75), and credit-note lines
// arrive signed while the credit note itself stores positive totals.
// The shared adapter in docTaxSemantics resolves which convention applies from the
// grounded document-level tax_amount (sign aware) and converts accordingly, so an
// imported 75 on a 1500 line shows 5% and a native 5 stays 5%.
export function lineTaxPct(line, doc) {
  return adapterLineTaxPct(line, doc);
}