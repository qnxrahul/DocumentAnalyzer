import { Injectable, signal } from '@angular/core';

export interface AnalyzerContextState {
  documentPurpose?: string;
  reportingPeriod?: string;
  entities?: string[];
  userNotes?: string[];
}

@Injectable({ providedIn: 'root' })
export class ContextService {
  private readonly stateSig = signal<AnalyzerContextState>({});

  get state(): AnalyzerContextState {
    return this.stateSig();
  }

  update(partial: Partial<AnalyzerContextState>): void {
    this.stateSig.update((current) => ({ ...current, ...partial }));
  }
}

