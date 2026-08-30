// lib/clean.ts
// Cleans raw monday.com row data: drops junk rows, fixes types,
// standardizes text. Never guesses/fills missing values — nulls
// stay null so we can honestly report data-quality gaps to the user.

type Row = Record<string, string | null>;

// Detects rows where a leaked spreadsheet header ended up as a data row
// (a known artifact in the original export — e.g. a row where the
// "Deal Status" field literally contains the text "Deal Status").
function isJunkHeaderRow(row: Row): boolean {
  let matches = 0;
  for (const key of Object.keys(row)) {
    if (row[key] === key) matches++;
  }
  return matches >= 3; // several fields equal their own column name = leaked header
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = parseFloat(value.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function cleanDeals(rawRows: Row[]) {
  return rawRows
    .filter((row) => !isJunkHeaderRow(row))
    .map((row) => ({
      dealName: row["Item"],
      ownerCode: normalizeText(row["Owner code"]),
      clientCode: normalizeText(row["Client Code"]),
      status: normalizeText(row["Deal Status"]),
      closeDateActual: row["Close Date (A)"],
      closureProbability: normalizeText(row["Closure Probability"]),
      dealValue: toNumber(row["Masked Deal value"]),
      tentativeCloseDate: row["Tentative Close Date"],
      dealStage: normalizeText(row["Deal Stage"]),
      productDeal: normalizeText(row["Product deal"]),
      sector: normalizeText(row["Sector/service"]),
      createdDate: row["Created Date"],
    }));
}

export function cleanWorkOrders(rawRows: Row[]) {
  return rawRows
    .filter((row) => !isJunkHeaderRow(row))
    .map((row) => ({
      dealName: row["Deal name masked"] ?? row["Item"],
      customerCode: normalizeText(row["Customer Name Code"]),
      serialNo: normalizeText(row["Serial #"]),
      natureOfWork: normalizeText(row["Nature of Work"]),
      executionStatus: normalizeText(row["Execution Status"]),
      sector: normalizeText(row["Sector"]),
      typeOfWork: normalizeText(row["Type of Work"]),
      probableStartDate: row["Probable Start Date"],
      probableEndDate: row["Probable End Date"],
      poDate: row["Date of PO/LOI"],
      amountExclGst: toNumber(row["Amount in Rupees (Excl of GST) (Masked)"]),
      amountInclGst: toNumber(row["Amount in Rupees (Incl of GST) (Masked)"]),
      billedValueInclGst: toNumber(row["Billed Value in Rupees (Incl of GST.) (Masked)"]),
      collectedAmount: toNumber(row["Collected Amount in Rupees (Incl of GST.) (Masked)"]),
      amountReceivable: toNumber(row["Amount Receivable (Masked)"]),
      billingStatus: normalizeText(row["Billing Status"]),
      invoiceStatus: normalizeText(row["Invoice Status"]),
    }));
}

// Computes what % of rows are missing each field — this is what lets
// the agent honestly tell the user "38% of deals have no Closure
// Probability recorded" instead of silently ignoring the gap.
export function dataQualityReport(rows: Row[], fieldsToCheck: string[]) {
  const total = rows.length;
  const report: Record<string, string> = {};
  for (const field of fieldsToCheck) {
    const missing = rows.filter((r) => (r as any)[field] === null || (r as any)[field] === undefined).length;
    report[field] = `${Math.round((missing / total) * 100)}% missing`;
  }
  return report;
}