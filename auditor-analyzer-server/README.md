# Auditor Analyzer Backend

Environment variables:

- `PORT`: Port for Express (default `3001`).
- `REQUIRE_TOKEN`: `true|1` to require `Authorization: Bearer ...` header.
- `OPENROUTER_API_KEY`: API key for OpenRouter.
- `OPENROUTER_MODEL`: Model id (default `meta-llama/llama-3.1-70b-instruct`).
- `OPENROUTER_REFERER`: Optional referer header for OpenRouter usage.
- `OPENROUTER_APP_TITLE`: Optional app title header for OpenRouter usage.

Run:

```bash
node index.js
```

Requests:

POST `/api/agent`

Body:

```json
{ "messages": [{"role":"user","content":"..."},{"role":"context","content":"..."}] }
```

Response includes `newMessages` with assistant JSON summary and `meta`.

