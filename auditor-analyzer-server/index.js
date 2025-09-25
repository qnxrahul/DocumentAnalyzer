const express = require('express');
const cors = require('cors');
const { z } = require('zod');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const AgentRequestSchema = z.object({
  messages: z.array(
    z.object({ role: z.enum(['user','system','assistant','context']), content: z.string() })
  )
});

app.post('/api/agent', (req, res) => {
  const parsed = AgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
  }
  const { messages } = parsed.data;

  // Simple echo/analysis stub: returns a deterministic response to unblock FE
  const userText = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const response = {
    newMessages: [
      { role: 'assistant', content: 'Agent received ' + messages.length + ' messages.' },
      { role: 'assistant', content: 'Preview:\n' + userText.slice(0, 500) }
    ]
  };
  res.json(response);
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`auditor-analyzer backend listening on :${port}`);
});

