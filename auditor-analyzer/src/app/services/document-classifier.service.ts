import { Injectable } from '@angular/core';

export type DocumentType = 'audit_report' | 'financial_statement' | 'tax_filing' | 'unknown';

@Injectable({ providedIn: 'root' })
export class DocumentClassifierService {
  classify(text: string): DocumentType {
    const t = text.toLowerCase();
    if (/independent auditor'?s report|audit (opinion|report)/i.test(text)) return 'audit_report';
    if (/balance sheet|statement of financial position|income statement|statement of operations|cash flows/i.test(text)) return 'financial_statement';
    if (/form 10-k|form 10-q|form 1120|form 1065|irs|tax return|schedule/i.test(text)) return 'tax_filing';
    return 'unknown';
  }
}

