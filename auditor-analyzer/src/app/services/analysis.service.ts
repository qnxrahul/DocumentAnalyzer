import { Injectable } from '@angular/core';
import {
  AiSuggestion,
  AnomalySummary,
  AuditHighlights,
  ComplianceRiskIndicators,
  DocumentAnalysis,
  DocumentStructureInsights,
  ExecutiveSummary,
  FinancialMetrics,
  PeriodDatum,
  TrendSummary
} from '../constants';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  computeExecutiveSummary(rows: PeriodDatum[]): ExecutiveSummary {
    const last = rows.at(-1);
    const prior = rows.at(-2);
    const majorChanges: string[] = [];
    if (last && prior && last.revenue !== undefined && prior.revenue !== undefined) {
      const delta = last.revenue - prior.revenue;
      const pct = prior.revenue !== 0 ? (delta / prior.revenue) * 100 : 0;
      majorChanges.push(`Revenue change vs prior: ${pct.toFixed(1)}%`);
    }
    return {
      purpose: 'Financial statement analysis',
      reportingPeriod: last?.periodLabel,
      keyHighlights: {
        revenue: last?.revenue,
        netIncome: last?.netIncome,
        assets: last?.assets,
        liabilities: last?.liabilities
      },
      majorChanges
    };
  }

  computeFinancialMetrics(rows: PeriodDatum[]): FinancialMetrics {
    const last = rows.at(-1);
    const result: FinancialMetrics = {
      profitability: {},
      liquidity: {},
      solvency: {},
      efficiency: {}
    };
    if (!last) return result;

    const grossProfit =
      last.revenue !== undefined && last.costOfGoodsSold !== undefined
        ? last.revenue - last.costOfGoodsSold
        : undefined;
    if (grossProfit !== undefined && last.revenue) {
      result.profitability.grossMargin = grossProfit / last.revenue;
    }
    if (last.netIncome !== undefined && last.revenue) {
      result.profitability.netMargin = last.netIncome / last.revenue;
    }
    if (last.netIncome !== undefined && last.equity) {
      result.profitability.returnOnEquity = last.netIncome / last.equity;
    }

    const currentAssets = (last.assets ?? 0);
    const currentLiabilities = (last.liabilities ?? 0);
    if (currentLiabilities) {
      result.liquidity.currentRatio = currentAssets / currentLiabilities;
      const inventory = last.inventory ?? 0;
      result.liquidity.quickRatio = (currentAssets - inventory) / currentLiabilities;
    }

    if (last.liabilities && last.equity) {
      result.solvency.debtToEquity = last.liabilities / last.equity;
    }
    if (last.netIncome && last.interestExpense) {
      result.solvency.interestCoverage = last.netIncome / last.interestExpense;
    }

    if (last.inventory && last.costOfGoodsSold) {
      result.efficiency.inventoryTurnover = last.costOfGoodsSold / last.inventory;
    }
    const avgReceivables = this.average(rows.map(r => r.receivables).filter(this.isNum));
    if (avgReceivables && last.revenue) {
      result.efficiency.receivablesTurnover = last.revenue / avgReceivables;
    }
    return result;
  }

  computeComplianceRisk(rows: PeriodDatum[]): ComplianceRiskIndicators {
    const missing: string[] = [];
    const fields: (keyof PeriodDatum)[] = ['revenue','netIncome','assets','liabilities'];
    const last = rows.at(-1) ?? {} as PeriodDatum;
    for (const f of fields) if (last[f] === undefined) missing.push(`Missing ${String(f)} in latest period`);
    const unusual: string[] = [];
    const lateOrDelays: string[] = [];
    const nonCompliance: string[] = [];
    return {
      missingOrInconsistent: missing,
      unusualTransactions: unusual,
      lateFilingsOrDelays: lateOrDelays,
      nonComplianceNotes: nonCompliance
    };
  }

  computeTrends(rows: PeriodDatum[]): TrendSummary {
    return { periods: rows };
  }

  computeAnomalies(rows: PeriodDatum[]): AnomalySummary {
    const notes: string[] = [];
    if (rows.length >= 3) {
      const last3 = rows.slice(-3);
      const rev = last3.map(r => r.revenue ?? 0);
      const mean = this.average(rev);
      const std = this.stddev(rev, mean);
      const last = rev.at(-1)!;
      if (std > 0 && Math.abs(last - mean) > 2 * std) {
        notes.push('Revenue is > 2σ from 3-period mean');
      }
    }
    return { notes };
  }

  computeStructureInsights(): DocumentStructureInsights {
    return {
      tableOfContents: [
        { title: 'Executive Summary', anchor: 'exec' },
        { title: 'Financial Metrics & Ratios', anchor: 'metrics' },
        { title: 'Compliance & Risk', anchor: 'risk' },
        { title: 'Trend Analysis', anchor: 'trends' },
        { title: 'Anomaly Detection', anchor: 'anomalies' },
        { title: 'Document Structure', anchor: 'structure' },
        { title: 'Audit Highlights', anchor: 'highlights' },
        { title: 'Supporting Links', anchor: 'links' },
        { title: 'AI Suggestions', anchor: 'ai' }
      ],
      keyTablesAndFigures: [],
      glossary: ['ROE','Current Ratio','Debt-to-Equity'],
      entityRelationships: []
    };
  }

  computeAuditHighlights(rows: PeriodDatum[]): AuditHighlights {
    return {
      areasRequiringJudgment: ['Revenue recognition timing','Allowance for doubtful accounts'],
      estimatesAndAssumptions: ['Useful lives for depreciation','Inventory valuation method'],
      internalControlDisclosures: ['Segregation of duties noted as adequate'],
      auditorsOpinion: undefined
    };
  }

  computeSupportingLinks(): { href: string; description?: string }[] {
    return [];
  }

  computeAiSuggestions(rows: PeriodDatum[]): AiSuggestion[] {
    const suggestions: AiSuggestion[] = [];
    const last = rows.at(-1);
    if (last?.liabilities && last?.equity && last.liabilities / last.equity > 2) {
      suggestions.push({ question: 'Why is debt-to-equity above 2?', rationale: 'High leverage risk' });
    }
    return suggestions;
  }

  buildAnalysis(rows: PeriodDatum[]): DocumentAnalysis {
    return {
      executiveSummary: this.computeExecutiveSummary(rows),
      financialMetrics: this.computeFinancialMetrics(rows),
      complianceAndRisk: this.computeComplianceRisk(rows),
      trends: this.computeTrends(rows),
      anomalies: this.computeAnomalies(rows),
      structure: this.computeStructureInsights(),
      auditHighlights: this.computeAuditHighlights(rows),
      supportingLinks: this.computeSupportingLinks(),
      aiSuggestions: this.computeAiSuggestions(rows)
    };
  }

  private isNum = (v: number | undefined): v is number => typeof v === 'number' && !isNaN(v);
  private average(values: number[]): number {
    if (!values.length) return 0;
    const sum = values.reduce((a,b) => a + b, 0);
    return sum / values.length;
  }
  private stddev(values: number[], mean: number): number {
    if (!values.length) return 0;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

