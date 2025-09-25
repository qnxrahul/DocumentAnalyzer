import { Component, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgCharts } from 'ag-charts-angular';
import { AnalysisService } from '../../services/analysis.service';
import { ParsingService } from '../../services/parsing.service';
import { ContextService } from '../../services/context.service';
import { DocumentAnalysis, PeriodDatum } from '../../constants';
import { AiSuggestionsService } from '../../services/ai-suggestions.service';
import { TextExtractionService } from '../../services/text-extraction.service';
import { DocumentClassifierService, DocumentType } from '../../services/document-classifier.service';

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

  chartOptions = signal<any>({ data: [], series: [{ type: 'line', xKey: 'periodLabel', yKey: 'revenue' }] });
  rawText = signal<string>('');
  classifiedAs = signal<DocumentType>('unknown');

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly parsingService: ParsingService,
    public readonly context: ContextService,
    private readonly ai: AiSuggestionsService,
    private readonly textExtraction: TextExtractionService,
    private readonly classifier: DocumentClassifierService
  ) {
    effect(() => {
      const rows = this.periods();
      this.analysis.set(rows.length ? this.analysisService.buildAnalysis(rows) : null);
      this.chartOptions.update((opts: any) => ({ ...opts, data: rows }));
    });
  }

  async onCsvTextChange(text: string): Promise<void> {
    const rows = await this.parsingService.parseCsv(text);
    this.periods.set(rows);
    // Kick off a backend suggestion call using latest context
    const messages = [
      { role: 'user', content: 'Analyze financial CSV just uploaded' },
      { role: 'context', content: JSON.stringify({ context: this.context.state }) }
    ];
    this.ai.analyze(messages).subscribe({
      next: (res) => {
        const texts = res.newMessages?.map(m => m.content) ?? [];
        this.aiMessages.set(texts);
      },
      error: () => {}
    });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files?.length) return;
    const file = input.files[0];
    const arrayBuffer = await file.arrayBuffer();
    if (file.name.endsWith('.csv')) {
      const text = new TextDecoder().decode(arrayBuffer);
      await this.onCsvTextChange(text);
      return;
    }
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const rows = await this.parsingService.parseXlsx(arrayBuffer);
      this.periods.set(rows);
      return;
    }
    if (file.name.endsWith('.pdf')) {
      const text = await this.textExtraction.extractPdfText(arrayBuffer);
      this.rawText.set(text);
      await this.classifyAndAnalyzeRawText();
      return;
    }
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
    const messages = [
      { role: 'system', content: 'You are an assistant that extracts financial metrics and audit highlights from complex documents.' },
      { role: 'context', content: JSON.stringify({ docType }) },
      { role: 'user', content: text.slice(0, 8000) }
    ];
    this.ai.analyze(messages).subscribe({
      next: (res) => {
        const texts = res.newMessages?.map(m => m.content) ?? [];
        this.aiMessages.set(texts);
      },
      error: () => {}
    });
  }
}

