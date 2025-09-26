const express = require('express');
const cors = require('cors');
const { z } = require('zod');
const dayjs = require('dayjs');
// Built-in fetch is available in Node 18+

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Multi-tenant state store and helpers
const stateStore = new Map();
function getTenantId(req) { return (req.headers['x-tenant-id'] || 'public').toString(); }
function getSessionId(req) { return (req.headers['x-session-id'] || '').toString(); }
function getState(tenantId, sessionId) {
  const key = `${tenantId}:${sessionId}`;
  if (!stateStore.has(key)) stateStore.set(key, { createdAt: dayjs().toISOString(), tokensUsed: 0, tokensBudget: 100000 });
  return stateStore.get(key);
}
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const k of Object.keys(source)) {
    const sv = source[k];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (typeof target[k] !== 'object' || Array.isArray(target[k]) || target[k] === null) target[k] = {};
      deepMerge(target[k], sv);
    } else {
      target[k] = sv;
    }
  }
  return target;
}

app.get('/api/state', (req, res) => {
  const tenantId = getTenantId(req);
  const sessionId = getSessionId(req);
  if (!sessionId) return res.status(400).json({ error: 'Missing X-Session-Id' });
  const state = getState(tenantId, sessionId);
  res.json({ state, tenantId, sessionId });
});

app.post('/api/state/patch', (req, res) => {
  const tenantId = getTenantId(req);
  const sessionId = getSessionId(req);
  if (!sessionId) return res.status(400).json({ error: 'Missing X-Session-Id' });
  const patch = req.body?.patch || {};
  const state = getState(tenantId, sessionId);
  deepMerge(state, patch);
  state.updatedAt = dayjs().toISOString();
  stateStore.set(`${tenantId}:${sessionId}`, state);
  res.json({ ok: true, state });
});

// Fetch remote document (HTML or PDF) server-side to avoid CORS
app.post('/api/fetch', async (req, res) => {
  try {
    const url = (req.body?.url || '').toString();
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid URL' });
    const resp = await fetch(url, { headers: { 'User-Agent': 'Auditor-Analyzer/1.0' } });
    if (!resp.ok) return res.status(resp.status).json({ error: `Fetch failed`, status: resp.status });
    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
      const arr = new Uint8Array(await resp.arrayBuffer());
      const b64 = Buffer.from(arr).toString('base64');
      return res.json({ type: 'pdf', data: b64, contentType });
    }
    const text = await resp.text();
    return res.json({ type: 'text', text, contentType });
  } catch (e) {
    res.status(500).json({ error: 'Fetch error', detail: String(e) });
  }
});

const AgentRequestSchema = z.object({
  messages: z.array(
    z.object({ role: z.enum(['user','system','assistant','context']), content: z.string() })
  )
});

app.post('/api/agent', async (req, res) => {
  try {
    const bearer = (req.headers['authorization'] || '').toString();
    const sessionId = getSessionId(req);
    const tenantId = getTenantId(req);
    if (!sessionId) return res.status(400).json({ error: 'Missing X-Session-Id' });
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

    const state = getState(tenantId, sessionId);
    const compactState = {
      executiveSummary: state.executiveSummary,
      financialMetrics: state.financialMetrics,
      anomalies: state.anomalies,
      periods: Array.isArray(state.periods) ? state.periods.slice(-4) : undefined
    };

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
          Object.keys(compactState).length ? { role: 'user', content: `State:\n${JSON.stringify(compactState).slice(0, 6000)}` } : null,
          contextJson ? { role: 'user', content: `Context:\n${contextJson.slice(0, 4000)}` } : null,
          userText ? { role: 'user', content: userText.slice(0, 4000) } : null
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
      const estimatedPromptTokens = Math.ceil((JSON.stringify(body).length) / 4);
      state.tokensUsed = (state.tokensUsed || 0) + estimatedPromptTokens;
    }

    const response = {
      newMessages: [
        { role: 'assistant', content: assistantContent }
      ],
      meta: { sessionId, tenantId, authorized: !!bearer, model: OPENROUTER_MODEL, ts: dayjs().toISOString() }
    };
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: 'Agent failure', detail: String(e) });
  }
});

