import { Injectable } from '@angular/core';
import { PeriodDatum } from '../constants';

@Injectable({ providedIn: 'root' })
export class ParsingService {
  async parseCsv(text: string): Promise<PeriodDatum[]> {
    try {
      const Papa = (await import('papaparse')).default;
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      return (parsed.data as any[]).map((row) => this.mapRow(row));
    } catch {
      return [];
    }
  }

  async parseXlsx(arrayBuffer: ArrayBuffer): Promise<PeriodDatum[]> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    return rows.map((row) => this.mapRow(row));
  }

  async parsePdf(_arrayBuffer: ArrayBuffer): Promise<string> {
    // Intentionally simplified. Real extraction would iterate pages via pdfjs-dist.
    return '';
  }

  private mapRow(row: Record<string, unknown>): PeriodDatum {
    const num = (v: unknown): number | undefined => {
      if (v === null || v === undefined) return undefined;
      const n = Number((v as any).toString().replace(/[, ]+/g, ''));
      return isNaN(n) ? undefined : n;
    };
    return {
      periodLabel: String(row['period'] ?? row['Period'] ?? row['date'] ?? row['Date'] ?? ''),
      revenue: num(row['revenue'] ?? row['Revenue']),
      costOfGoodsSold: num(row['cogs'] ?? row['COGS'] ?? row['costOfGoodsSold']),
      operatingExpenses: num(row['opex'] ?? row['OperatingExpenses']),
      netIncome: num(row['netIncome'] ?? row['NetIncome']),
      assets: num(row['assets'] ?? row['Assets']),
      liabilities: num(row['liabilities'] ?? row['Liabilities']),
      equity: num(row['equity'] ?? row['Equity']),
      interestExpense: num(row['interest'] ?? row['InterestExpense']),
      inventory: num(row['inventory'] ?? row['Inventory']),
      receivables: num(row['receivables'] ?? row['Receivables']),
      payables: num(row['payables'] ?? row['Payables']),
      cashFlowFromOperations: num(row['cfo'] ?? row['CashFlowFromOperations'])
    };
  }
}

