import { Component, effect, ElementRef, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgCharts } from 'ag-charts-angular';
import { AnalysisService } from '../../services/analysis.service';
import { ParsingService } from '../../services/parsing.service';
import { ContextService } from '../../services/context.service';
import { ActionItem, AgentMessage, DocumentAnalysis, PeriodDatum } from '../../constants';
import { AiSuggestionsService } from '../../services/ai-suggestions.service';
import { TextExtractionService } from '../../services/text-extraction.service';
import { DocumentClassifierService, DocumentType } from '../../services/document-classifier.service';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-analyzer-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AgCharts],
  templateUrl: './analyzer.page.html',
  styleUrls: ['./analyzer.page.scss']
})
export class AnalyzerPage {
  readonly analysis = signal<DocumentAnalysis | null>(null);
  readonly periods = signal<PeriodDatum[]>([]);
  readonly execExpanded = signal(true);
  readonly metricsExpanded = signal(true);
  readonly riskExpanded = signal(true);
  readonly trendsExpanded = signal(true);
  readonly anomaliesExpanded = signal(true);
  readonly structureExpanded = signal(true);
  readonly highlightsExpanded = signal(true);
  readonly linksExpanded = signal(true);
  readonly aiExpanded = signal(true);
  readonly aiMessages = signal<string[]>([]);
  readonly isLoadingParse = signal(false);
  readonly isLoadingAi = signal(false);
  readonly actionItems = signal<ActionItem[]>([]);

