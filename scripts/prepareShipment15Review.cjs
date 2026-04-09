const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const SOURCE = process.argv[2] || path.join(process.cwd(), 'migration_output.json');
const OUT_DIR = process.argv[3] || path.join(process.cwd(), 'migration_review_shipment15');
const WORKBOOK_SOURCE = process.argv[4] || process.env.MIGRATION_WORKBOOK || '';
const SECTIONS_DIR = path.join(OUT_DIR, 'sections');
const TARGET_SHIPMENT_ID = '4';
const CAPITAL_SHEET_NAME = 'الشركاء';
const EXCLUDED_CAPITAL_PARTNER_IDS = new Set(['4']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function sumBy(items, getter) {
  return items.reduce((sum, item) => sum + (Number(getter(item)) || 0), 0);
}

function previousDate(isoDate) {
  const dt = new Date(`${isoDate}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function nextId(prefix, n) {
  return `${prefix}${String(n).padStart(5, '0')}`;
}

function parseNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const normalized = String(value).replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeArabicName(value) {
  return String(value || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolvePartnerId(partners, rawName) {
  const normalized = normalizeArabicName(rawName);
  if (!normalized) return null;

  const exact = partners.find((partner) => normalizeArabicName(partner.name) === normalized);
  if (exact) return exact.id;

  const partial = partners.find((partner) => {
    const partnerName = normalizeArabicName(partner.name);
    return partnerName.includes(normalized) || normalized.includes(partnerName);
  });

  return partial?.id || null;
}

function readSheetCellText(sheet, rowNumber, columnNumber) {
  const cell = sheet[xlsx.utils.encode_cell({ r: rowNumber - 1, c: columnNumber - 1 })];
  if (!cell) return '';
  return String(cell.w ?? cell.v ?? '').trim();
}

function normalizeDescription(value) {
  return normalizeArabicName(value)
    .replace(/["'،,:()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sumSplits(rows) {
  const byAccount = new Map();
  for (const row of rows) {
    for (const split of row.splits || []) {
      const key = String(split.bankAccountId);
      byAccount.set(key, (byAccount.get(key) || 0) + (Number(split.amount) || 0));
    }
  }
  return [...byAccount.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bankAccountId, amount]) => ({ bankAccountId, amount: Number(amount.toFixed(3)) }));
}

function deriveExchangeRate(amountSDG, amountSAR, fallbackRate) {
  if (amountSAR > 0) return Number((amountSDG / amountSAR).toFixed(6));
  return fallbackRate || 0;
}

function buildAggregateTransfer({ id, shipmentId, partnerId, rows, description }) {
  const amountSDG = sumBy(rows, (row) => row.amountSDG);
  const amountSAR = sumBy(rows, (row) => row.amountSAR);
  const sortedRows = rows.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const lastRow = sortedRows[sortedRows.length - 1];

  return {
    id,
    date: lastRow?.date,
    description,
    shipmentId,
    partnerId,
    transferType: 'drawings',
    amountSDG: Number(amountSDG.toFixed(3)),
    exchangeRate: deriveExchangeRate(amountSDG, amountSAR, Number(lastRow?.exchangeRate) || 0),
    amountSAR: Number(amountSAR.toFixed(3)),
    splits: sumSplits(rows),
  };
}

function buildShipment15GeneralTransfersSection({ partners, generalTransfers, capitalContributions }) {
  const shipmentTransfers = generalTransfers
    .filter((row) => String(row.shipmentId) === TARGET_SHIPMENT_ID)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));

  const contributionPartnerIds = new Set(capitalContributions.map((row) => row.partnerId));
  const operatingPartnerIds = new Set(
    partners.filter((partner) => partner.isOperatingPartner).map((partner) => String(partner.id))
  );

  const capitalRows = shipmentTransfers.filter((row) => row.transferType === 'capital');
  const capitalReturns = capitalRows
    .filter((row) => contributionPartnerIds.has(String(row.partnerId)))
    .map((row) => ({
      ...row,
      partnerId: String(row.partnerId),
      beneficiaryPartnerId: String(row.partnerId),
      transferType: 'capital_return',
    }));

  const excludedCapitalRows = capitalRows.filter((row) => !contributionPartnerIds.has(String(row.partnerId)));

  const drawingsRows = shipmentTransfers.filter((row) => row.transferType === 'drawings');
  const operatingDrawings = drawingsRows.filter((row) => operatingPartnerIds.has(String(row.partnerId)));
  const nonOperatingDrawings = drawingsRows.filter((row) => !operatingPartnerIds.has(String(row.partnerId)));

  const salaryRelatedKeywords = ['راتب', 'صديق', 'جدو', 'سلفيه', 'سلفيات', 'تهاني', 'لبني', 'رنده'];
  const aggregatedDrawingRows = [];
  const drawingAggregationAudit = [];
  let aggregateCounter = 1;

  for (const partner of partners.filter((row) => row.isOperatingPartner)) {
    const partnerRows = operatingDrawings.filter((row) => String(row.partnerId) === String(partner.id));
    if (!partnerRows.length) continue;

    const expenseRows = [];
    const salaryRows = [];

    for (const row of partnerRows) {
      const normalizedDesc = normalizeDescription(row.description || '');
      const isSalaryRelated = String(partner.id) === '2' && salaryRelatedKeywords.some((keyword) => normalizedDesc.includes(keyword));
      (isSalaryRelated ? salaryRows : expenseRows).push(row);
    }

    if (expenseRows.length) {
      aggregatedDrawingRows.push(
        buildAggregateTransfer({
          id: nextId('GT15D', aggregateCounter++),
          shipmentId: TARGET_SHIPMENT_ID,
          partnerId: String(partner.id),
          rows: expenseRows,
          description: `منصرفات شريك مجمعة - ${partner.name} - رسالة 15`,
        })
      );
    }

    if (salaryRows.length) {
      aggregatedDrawingRows.push(
        buildAggregateTransfer({
          id: nextId('GT15D', aggregateCounter++),
          shipmentId: TARGET_SHIPMENT_ID,
          partnerId: String(partner.id),
          rows: salaryRows,
          description: `عبء رواتب وسلفيات مجمع - ${partner.name} - رسالة 15`,
        })
      );
    }

    drawingAggregationAudit.push({
      partnerId: String(partner.id),
      partnerName: partner.name,
      expenseSourceIds: expenseRows.map((row) => row.id),
      expenseSourceDescriptions: expenseRows.map((row) => row.description),
      expenseTotalSAR: Number(sumBy(expenseRows, (row) => row.amountSAR).toFixed(3)),
      salarySourceIds: salaryRows.map((row) => row.id),
      salarySourceDescriptions: salaryRows.map((row) => row.description),
      salaryTotalSAR: Number(sumBy(salaryRows, (row) => row.amountSAR).toFixed(3)),
    });
  }

  const profitRows = shipmentTransfers.filter((row) => row.transferType === 'profit_payment');
  const explicitProfitRows = [];
  const unresolvedProfitRows = [];

  for (const row of profitRows) {
    const normalizedDesc = normalizeDescription(row.description || '');
    if (normalizedDesc.includes('الاهل')) {
      explicitProfitRows.push({
        ...row,
        partnerId: '5',
        beneficiaryPartnerId: '5',
      });
      continue;
    }

    unresolvedProfitRows.push(row);
  }

  const cleanedGeneralTransfers = [
    ...capitalReturns,
    ...aggregatedDrawingRows,
    ...nonOperatingDrawings,
    ...explicitProfitRows,
    ...unresolvedProfitRows,
  ].sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));

  return {
    description: 'Shipment15 general transfers cleaned for the app model: capital rows converted to capital returns, operating-partner drawings merged, explicit اهل profit mapped, and unresolved generic profit rows preserved for manual review.',
    state: {
      generalTransfers: cleanedGeneralTransfers,
    },
    summary: {
      shipmentId: TARGET_SHIPMENT_ID,
      cleanedTransferCount: cleanedGeneralTransfers.length,
      capitalReturnCount: capitalReturns.length,
      capitalReturnTotalSAR: Number(sumBy(capitalReturns, (row) => row.amountSAR).toFixed(3)),
      mergedDrawingCount: aggregatedDrawingRows.length,
      mergedDrawingTotalSAR: Number(sumBy(aggregatedDrawingRows, (row) => row.amountSAR).toFixed(3)),
      preservedMiscDrawingCount: nonOperatingDrawings.length,
      preservedMiscDrawingTotalSAR: Number(sumBy(nonOperatingDrawings, (row) => row.amountSAR).toFixed(3)),
      explicitProfitRowCount: explicitProfitRows.length,
      explicitProfitTotalSAR: Number(sumBy(explicitProfitRows, (row) => row.amountSAR).toFixed(3)),
      unresolvedProfitRowCount: unresolvedProfitRows.length,
      unresolvedProfitTotalSAR: Number(sumBy(unresolvedProfitRows, (row) => row.amountSAR).toFixed(3)),
      unresolvedProfitReason: 'The saved workbook XML contains the profit headers but no stored beneficiary breakdown cells for the generic ارباح rows, so those rows cannot be assigned to real beneficiaries from source data alone.',
      applyReady: unresolvedProfitRows.length === 0,
      excludedCapitalRows: excludedCapitalRows.map((row) => ({
        id: row.id,
        partnerId: row.partnerId,
        description: row.description,
        amountSAR: row.amountSAR,
      })),
      drawingAggregationAudit,
      unresolvedProfitRows: unresolvedProfitRows.map((row) => ({
        id: row.id,
        date: row.date,
        amountSAR: row.amountSAR,
        amountSDG: row.amountSDG,
        description: row.description,
      })),
    },
  };
}

function buildShipment15ResolvedGeneralTransfersSection(cleanedSection) {
  const unresolvedIds = new Set((cleanedSection.summary.unresolvedProfitRows || []).map((row) => String(row.id)));
  const resolvedGeneralTransfers = (cleanedSection.state.generalTransfers || []).filter(
    (row) => !unresolvedIds.has(String(row.id))
  );

  return {
    description: 'Shipment15 general transfers that are fully resolved and safe to apply now; unresolved generic profit rows are excluded pending manual allocation.',
    state: {
      generalTransfers: resolvedGeneralTransfers,
    },
    summary: {
      shipmentId: TARGET_SHIPMENT_ID,
      resolvedTransferCount: resolvedGeneralTransfers.length,
      resolvedTransferTotalSAR: Number(sumBy(resolvedGeneralTransfers, (row) => row.amountSAR).toFixed(3)),
      excludedUnresolvedProfitRowCount: cleanedSection.summary.unresolvedProfitRowCount,
      excludedUnresolvedProfitTotalSAR: cleanedSection.summary.unresolvedProfitTotalSAR,
      applyReady: true,
      sourceSection: 'general_transfers_shipment15',
      includedBreakdown: {
        capitalReturnCount: cleanedSection.summary.capitalReturnCount,
        capitalReturnTotalSAR: cleanedSection.summary.capitalReturnTotalSAR,
        mergedDrawingCount: cleanedSection.summary.mergedDrawingCount,
        mergedDrawingTotalSAR: cleanedSection.summary.mergedDrawingTotalSAR,
        preservedMiscDrawingCount: cleanedSection.summary.preservedMiscDrawingCount,
        preservedMiscDrawingTotalSAR: cleanedSection.summary.preservedMiscDrawingTotalSAR,
        explicitProfitRowCount: cleanedSection.summary.explicitProfitRowCount,
        explicitProfitTotalSAR: cleanedSection.summary.explicitProfitTotalSAR,
      },
      excludedUnresolvedProfitRows: cleanedSection.summary.unresolvedProfitRows,
    },
  };
}

function buildShipment15CapitalContributionSection({ partners, openingDate, generalTransfers }) {
  if (!WORKBOOK_SOURCE || !fs.existsSync(WORKBOOK_SOURCE)) {
    return {
      section: null,
      note: WORKBOOK_SOURCE
        ? `Workbook not found for shipment15 capital extraction: ${WORKBOOK_SOURCE}`
        : 'Workbook path not provided; shipment15 capital contributions section was skipped.',
    };
  }

  const workbook = xlsx.readFile(WORKBOOK_SOURCE, { cellFormula: true, cellNF: true, cellText: true });
  const capitalSheet = workbook.Sheets[CAPITAL_SHEET_NAME];
  if (!capitalSheet) {
    return {
      section: null,
      note: `Workbook sheet not found: ${CAPITAL_SHEET_NAME}`,
    };
  }

  const rawCapitalReturnSarByPartner = new Map();
  for (const transfer of generalTransfers) {
    if (String(transfer.shipmentId) !== TARGET_SHIPMENT_ID) continue;
    if (transfer.transferType !== 'capital') continue;
    rawCapitalReturnSarByPartner.set(
      transfer.partnerId,
      (rawCapitalReturnSarByPartner.get(transfer.partnerId) || 0) + (Number(transfer.amountSAR) || 0)
    );
  }

  const contributions = [];
  const audit = [];
  const excludedPartners = [];
  const unresolvedPartners = [];

  for (let columnNumber = 9; columnNumber <= 18; columnNumber += 1) {
    const rawName = readSheetCellText(capitalSheet, 81, columnNumber);
    const amountSAR = parseNumber(readSheetCellText(capitalSheet, 82, columnNumber));
    if (!rawName || amountSAR <= 0) continue;

    const partnerId = resolvePartnerId(partners, rawName);
    const deductionRows = [];
    let deductedSAR = 0;

    for (let rowNumber = 83; rowNumber <= 90; rowNumber += 1) {
      const value = parseNumber(readSheetCellText(capitalSheet, rowNumber, columnNumber));
      if (!value) continue;
      deductionRows.push(value);
      deductedSAR += Math.abs(value);
    }

    const closingBalanceSAR = parseNumber(readSheetCellText(capitalSheet, 91, columnNumber));
    const rawCapitalReturnSAR = partnerId ? (rawCapitalReturnSarByPartner.get(partnerId) || 0) : 0;

    audit.push({
      partnerName: rawName,
      partnerId,
      contributionSAR: amountSAR,
      deductedSAR,
      rawCapitalReturnSAR,
      rawCapitalGapSAR: Number((amountSAR - rawCapitalReturnSAR).toFixed(3)),
      closingBalanceSAR,
      deductionRows,
    });

    if (!partnerId) {
      unresolvedPartners.push(rawName);
      continue;
    }

    if (EXCLUDED_CAPITAL_PARTNER_IDS.has(String(partnerId))) {
      excludedPartners.push({
        partnerId,
        partnerName: rawName,
        amountSAR,
        reason: 'Present in الشركاء summary table but missing matching shipment15 raw bank-outflow rows in التحاويل_العامة.',
      });
      continue;
    }

    contributions.push({
      id: nextId('CC15', contributions.length + 1),
      partnerId,
      shipmentId: TARGET_SHIPMENT_ID,
      amountSAR,
      date: openingDate,
      notes: 'Opening capital for shipment15 from الشركاء summary table',
    });
  }

  const significantRawGaps = audit
    .filter((row) => Math.abs(row.rawCapitalGapSAR) >= 1)
    .map((row) => ({
      partnerName: row.partnerName,
      partnerId: row.partnerId,
      contributionSAR: row.contributionSAR,
      rawCapitalReturnSAR: row.rawCapitalReturnSAR,
      gapSAR: row.rawCapitalGapSAR,
    }));

  return {
    section: {
      description: 'Shipment15 investor contributions reconstructed from the الشركاء capital table before applying cleaned general transfers.',
      state: {
        capitalContributions: contributions,
      },
      summary: {
        shipmentId: TARGET_SHIPMENT_ID,
        workbook: WORKBOOK_SOURCE,
        sheetName: CAPITAL_SHEET_NAME,
        contributionCount: contributions.length,
        totalContributionSAR: sumBy(contributions, (row) => row.amountSAR),
        contributionDate: openingDate,
        unresolvedPartners,
        excludedPartners,
        rawCapitalReturnAudit: audit,
        significantRawGaps,
      },
    },
    note: null,
  };
}

if (!fs.existsSync(SOURCE)) {
  console.error(`Source file not found: ${SOURCE}`);
  process.exit(1);
}

const state = readJson(SOURCE);
const sourceInvoices = Array.isArray(state.invoices) ? state.invoices : [];
const invoices = sourceInvoices.filter((inv) => String(inv.shipmentId) === TARGET_SHIPMENT_ID);
const sourcePayments = Array.isArray(state.payments) ? state.payments : [];
const shipment15Payments = sourcePayments.filter((row) => String(row.shipmentId) === TARGET_SHIPMENT_ID);
const sourceSalaries = Array.isArray(state.salaries) ? state.salaries : [];
const shipment15Salaries = sourceSalaries.filter((row) => String(row.shipmentId) === TARGET_SHIPMENT_ID);
const sourceExpenses = Array.isArray(state.expenses) ? state.expenses : [];
const shipment15Expenses = sourceExpenses.filter((row) => String(row.shipmentId) === TARGET_SHIPMENT_ID);
const cleanedShipment15Expenses = shipment15Expenses.filter(
  (row) => !(String(row.description || '').trim() === 'بضاعة منقولة' && (Number(row.amount) || 0) === 60000000)
);
const sourceGeneralTransfers = Array.isArray(state.generalTransfers) ? state.generalTransfers : [];

if (invoices.length === 0) {
  console.error(`No shipment ${TARGET_SHIPMENT_ID} invoices found in migration source.`);
  process.exit(1);
}

const sortedDates = invoices.map((inv) => inv.date).filter(Boolean).sort();
const startDate = sortedDates[0];
const openingDate = previousDate(startDate);

const productTotals = new Map();
for (const inv of invoices) {
  for (const line of inv.lines || []) {
    productTotals.set(line.productId, (productTotals.get(line.productId) || 0) + (Number(line.qty) || 0));
  }
}

const openingBalanceTransactions = [...productTotals.entries()]
  .filter(([, qty]) => qty > 0)
  .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  .map(([productId, qty], idx) => ({
    id: nextId('ITOB', idx + 1),
    date: openingDate,
    shipmentId: TARGET_SHIPMENT_ID,
    productId,
    type: 'receive',
    fromLocation: 'supplier',
    toLocation: 'warehouse',
    qty,
    notes: 'Opening balance for shipment15',
  }));

const loadGroups = new Map();
for (const inv of invoices) {
  for (const line of inv.lines || []) {
    const key = [inv.date, inv.carId, line.productId].join('|');
    const current = loadGroups.get(key) || {
      date: inv.date,
      carId: inv.carId,
      productId: line.productId,
      qty: 0,
    };
    current.qty += Number(line.qty) || 0;
    loadGroups.set(key, current);
  }
}

const loadTransactions = [...loadGroups.values()]
  .sort((a, b) =>
    a.date.localeCompare(b.date) ||
    String(a.carId).localeCompare(String(b.carId)) ||
    String(a.productId).localeCompare(String(b.productId))
  )
  .map((row, idx) => ({
    id: nextId('ITLD', idx + 1),
    date: row.date,
    shipmentId: TARGET_SHIPMENT_ID,
    productId: row.productId,
    type: 'load',
    fromLocation: 'warehouse',
    toLocation: row.carId,
    qty: row.qty,
    notes: 'Daily grouped load generated from invoice demand',
  }));

const salesInvoices = invoices
  .slice()
  .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
  .map((inv) => ({
    ...inv,
    shipmentId: TARGET_SHIPMENT_ID,
  }));

const sellTransactions = [];
let sellCounter = 1;
for (const inv of salesInvoices) {
  for (const line of inv.lines || []) {
    sellTransactions.push({
      id: nextId('ITSL', sellCounter++),
      date: inv.date,
      shipmentId: TARGET_SHIPMENT_ID,
      productId: line.productId,
      type: 'sell',
      fromLocation: inv.carId,
      toLocation: 'customer',
      qty: line.qty,
      referenceId: inv.id,
      invoiceId: inv.id,
    });
  }
}

const productNames = Object.fromEntries((state.products || []).map((p) => [p.id, p.name]));

const capitalContributionResult = buildShipment15CapitalContributionSection({
  partners: Array.isArray(state.partners) ? state.partners : [],
  openingDate,
  generalTransfers: sourceGeneralTransfers,
});

const cleanedGeneralTransfersSection = buildShipment15GeneralTransfersSection({
  partners: Array.isArray(state.partners) ? state.partners : [],
  generalTransfers: sourceGeneralTransfers,
  capitalContributions: capitalContributionResult.section?.state?.capitalContributions || [],
});

const resolvedGeneralTransfersSection = buildShipment15ResolvedGeneralTransfersSection(cleanedGeneralTransfersSection);

const sections = {
  opening_balance_shipment15: {
    description: 'One clean opening warehouse balance for shipment15, dated the day before the first invoice.',
    state: {
      inventoryTransactions: openingBalanceTransactions,
    },
    summary: {
      date: openingDate,
      transactions: openingBalanceTransactions.length,
      totalQty: sumBy(openingBalanceTransactions, (tx) => tx.qty),
      topProducts: openingBalanceTransactions
        .slice()
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 15)
        .map((tx) => ({ productId: tx.productId, productName: productNames[tx.productId], qty: tx.qty })),
    },
  },
  sales_shipment15: {
    description: 'All historical invoices remapped to shipment15, with daily grouped car loads and sell transactions.',
    state: {
      invoices: salesInvoices,
      inventoryTransactions: [...loadTransactions, ...sellTransactions],
    },
    summary: {
      shipmentId: TARGET_SHIPMENT_ID,
      invoiceCount: salesInvoices.length,
      loadTransactions: loadTransactions.length,
      sellTransactions: sellTransactions.length,
      firstInvoiceDate: sortedDates[0],
      lastInvoiceDate: sortedDates[sortedDates.length - 1],
      totalSalesAmount: sumBy(salesInvoices, (inv) => inv.total),
      totalSoldQty: sumBy(sellTransactions, (tx) => tx.qty),
    },
  },
  payments_shipment15: {
    description: 'Only original shipment15 payments, including rows that originally had blank Payment ID and were assigned new PM IDs during import parsing.',
    state: {
      payments: shipment15Payments,
    },
    summary: {
      shipmentId: TARGET_SHIPMENT_ID,
      paymentCount: shipment15Payments.length,
      totalPaymentAmount: sumBy(shipment15Payments, (row) => row.amount),
    },
  },
  salaries_shipment15: {
    description: 'Only original shipment15 salary and allowance records.',
    state: {
      salaries: shipment15Salaries,
    },
    summary: {
      shipmentId: TARGET_SHIPMENT_ID,
      salaryCount: shipment15Salaries.length,
      totalSalaryAmount: sumBy(shipment15Salaries, (row) => row.amount),
    },
  },
  expenses_shipment15: {
    description: 'Only original shipment15 expenses, excluding the one known non-real 60,000,000 transferred-goods row.',
    state: {
      expenses: cleanedShipment15Expenses,
    },
    summary: {
      shipmentId: TARGET_SHIPMENT_ID,
      expenseCount: cleanedShipment15Expenses.length,
      totalExpenseAmount: sumBy(cleanedShipment15Expenses, (row) => row.amount),
      removedRows: shipment15Expenses.length - cleanedShipment15Expenses.length,
      removedAmount: sumBy(shipment15Expenses, (row) => row.amount) - sumBy(cleanedShipment15Expenses, (row) => row.amount),
    },
  },
};

if (capitalContributionResult.section) {
  sections.capital_contributions_shipment15 = capitalContributionResult.section;
}

sections.general_transfers_shipment15 = cleanedGeneralTransfersSection;
sections.general_transfers_shipment15_resolved = resolvedGeneralTransfersSection;

const summary = {
  generatedAt: new Date().toISOString(),
  source: SOURCE,
  workbookSource: WORKBOOK_SOURCE || null,
  targetShipmentId: TARGET_SHIPMENT_ID,
  notes: [
    'Only original old shipment15 invoices are included.',
    'Included invoices are remapped back into the current shipment15 target.',
    'Opening balance equals total sold quantity by product, so ending warehouse stock returns to zero if no extra movements are added.',
    'Loads are grouped by date + car + product.',
    'Old negative inventory rows are ignored.',
  ],
  sections: Object.entries(sections).map(([name, value]) => ({
    name,
    description: value.description,
    file: path.join('sections', `${name}.json`),
    summary: value.summary,
  })),
};

if (capitalContributionResult.note) {
  summary.notes.push(capitalContributionResult.note);
}

ensureDir(SECTIONS_DIR);
writeJson(path.join(OUT_DIR, 'summary.json'), summary);

for (const [name, value] of Object.entries(sections)) {
  writeJson(path.join(SECTIONS_DIR, `${name}.json`), {
    section: name,
    generatedAt: new Date().toISOString(),
    description: value.description,
    summary: value.summary,
    state: value.state,
  });
}

console.log(`Shipment15 review package created in ${OUT_DIR}`);
console.log(`  Opening balance date: ${openingDate}`);
console.log(`  Opening balance rows: ${openingBalanceTransactions.length}`);
console.log(`  Daily load rows: ${loadTransactions.length}`);
console.log(`  Invoice rows: ${salesInvoices.length}`);
console.log(`  Sell rows: ${sellTransactions.length}`);
if (capitalContributionResult.section) {
  console.log(`  Capital contribution rows: ${capitalContributionResult.section.state.capitalContributions.length}`);
}
console.log(`  Cleaned general transfer rows: ${cleanedGeneralTransfersSection.state.generalTransfers.length}`);
console.log(`  Resolved general transfer rows: ${resolvedGeneralTransfersSection.state.generalTransfers.length}`);
