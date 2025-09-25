import { Component, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgCharts } from 'ag-charts-angular';
import { AnalysisService } from '../../services/analysis.service';
import { ParsingService } from '../../services/parsing.service';
import { ContextService } from '../../services/context.service';
import { DocumentAnalysis, PeriodDatum } from '../../constants';
import { AiSuggestionsService } from '../../services/ai-suggestions.service';

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

  chartOptions = signal<any>({ data: [], series: [{ type: 'line', xKey: 'periodLabel', yKey: 'revenue' }] });

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly parsingService: ParsingService,
    public readonly context: ContextService,
    private readonly ai: AiSuggestionsService
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
      next: () => {},
      error: () => {}
    });
  }
}

