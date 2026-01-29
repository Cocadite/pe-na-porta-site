# É Os Pé Na Porta — Site (Vercel) com 1 API só

## Rotas
- `/form.html?token=...&tag=...` — formulário
- `/dashboard` — painel admin
- `/api?op=...` — **única API** com todas as operações

## Banco
Usa **Vercel Postgres** (Storage). Ele cria `POSTGRES_URL` automaticamente.

## Env vars (Vercel)
- `SITE_API_KEY` (obrigatório) — mesma chave do bot
- `DEFAULT_BONDE_LINK` (opcional)
- `SITE_BASE_URL` (opcional)

## Deploy
Suba no GitHub e importe no Vercel.