  chartOptions = signal<any>({ data: [], series: [{ type: 'line', xKey: 'periodLabel', yKey: 'revenue' }] });
  rawText = signal<string>('');
  classifiedAs = signal<DocumentType>('unknown');

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly parsingService: ParsingService,
    public readonly context: ContextService,
    private readonly ai: AiSuggestionsService,
    private readonly textExtraction: TextExtractionService,
    private readonly classifier: DocumentClassifierService,
    private readonly stateService: StateService
  ) {
    effect(() => {
      const rows = this.periods();
      this.analysis.set(rows.length ? this.analysisService.buildAnalysis(rows) : null);
      this.chartOptions.update((opts: any) => ({ ...opts, data: rows }));
      const a = this.analysis();
      if (a) {
        this.deriveAndMergeActionItems(a);
      }
    });
    // Load persisted action items on init
    this.stateService.getState().subscribe((resp) => {
      const items = (resp?.state?.actionItems as ActionItem[]) || [];
      this.actionItems.set(items);
    });
  }

  async onCsvTextChange(text: string): Promise<void> {
    this.isLoadingParse.set(true);
    try {
      const rows = await this.parsingService.parseCsv(text);
      this.periods.set(rows);
      this.stateService.patchState({ periods: rows }).subscribe();
      this.stateService.computeMetrics(rows).subscribe();
      this.stateService.computeAnomalies(rows).subscribe();
    } finally {
      this.isLoadingParse.set(false);
    }
    // Kick off a backend suggestion call using latest context
    const messages: AgentMessage[] = [
      { role: 'user', content: 'Analyze financial CSV just uploaded' },
      { role: 'context', content: JSON.stringify({ context: this.context.state }) }
    ];
    this.isLoadingAi.set(true);
    this.ai.analyze(messages).subscribe({
      next: (res: { newMessages: AgentMessage[] }) => {
        const texts = res.newMessages?.map((m: AgentMessage) => m.content) ?? [];
        this.handleAiTexts(texts);
      },
      error: () => { this.isLoadingAi.set(false); }
    });
  }

  // Action items handlers
  addActionItem(): void {
    const newItem: ActionItem = {
      id: crypto.randomUUID(),
      title: 'New action item',
      owner: 'Auditor',
      priority: 'Medium',
      completed: false
    };
    const next = [...this.actionItems(), newItem];
    this.actionItems.set(next);
    this.persistActionItems(next);
  }

  updateActionItem(id: string, patch: Partial<ActionItem>): void {
    const next = this.actionItems().map((it) => it.id === id ? { ...it, ...patch } : it);
    this.actionItems.set(next);
    this.persistActionItems(next);
  }

  removeActionItem(id: string): void {
    const next = this.actionItems().filter((it) => it.id !== id);
    this.actionItems.set(next);
    this.persistActionItems(next);
  }

  private persistActionItems(items: ActionItem[]): void {
    this.stateService.patchState({ actionItems: items }).subscribe();
  }

  private deriveAndMergeActionItems(analysis: DocumentAnalysis): void {
    const derived: ActionItem[] = [];
    const pushUnique = (title: string, priority: ActionItem['priority'] = 'Medium') => {
      const exists = this.actionItems().some(it => it.title.trim().toLowerCase() === title.trim().toLowerCase());
      if (!exists) {
        derived.push({ id: crypto.randomUUID(), title, owner: 'Auditor', priority, completed: false });
      }
    };
    // Compliance/risk -> High priority actions
    for (const m of (analysis.complianceAndRisk?.missingOrInconsistent || [])) {
      pushUnique(`Resolve: ${m}`, 'High');
    }
    for (const u of (analysis.complianceAndRisk?.unusualTransactions || [])) {
      pushUnique(`Investigate unusual transaction: ${u}`, 'High');
    }
    for (const n of (analysis.complianceAndRisk?.nonComplianceNotes || [])) {
      pushUnique(`Address non-compliance: ${n}`, 'High');
    }
    // Anomalies -> High priority investigations
    for (const n of (analysis.anomalies?.notes || [])) {
      pushUnique(`Investigate anomaly: ${n}`, 'High');
    }
    // AI suggestions -> Follow-ups
    for (const s of (analysis.aiSuggestions || [])) {
      pushUnique(`Follow up: ${s.question}`, 'Medium');
    }
    // Risks/Opportunities -> Tasks
    for (const r of (analysis.risks || [])) {
      pushUnique(`Mitigate risk: ${r}`, 'High');
    }
    for (const o of (analysis.opportunities || [])) {
      pushUnique(`Explore opportunity: ${o}`, 'Low');
    }
    if (derived.length) {
      const next = [...this.actionItems(), ...derived];
      this.actionItems.set(next);
      this.persistActionItems(next);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    this.isLoadingParse.set(true);
    const input = event.target as HTMLInputElement | null;
    if (!input?.files?.length) return;
    const file = input.files[0];
    const arrayBuffer = await file.arrayBuffer();
    if (file.name.endsWith('.csv')) {
      const text = new TextDecoder().decode(arrayBuffer);
      await this.onCsvTextChange(text);
      this.isLoadingParse.set(false);
      return;
    }
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      try {
        const rows = await this.parsingService.parseXlsx(arrayBuffer);
        this.periods.set(rows);
        this.stateService.patchState({ periods: rows }).subscribe();
        this.stateService.computeMetrics(rows).subscribe();
        this.stateService.computeAnomalies(rows).subscribe();
        // Kick off AI suggestions for XLSX uploads as well
        const messages: AgentMessage[] = [
          { role: 'user', content: 'Analyze financial XLSX just uploaded' },
          { role: 'context', content: JSON.stringify({ context: this.context.state }) }
        ];
        this.isLoadingAi.set(true);
        this.ai.analyze(messages).subscribe({
          next: (res: { newMessages: AgentMessage[] }) => {
            const texts = res.newMessages?.map((m: AgentMessage) => m.content) ?? [];
            this.handleAiTexts(texts);
          },
          error: () => { this.isLoadingAi.set(false); }
        });
      } finally {
        this.isLoadingParse.set(false);
      }
      return;
    }
    if (file.name.endsWith('.pdf')) {
      try {
        const text = await this.textExtraction.extractPdfText(arrayBuffer);
        this.rawText.set(text);
        await this.classifyAndAnalyzeRawText();
      } finally {
        this.isLoadingParse.set(false);
      }
      return;
    }
    this.isLoadingParse.set(false);
  }

  onRawTextChange(text: string): void {
    this.rawText.set(text);
  }

  async classifyAndAnalyzeRawText(): Promise<void> {
    const text = this.rawText();
    if (!text?.trim()) return;
    const docType = this.classifier.classify(text);
    this.classifiedAs.set(docType);
    this.context.update({ documentPurpose: docType });
    // Send to agent for deeper parsing/LLM-based extraction (stubbed)
    const chunks: string[] = [];
    const maxChunks = 6;
    const chunkSize = 6000;
    for (let i = 0; i < Math.min(text.length, maxChunks * chunkSize); i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    const messages: AgentMessage[] = [
      { role: 'system', content: 'You are an assistant that extracts financial metrics and audit highlights from complex documents.' },
      { role: 'context', content: JSON.stringify({ docType }) },
      ...chunks.map((c) => ({ role: 'user', content: c }))
    ];
    this.isLoadingAi.set(true);
    this.ai.analyze(messages).subscribe({
      next: (res: { newMessages: AgentMessage[] }) => {
        const texts = res.newMessages?.map((m: AgentMessage) => m.content) ?? [];
        this.handleAiTexts(texts);
      },
      error: () => { this.isLoadingAi.set(false); }
    });
  }

  onAnalyzeUrl(url: string): void {
    if (!url?.trim()) return;
    this.isLoadingAi.set(true);
    this.stateService.fetchUrl(url).subscribe({
      next: async (resp) => {
        if (resp.type === 'pdf' && resp.data) {
          try {
            const bin = Uint8Array.from(atob(resp.data), c => c.charCodeAt(0)).buffer;
            const text = await this.textExtraction.extractPdfText(bin);
            this.rawText.set(text);
            await this.classifyAndAnalyzeRawText();
          } finally {
            // classifyAndAnalyzeRawText handles isLoadingAi flag
          }
          return;
        }
        if (resp.type === 'text' && resp.text) {
          const html = resp.text;
          // Strip HTML to text
          const div = document.createElement('div');
          div.innerHTML = html;
          const text = div.textContent || div.innerText || '';
          this.rawText.set(text);
          await this.classifyAndAnalyzeRawText();
          return;
        }
        this.isLoadingAi.set(false);
      },
      error: () => { this.isLoadingAi.set(false); }
    });
  }

  @ViewChild('acContainer', { static: false }) acContainer?: ElementRef<HTMLDivElement>;
  private renderAdaptiveCards(texts: string[]): void {
    if (!this.acContainer) return;
    const container = this.acContainer.nativeElement;
    container.innerHTML = '';
    // Try to parse the first message as JSON summary, otherwise show plain text
    let json: any = null;
    try { json = JSON.parse(texts[0] ?? ''); } catch {}
    const { AdaptiveCard } = require('adaptivecards');
    const { Template } = require('adaptivecards-templating');
    const cardTemplate = new Template({
      type: 'AdaptiveCard', version: '1.5', body: [
        { type: 'TextBlock', text: 'AI Summary', weight: 'Bolder', size: 'Medium' },
        { type: 'TextBlock', wrap: true, text: json ? '' : (texts.join('\n\n').slice(0, 4000)) },
        { type: 'TextBlock', text: 'Executive Summary (editable)', weight: 'Bolder', spacing: 'Medium' },
        { type: 'Input.Text', id: 'exec_purpose', placeholder: 'Purpose', value: '${executiveSummary.purpose}' },
        { type: 'Input.Text', id: 'exec_reportingPeriod', placeholder: 'Reporting Period', value: '${executiveSummary.reportingPeriod}' },
        { type: 'TextBlock', text: 'Key Highlights', weight: 'Bolder' },
        { type: 'Input.Text', id: 'exec_revenue', placeholder: 'Revenue', value: '${executiveSummary.keyHighlights.revenue}' },
        { type: 'Input.Text', id: 'exec_netIncome', placeholder: 'Net Income', value: '${executiveSummary.keyHighlights.netIncome}' },
        { type: 'Input.Text', id: 'exec_assets', placeholder: 'Assets', value: '${executiveSummary.keyHighlights.assets}' },
        { type: 'Input.Text', id: 'exec_liabilities', placeholder: 'Liabilities', value: '${executiveSummary.keyHighlights.liabilities}' },
        { type: 'TextBlock', text: 'Auditor Instructions (policy / follow-up)', weight: 'Bolder', spacing: 'Medium' },
        { type: 'Input.Text', id: 'auditor_policy', isMultiline: true, placeholder: 'Add policy constraints or follow-up questions for the AI...' }
      ],
      actions: [
        { type: 'Action.Submit', title: 'Save Edits', data: { action: 'save_edits' } },
        { type: 'Action.Submit', title: 'Ask AI with Instructions', data: { action: 'ask_ai' } }
      ]
    });
    const data = json ?? {};
    const cardJson = cardTemplate.expand({ $root: data });
    const card = new AdaptiveCard();
    card.parse(cardJson);
    // Handle actions for Save and Ask AI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (card as any).onExecuteAction = (action: any) => {
      // Collect all inputs
      const inputs: Record<string, any> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (card as any).getAllInputs().forEach((i: any) => { inputs[i.id] = i.value; });
      const which = action?.data?.action;
      if (which === 'save_edits') {
        const parseNum = (v: unknown): number | undefined => {
          if (v === null || v === undefined || String(v).trim() === '') return undefined;
          const n = Number(String(v).replace(/[, ]+/g, ''));
          return isNaN(n) ? undefined : n;
        };
        const current = this.analysis();
        const updatedExec = {
          purpose: inputs['exec_purpose'] ?? current?.executiveSummary?.purpose,
          reportingPeriod: inputs['exec_reportingPeriod'] ?? current?.executiveSummary?.reportingPeriod,
          keyHighlights: {
            revenue: parseNum(inputs['exec_revenue']) ?? current?.executiveSummary?.keyHighlights?.revenue,
            netIncome: parseNum(inputs['exec_netIncome']) ?? current?.executiveSummary?.keyHighlights?.netIncome,
            assets: parseNum(inputs['exec_assets']) ?? current?.executiveSummary?.keyHighlights?.assets,
            liabilities: parseNum(inputs['exec_liabilities']) ?? current?.executiveSummary?.keyHighlights?.liabilities
          }
        } as any;
        if (current) {
          this.analysis.set({
            ...current,
            executiveSummary: { ...current.executiveSummary, ...updatedExec, keyHighlights: { ...current.executiveSummary.keyHighlights, ...updatedExec.keyHighlights } }
          });
          this.stateService.patchState({ executiveSummary: this.analysis()!.executiveSummary }).subscribe();
        }
      }
      if (which === 'ask_ai') {
        const policy = String(inputs['auditor_policy'] || '').slice(0, 4000);
        const messages: AgentMessage[] = [
          { role: 'system', content: 'You are an assistant that refines prior analysis based on auditor policies/instructions. Update the JSON summary accordingly.' },
          { role: 'context', content: JSON.stringify({ state: this.context.state, policy }).slice(0, 8000) },
          { role: 'user', content: policy || 'Apply policy to refine the analysis.' }
        ];
        this.isLoadingAi.set(true);
        this.ai.analyze(messages).subscribe({
          next: (res: { newMessages: AgentMessage[] }) => {
            const texts = res.newMessages?.map((m: AgentMessage) => m.content) ?? [];
            this.aiMessages.set(texts);
            this.renderAdaptiveCards(texts);
            this.isLoadingAi.set(false);
          },
          error: () => { this.isLoadingAi.set(false); }
        });
      }
    };
    const rendered = card.render();
    container.appendChild(rendered);
  }

  private handleAiTexts(texts: string[]): void {
    this.aiMessages.set(texts);
    this.renderAdaptiveCards(texts);
    // Try to use AI JSON as the document analysis
    try {
      const maybe = JSON.parse(texts[0] ?? '');
      if (maybe && typeof maybe === 'object') {
        // Basic shape guard
        if (maybe.executiveSummary && maybe.financialMetrics && maybe.complianceAndRisk) {
          this.analysis.set(maybe as any);
          const trendData = maybe?.trends?.periods;
          if (Array.isArray(trendData)) {
            this.chartOptions.update((opts: any) => ({ ...opts, data: trendData }));
          }
          this.stateService.patchState({ analysis: maybe }).subscribe();
          this.deriveAndMergeActionItems(maybe as any);
        }
      }
    } catch {
      // ignore non-JSON
    } finally {
      this.isLoadingAi.set(false);
    }
  }
}

