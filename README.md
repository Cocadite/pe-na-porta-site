# 🌐 Site + API + Dashboard (Vercel)

## Requisitos
- Supabase (gratuito) para banco
- Configurar ENV no Vercel (ver `.env.example`)
- Rodar o SQL do arquivo `SUPABASE_SCHEMA.sql` no Supabase

## Rotas
- `/form?token=...` -> formulário
- `/dashboard` -> painel admin (login Discord)
- `/api/*` -> API

## Importante
- Copie `BOT_API_KEY` do Vercel e cole no `.env` do bot (ShardCloud)
- Configure `DISCORD_REDIRECT_URI` com seu domínio Vercel
