export const TOKEN_STORAGE_KEY = 'AGUI_TOKEN';
export const SESSION_ID_STORAGE_KEY = 'AGUI_SESSION_ID';
export const AGUI_API_URL = '/api/agent';

export interface AgentMessage {
  role: 'user' | 'system' | 'assistant' | 'context';
  content: string;
}

export interface PeriodDatum {
  periodLabel: string;
  revenue?: number;
  costOfGoodsSold?: number;
  operatingExpenses?: number;
  netIncome?: number;
  assets?: number;
  liabilities?: number;
  equity?: number;
  interestExpense?: number;
  inventory?: number;
  receivables?: number;
  payables?: number;
  cashFlowFromOperations?: number;
}

export interface DocumentAnalysis {
  executiveSummary: ExecutiveSummary;
  financialMetrics: FinancialMetrics;
  complianceAndRisk: ComplianceRiskIndicators;
  trends: TrendSummary;
  anomalies: AnomalySummary;
  structure: DocumentStructureInsights;
  auditHighlights: AuditHighlights;
  supportingLinks: SupportingLink[];
  aiSuggestions: AiSuggestion[];
}

export interface ExecutiveSummary {
  purpose?: string;
  reportingPeriod?: string;
  keyHighlights: {
    revenue?: number;
    netIncome?: number;
    assets?: number;
    liabilities?: number;
  };
  majorChanges?: string[];
}

export interface FinancialMetrics {
  profitability: {
    grossMargin?: number;
    netMargin?: number;
    returnOnEquity?: number;
  };
  liquidity: {
    currentRatio?: number;
    quickRatio?: number;
  };
  solvency: {
    debtToEquity?: number;
    interestCoverage?: number;
  };
  efficiency: {
    inventoryTurnover?: number;
    receivablesTurnover?: number;
  };
}

export interface ComplianceRiskIndicators {
  missingOrInconsistent: string[];
  unusualTransactions: string[];
  lateFilingsOrDelays: string[];
  nonComplianceNotes: string[];
}

export interface TrendSummary {
  periods: PeriodDatum[];
}

export interface AnomalySummary {
  notes: string[];
}

export interface DocumentStructureInsights {
  tableOfContents: { title: string; anchor?: string }[];
  keyTablesAndFigures: string[];
  glossary: string[];
  entityRelationships: string[];
}

export interface AuditHighlights {
  areasRequiringJudgment: string[];
  estimatesAndAssumptions: string[];
  internalControlDisclosures: string[];
  auditorsOpinion?: string;
}

export interface SupportingLink {
  href: string;
  description?: string;
}

export interface AiSuggestion {
  question: string;
  rationale?: string;
}

