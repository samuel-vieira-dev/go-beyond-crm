# Go Beyond Ops

Plataforma interna de gestão da operação de vendas da Go Beyond: visões dedicadas
para **Gestão/Admin**, **SDR**, **Social Seller** e **Closer**, cobrindo o ciclo de
vida completo do lead — do quiz de aquisição até a venda fechada.

Stack: React + Vite + TypeScript + Tailwind CSS no front-end, Supabase (Postgres +
Auth + Realtime + Edge Functions) como backend.

## 1. Configurar o Supabase

Use o projeto Supabase que já está contratado (o mesmo banco pode ser reaproveitado
por outras apps da Go Beyond).

1. No **SQL Editor** do Supabase, rode nesta ordem:
   - [`supabase/schema.sql`](supabase/schema.sql) — tabelas, enums, RLS, triggers.
   - [`supabase/seed.sql`](supabase/seed.sql) — produtos e leads de exemplo.
2. Copie a **Project URL** e a **anon key** (Project Settings → API).

### Criar o primeiro administrador

Contas são criadas pela tela **Equipe** do app, mas isso exige já ter um admin
logado — então o primeiro precisa ser criado manualmente, uma única vez:

1. Dashboard do Supabase → **Authentication → Add user** → crie com email/senha.
2. Copie o UUID do usuário criado.
3. No **SQL Editor**, rode:
   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Seu Nome'
   where id = '<uuid-do-usuario>';
   ```
4. Faça login no app com esse usuário — a partir daí, use **Equipe** para cadastrar
   SDRs, Social Sellers e Closers (a conta e o profile são criados juntos).

## 2. Rodar localmente

```bash
cp .env.example .env.local
# edite .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## 3. Edge Functions

Duas funções em `supabase/functions/`:

- **`admin-create-user`** — chamada pela tela Equipe; só aceita requisições de um
  usuário com `role='admin'`; cria a conta no Supabase Auth (o profile é criado
  automaticamente pelo trigger `handle_new_user`).
- **`lead-intake`** — webhook público para o quiz enviar leads direto pra
  plataforma, no mesmo formato `form_response` que já é usado pelo relay AWSales
  (ver [`../quiz-link-bio/RASTREAMENTO.md`](../quiz-link-bio/RASTREAMENTO.md)).
  Protegida por um header secreto em vez de sessão de usuário.

Deploy (com a [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase link --project-ref <seu-project-ref>
supabase functions deploy admin-create-user
supabase functions deploy lead-intake

# gera um segredo aleatório e configura no projeto
supabase secrets set LEAD_INTAKE_SECRET=$(openssl rand -hex 24)
```

### Plugar o quiz no `lead-intake`

O endpoint fica em `https://<project-ref>.supabase.co/functions/v1/lead-intake`.
Aponte (ou duplique) a chamada que o quiz já faz para o relay AWSales para também
enviar um `POST` pra essa URL, com:

- Header `x-webhook-secret: <valor do LEAD_INTAKE_SECRET>`
- Body: o mesmo JSON `form_response` já documentado em `RASTREAMENTO.md`.

Leads recebidos assim entram sem responsável (`owner_id` nulo) e aparecem pra
qualquer SDR/Social Seller ativo assumir com o botão **Assumir lead**.

## 4. Deploy do front-end

Qualquer host de site estático serve (build gera uma SPA em `dist/`). Sugestão com
Railway, já contratado:

1. Novo serviço apontando pra pasta `gobeyond-ops/`.
2. Build command: `npm run build` · Start/serve: qualquer servidor estático
   apontando pra `dist/` (ex.: `npx serve -s dist -l $PORT`).
3. Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Modelo de dados e regras de acesso

- **Papéis**: `admin`, `sdr`, `social_seller`, `closer` — definidos em
  `public.profiles.role` e aplicados via RLS (`supabase/schema.sql`).
- **Ciclo de vida do lead** (`leads.stage`): um único enum cobre pré-venda
  (`novo_lead` → … → `agendado`) e fechamento (`reuniao_agendada` → … →
  `venda_fechada`), mais `perdido` como saída. Cada visão renderiza só as colunas
  do seu funil; a Gestão vê o funil inteiro unificado.
- **Visibilidade**: SDR/Social Seller veem os próprios leads + a fila de leads sem
  responsável; Closer vê os leads sob sua responsabilidade; Admin vê tudo.
- **Auditoria**: toda mudança relevante (criação, troca de etapa, agendamento,
  resultado de reunião, venda, nota) gera um registro em `lead_events`, exibido no
  histórico do card do lead.

## Scripts

```bash
npm run dev       # servidor de desenvolvimento
npm run build     # build de produção (roda tsc -b + vite build)
npm run preview   # serve o build de produção localmente
```