// Generic tools: compute metrics and anomalies from periods
const numberOrUndefined = (v) => {
  if (v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/[, ]+/g, ''));
  return isNaN(n) ? undefined : n;
};
const mapRow = (row) => ({
  periodLabel: String(row['period'] ?? row['Period'] ?? row['date'] ?? row['Date'] ?? ''),
  revenue: numberOrUndefined(row['revenue'] ?? row['Revenue']),
  costOfGoodsSold: numberOrUndefined(row['cogs'] ?? row['COGS'] ?? row['costOfGoodsSold']),
  operatingExpenses: numberOrUndefined(row['opex'] ?? row['OperatingExpenses']),
  netIncome: numberOrUndefined(row['netIncome'] ?? row['NetIncome']),
  assets: numberOrUndefined(row['assets'] ?? row['Assets']),
  liabilities: numberOrUndefined(row['liabilities'] ?? row['Liabilities']),
  equity: numberOrUndefined(row['equity'] ?? row['Equity']),
  interestExpense: numberOrUndefined(row['interest'] ?? row['InterestExpense']),
  inventory: numberOrUndefined(row['inventory'] ?? row['Inventory']),
  receivables: numberOrUndefined(row['receivables'] ?? row['Receivables']),
  payables: numberOrUndefined(row['payables'] ?? row['Payables']),
  cashFlowFromOperations: numberOrUndefined(row['cfo'] ?? row['CashFlowFromOperations'])
});
const average = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0;
const stddev = (arr, mean) => arr.length ? Math.sqrt(arr.reduce((acc, v)=>acc+Math.pow(v-mean,2),0) / arr.length) : 0;

app.post('/api/tools/metrics', (req, res) => {
  const tenantId = getTenantId(req);
  const sessionId = getSessionId(req);
  if (!sessionId) return res.status(400).json({ error: 'Missing X-Session-Id' });
  const state = getState(tenantId, sessionId);
  const rowsRaw = Array.isArray(req.body?.periods) ? req.body.periods : (Array.isArray(state.periods) ? state.periods : []);
  const rows = rowsRaw.map(mapRow);
  const last = rows.at(-1) || {};
  const result = {
    profitability: {},
    liquidity: {},
    solvency: {},
    efficiency: {}
  };
  const grossProfit = (last.revenue !== undefined && last.costOfGoodsSold !== undefined) ? (last.revenue - last.costOfGoodsSold) : undefined;
  if (grossProfit !== undefined && last.revenue) result.profitability.grossMargin = grossProfit / last.revenue;
  if (last.netIncome !== undefined && last.revenue) result.profitability.netMargin = last.netIncome / last.revenue;
  if (last.netIncome !== undefined && last.equity) result.profitability.returnOnEquity = last.netIncome / last.equity;
  const currentAssets = (last.assets ?? 0);
  const currentLiabilities = (last.liabilities ?? 0);
  if (currentLiabilities) {
    result.liquidity.currentRatio = currentAssets / currentLiabilities;
    const inventory = last.inventory ?? 0;
    result.liquidity.quickRatio = (currentAssets - inventory) / currentLiabilities;
  }
  if (last.liabilities && last.equity) result.solvency.debtToEquity = last.liabilities / last.equity;
  if (last.netIncome && last.interestExpense) result.solvency.interestCoverage = last.netIncome / last.interestExpense;
  if (last.inventory && last.costOfGoodsSold) result.efficiency.inventoryTurnover = last.costOfGoodsSold / last.inventory;
  const revs = rows.map(r => r.revenue).filter(v => typeof v === 'number');
  if (revs.length && last.revenue) result.efficiency.receivablesTurnover = last.revenue / average(rows.map(r => r.receivables || 0));
  state.financialMetrics = result;
  state.periods = rows;
  state.updatedAt = dayjs().toISOString();
  res.json({ financialMetrics: result });
});

app.post('/api/tools/anomalies', (req, res) => {
  const tenantId = getTenantId(req);
  const sessionId = getSessionId(req);
  if (!sessionId) return res.status(400).json({ error: 'Missing X-Session-Id' });
  const state = getState(tenantId, sessionId);
  const rowsRaw = Array.isArray(req.body?.periods) ? req.body.periods : (Array.isArray(state.periods) ? state.periods : []);
  const rows = rowsRaw.map(mapRow);
  const notes = [];
  if (rows.length >= 3) {
    const last3 = rows.slice(-3);
    const rev = last3.map(r => r.revenue || 0);
    const mean = average(rev);
    const sd = stddev(rev, mean);
    const last = rev.at(-1);
    if (sd > 0 && Math.abs(last - mean) > 2 * sd) notes.push('Revenue is > 2σ from 3-period mean');
  }
  state.anomalies = { notes };
  state.periods = rows;
  state.updatedAt = dayjs().toISOString();
  res.json({ anomalies: { notes } });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`auditor-analyzer backend listening on :${port}`);
});

