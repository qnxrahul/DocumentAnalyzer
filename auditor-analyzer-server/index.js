const express = require('express');
const cors = require('cors');
const { z } = require('zod');
const dayjs = require('dayjs');
// Built-in fetch is available in Node 18+

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const AgentRequestSchema = z.object({
  messages: z.array(
    z.object({ role: z.enum(['user','system','assistant','context']), content: z.string() })
  )
});

app.post('/api/agent', async (req, res) => {
  try {
    const bearer = (req.headers['authorization'] || '').toString();
    const sessionId = (req.headers['x-session-id'] || '').toString();
    const parsed = AgentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }
    const { messages } = parsed.data;

    // Optional token enforcement
    const requireToken = process.env.REQUIRE_TOKEN === 'true' || process.env.REQUIRE_TOKEN === '1';
    if (requireToken && !bearer) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
    const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct';

    // Build a consolidated prompt from messages
    const contextBlobs = [];
    const userBlobs = [];
    for (const m of messages) {
      if (m.role === 'context') contextBlobs.push(m.content);
      if (m.role === 'user') userBlobs.push(m.content);
    }
    const contextJson = contextBlobs.join('\n');
    const userText = userBlobs.join('\n');

    const systemPrompt = [
      'You are an auditing AI assistant for Big Four-grade reviews.',
      'Given CSV data and/or raw text from audit reports, financial statements, or tax filings:',
      '- Extract key metrics, compute ratios, identify risks/anomalies, and summarize insights.',
      '- Output a concise JSON summary matching this TypeScript shape "DocumentAnalysis" (no extra prose):',
      '{ executiveSummary: { purpose?: string, reportingPeriod?: string, keyHighlights: { revenue?: number, netIncome?: number, assets?: number, liabilities?: number }, majorChanges?: string[] },',
      '  financialMetrics: { profitability: { grossMargin?: number, netMargin?: number, returnOnEquity?: number }, liquidity: { currentRatio?: number, quickRatio?: number }, solvency: { debtToEquity?: number, interestCoverage?: number }, efficiency: { inventoryTurnover?: number, receivablesTurnover?: number } },',
      '  complianceAndRisk: { missingOrInconsistent: string[], unusualTransactions: string[], lateFilingsOrDelays: string[], nonComplianceNotes: string[] },',
      '  trends: { periods: any[] },',
      '  anomalies: { notes: string[] },',
      '  structure: { tableOfContents: { title: string, anchor?: string }[], keyTablesAndFigures: string[], glossary: string[], entityRelationships: string[] },',
      '  auditHighlights: { areasRequiringJudgment: string[], estimatesAndAssumptions: string[], internalControlDisclosures: string[], auditorsOpinion?: string },',
      '  supportingLinks: { href: string, description?: string }[],',
      '  aiSuggestions: { question: string, rationale?: string }[],',
      '  aiQuestions?: string[], deeperInvestigations?: string[], risks?: string[], opportunities?: string[] }',
      'Ensure numbers are numeric, not strings. If data is insufficient, leave fields undefined or empty arrays.'
    ].join('\n');

    let assistantContent = '';
    if (!OPENROUTER_API_KEY) {
      // Fallback behavior when OpenRouter is not configured
      assistantContent = JSON.stringify({
        executiveSummary: {
          purpose: 'Not configured (OPENROUTER_API_KEY missing)',
          reportingPeriod: undefined,
          keyHighlights: {},
          majorChanges: []
        },
        financialMetrics: { profitability: {}, liquidity: {}, solvency: {}, efficiency: {} },
        complianceAndRisk: { missingOrInconsistent: ['OpenRouter key missing'], unusualTransactions: [], lateFilingsOrDelays: [], nonComplianceNotes: [] },
        trends: { periods: [] },
        anomalies: { notes: [] },
        structure: { tableOfContents: [], keyTablesAndFigures: [], glossary: [], entityRelationships: [] },
        auditHighlights: { areasRequiringJudgment: [], estimatesAndAssumptions: [], internalControlDisclosures: [] },
        supportingLinks: [],
        aiSuggestions: [{ question: 'Set OPENROUTER_API_KEY to enable AI extraction.' }],
        aiQuestions: ['What drives the revenue change?'],
        deeperInvestigations: ['Validate revenue recognition cutoff for Q4'],
        risks: ['High leverage may pressure covenants'],
        opportunities: ['Working capital optimization via receivables']
      }, null, 2);
    } else {
      const body = {
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          contextJson ? { role: 'user', content: `Context:\n${contextJson}` } : null,
          { role: 'user', content: userText.slice(0, 12000) }
        ].filter(Boolean),
        temperature: 0.2,
        max_tokens: 1800
      };

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001',
          'X-Title': process.env.OPENROUTER_APP_TITLE || 'Auditor Analyzer'
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(502).json({ error: 'OpenRouter error', detail: errText });
      }
      const data = await resp.json();
      assistantContent = data?.choices?.[0]?.message?.content || '';
      if (!assistantContent) assistantContent = 'No content returned by model.';
    }

    const response = {
      newMessages: [
        { role: 'assistant', content: assistantContent }
      ],
      meta: { sessionId, authorized: !!bearer, model: OPENROUTER_MODEL, ts: dayjs().toISOString() }
    };
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: 'Agent failure', detail: String(e) });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`auditor-analyzer backend listening on :${port}`);
});

