import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/analyzer/analyzer.page').then(m => m.AnalyzerPage)
  }
];
