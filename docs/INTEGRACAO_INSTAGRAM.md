# Integração Instagram → CRM (etapa "Ativações")

**O que faz:** toda pessoa que a conta **@beyondwithjohn** abordar por Direct vira
automaticamente um card na etapa **Ativações**, distribuído entre as social sellers
ativas (round-robin). Comentários, curtidas e DMs recebidas **não** viram lead.

**Status:** código pronto e no ar. Falta apenas a liberação dos acessos da Meta.

- Endpoint (webhook): `https://qcegsedpgkquxdmrymxo.supabase.co/functions/v1/meta-webhook`
- Verify token: já configurado (ver `META_VERIFY_TOKEN` nos secrets do Supabase)

---

## 1. O que pedir ao cliente

### A) Configuração da conta (rápido — 10 min)

1. **@beyondwithjohn precisa ser conta Profissional** (Comercial ou Criador de conteúdo).
   - Instagram → Configurações → Tipo de conta.
2. **Vinculada a uma Página do Facebook.**
   - Instagram → Configurações → Central de Contas → vincular a Página.
3. **Permitir acesso às mensagens por ferramentas externas** (⚠️ crítico — sem isso o
   webhook não recebe nada):
   - Instagram → Configurações → **Ferramentas e controles comerciais** →
     **Permitir acesso a mensagens** → **ATIVAR**.

### B) Acessos que preciso receber

4. **Acesso de Administrador no Meta Business Manager** (business.facebook.com) que
   contém a Página e o Instagram — ou que me adicionem como Administrador.
5. **Acesso a um App da Meta** (developers.facebook.com) como *Administrador* ou
   *Desenvolvedor*. Se não existir, o cliente cria e me adiciona.
6. **Verificação do negócio (Business Verification)** concluída no Business Manager.
   Exige documento da empresa (CNPJ). **É pré-requisito da App Review** — se ainda não
   foi feita, começar por aqui, porque é a parte mais demorada.

### C) Itens que o cliente precisa fornecer para a App Review

7. **URL de Política de Privacidade** pública (exigência da Meta).
8. Autorização para submeter o app à **App Review** pedindo as permissões:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_show_list`
   - `pages_manage_metadata`
   - `business_management`

---

## 2. O que eu configuro depois de receber os acessos

- Adicionar o produto **Instagram / Messenger** no App.
- Cadastrar o webhook (URL + verify token acima) e assinar os campos
  **`message_echoes`** (as abordagens) e `messages`.
- Gerar **token de longa duração** (System User token) e o **App Secret**, e salvar como
  secrets no Supabase (`META_ACCESS_TOKEN`, `META_APP_SECRET`, `IG_BUSINESS_ID`).
- Submeter a App Review (vídeo demonstrando o uso + descrição do caso).
- Validar em produção com uma abordagem real.

---

## 3. Prazos e riscos (comunicar ao cliente)

| Etapa | Prazo típico |
|---|---|
| Configuração da conta + acessos | 1 dia |
| Verificação do negócio (se ainda não feita) | 2 a 15 dias (depende da Meta) |
| App Review das permissões | 3 a 15 dias |
| Configuração final + testes | 1 dia |

### ⚠️ Ponto que só dá para confirmar testando

A Meta documenta bem o eco de mensagens enviadas **pela API**. O caso aqui é diferente:
as social sellers mandam DM **manualmente pelo app do Instagram**. Na prática o eco
costuma disparar também, mas isso só se confirma com o app aprovado e uma abordagem real.

**Plano B, se o eco manual não vier:** capturar o lead quando a pessoa **responder** a
abordagem (esse evento é garantido pela API). A diferença: entrariam no CRM só os
abordados que responderam, não todos os abordados. É uma linha de código para trocar.

### O que NÃO é possível (independente de acesso)

- ❌ Capturar **novos seguidores** — a Meta não expõe essa lista nem evento.
- ❌ Capturar **quem curtiu** um post — API descontinuada.
- ❌ Ler as **etiquetas/kanban do Meta Business Suite** — não há API pública.

Qualquer solução que prometa isso usa scraping, o que **arrisca o banimento da conta**
do expert. Não recomendado.
