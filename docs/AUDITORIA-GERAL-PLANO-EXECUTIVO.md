# Auditoria Geral — Sistema de Gestão de Projetos (IGA Tecnologia)

**Commit de referência:** accf8857238b735da8c3b3bc1de4b18ebd2b80b0
**Ambiente:** código do repositório + banco (Lovable Cloud) + https://igagestaoprojetos.lovable.app
**Natureza:** auditoria e plano. Nenhuma tabela, migration, RLS/RBAC, Auth ou funcionalidade homologada foi alterada.

## 1. Inventário de funcionalidades existentes

| Área | Onde | Situação |
|---|---|---|
| Autenticação sem autocadastro, redefinição de senha | `/auth`, `/reset-password` | EXISTENTE E FUNCIONAL |
| Usuários, papéis, permissões, módulos, desativação | `/users`, `/permissions`, `users.functions.ts` | EXISTENTE E FUNCIONAL |
| Empresas | `/companies` (`companies`) | EXISTENTE E FUNCIONAL |
| Projetos (busca, filtros status/fase/orçamento, Abrir Ficha) | `/projects` | EXISTENTE E FUNCIONAL |
| Ficha Gerencial (cards, Plataformas e Contas, Cards/Tabela) | `project-management-summary.tsx`, `project-platform-accounts.tsx` | EXISTENTE E FUNCIONAL |
| Dossiê: Lovable, GitHub, e-mails, links, créditos, prompts, registros, dívidas técnicas, campos personalizados | `project-detail.tsx` e componentes | EXISTENTE E FUNCIONAL |
| Tarefas/Kanban, comentários, anexos, compartilhamento | `/tasks` | EXISTENTE E FUNCIONAL |
| Agendamentos | `/appointments` | EXISTENTE E FUNCIONAL |
| Financeiro: fornecedores, categorias, serviços, custos, rateios, orçamento | `/finance/*` | EXISTENTE E FUNCIONAL |
| Relatórios com PDF | `/reports` | EXISTENTE PARCIAL (sem filtros por plataforma/cliente) |
| Dashboard | `/dashboard` | EXISTENTE PARCIAL (4 KPIs estáticos, sem detalhamento nem financeiro) |
| Auditoria | `audit_history`, `security_access_log`, `task_status_history` | EXISTENTE E FUNCIONAL |

## 2. Tabelas e relacionamentos relevantes

- `projects.company_id` → `companies` (1 empresa por projeto = **proprietária**). Não há relação N:N projeto↔clientes.
- `projects.value` é a única informação de receita (valor único, sem distinção contratada/faturada/recebida).
- `project_credits` registra apenas data + valor monetário (sem quantidade de créditos, plataforma, saldo).
- `project_accounts` (plataforma, e-mail, login, plano, custo, periodicidade, renovação, situação, URL) — sem coluna de senha.
- `finance_services` / `finance_costs` / `finance_cost_allocations` / `finance_budgets` — custo estimado, realizado, pago e rateio.
- Não existem: meios de pagamento, contratos/receitas por cliente, segmentos de mercado, cofre de credenciais.

## 3. Matriz de requisitos

| Requisito | Classificação | Observação |
|---|---|---|
| Dashboard com cards clicáveis e detalhamento | EXISTENTE PARCIAL | Evoluir `/dashboard` sem novas tabelas |
| Investimento por projeto/plataforma/período | EXISTENTE PARCIAL | Dados existem (custos/rateios); falta visão |
| Créditos consumidos (quantidade × valor) | EXISTENTE PARCIAL | `project_credits` só tem valor |
| Receita contratada/faturada/recebida | AUSENTE | Hoje só `projects.value` |
| Múltiplos clientes por projeto | AUSENTE | Requer tabela de vínculo |
| Cobranças e vencimentos | EXISTENTE PARCIAL | Custos têm vencimento; recebimentos ausentes |
| Projetos sem movimentação | EXISTENTE PARCIAL | `last_activity_at` existe; falta visão |
| Ficha: identificação/desenvolvimento | EXISTENTE PARCIAL | Faltam segmento, ferramenta principal, origem da atualização |
| Ficha: contas e plataformas | EXISTENTE E FUNCIONAL | Preservar |
| Cofre de credenciais | AUSENTE / FUTURO | Proposta abaixo; sem implementação |
| Cartões e meios de pagamento | AUSENTE | Somente identificação segura (últimos 4 dígitos) |
| Oportunidades comerciais por segmento | AUSENTE / FUTURO | P2 |
| PDF da ficha gerencial | AUSENTE | `/reports` já tem infraestrutura PDF |
| Alertas de renovação/créditos | EXISTENTE PARCIAL | Renovação visível na ficha; sem alerta consolidado |
| Rentabilidade comparada entre projetos | AUSENTE | Depende do Bloco C |
| Item DUPLICADO | Nenhum crítico | `project_credits` × custos Lovable em `finance_costs` podem se sobrepor — definir fonte única no Bloco B |

## 4. Diagnósticos

**Dashboard:** contagens simples, sem filtros, sem dados financeiros, sem navegação ao detalhe. Baixo risco evoluir só no frontend reutilizando RLS existente (cada usuário vê apenas o que já pode ver).

**Ficha Gerencial:** completa para contas/plataformas e custos. Lacunas: segmento, ferramenta principal, créditos em quantidade, receitas por cliente, meios de pagamento, PDF.

**Financeiro e comercial:** custos maduros (estimado/realizado/pago, rateio, orçamento). Receitas imaturas: "Resultado bruto" atual usa `projects.value − custo mensal`, rotulado como estimativa — correto, mas insuficiente para distinguir contratado × recebido.

**Credenciais e pagamentos:** nenhum segredo armazenado (correto). Cartões inexistentes.

## 5. Riscos de segurança

| Risco | Nível | Medida |
|---|---|---|
| `.env` versionado (contém apenas chaves públicas) | Baixo | Manter só chaves publicáveis; nunca segredos |
| 18 avisos de funções SECURITY DEFINER (preexistentes) | Baixo | Todas com `search_path` fixo; revisar em bloco próprio |
| Cofre de credenciais mal implementado | Alto (futuro) | Seguir proposta da seção 6 |
| Dados de cartão | Alto (futuro) | Proibido número completo/CVV; só últimos 4 dígitos |
| Dashboard agregando dados financeiros | Médio | Exibir valores apenas com `financial.view` |

## 6. Proposta — Cofre de Credenciais (somente arquitetura)

- Tabela própria `project_credentials` ligada a `project_accounts`, sem SELECT direto pelo navegador (sem GRANT a `authenticated` na coluna cifrada).
- Cifragem no servidor com chave mantida como segredo do backend (Supabase Vault ou chave AES-GCM em segredo), nunca no frontend.
- Revelação por função de servidor que verifica permissão específica (`credentials.reveal`), exige reautenticação recente e grava `security_access_log` sem o conteúdo.
- Senha mascarada por padrão; Mostrar/Ocultar com expiração; nunca em PDF, exportações ou logs.
- Requer autorização de segurança específica antes de qualquer implementação.

## 7. Plano de implementação por blocos

| Bloco | Conteúdo | Banco | Esforço | Dependências |
|---|---|---|---|---|
| A — Dashboard Expansível | Cards clicáveis (projetos por status, investimento, créditos, resultado, empresas, vencimentos, pendências, sem movimentação) com painel lateral, filtros período/status/cliente/plataforma e link "Abrir Ficha" | Nenhuma mudança | Médio | — |
| B — Ficha Gerencial Completa | Seções expansíveis; segmento e ferramenta principal; créditos com quantidade/plataforma/saldo; meios de pagamento (apelido, bandeira, últimos 4 dígitos, dia de cobrança) vinculados a `finance_services`; PDF sem segredos | Colunas incrementais + 1 tabela `finance_payment_methods` | Médio | — |
| C — Clientes e Receitas | Tabela `project_clients` (projeto × empresa cliente, implantação, mensalidade, situação) e `project_revenues` (contratado/faturado/recebido); MRR, acumulado, resultado bruto real | 2 tabelas + RLS | Alto | B |
| D — Inteligência Comercial | Segmentos por projeto com Alta/Média/Baixa e critérios; hipótese × evidência; integração futura com Leads | 1 tabela | Médio | C |
| E — Cofre de Credenciais | Conforme seção 6 | Tabela + funções de servidor | Alto | Autorização de segurança |

### Critérios de aceite

- **A:** todo número abre sua origem; nenhum valor estimado rotulado como realizado; valores financeiros ocultos sem `financial.view`; desktop 1280 e mobile 390×844 sem rolagem horizontal.
- **B:** créditos separam quantidade e valor; nenhum número completo de cartão/CVV aceito pelo banco (constraint de 4 dígitos); PDF sem credenciais.
- **C:** múltiplos clientes por projeto sem alterar a empresa proprietária; contratado ≠ faturado ≠ recebido; RLS por `can_view_project`.
- **D:** cada classificação apresenta critério verificável.
- **E:** senha nunca chega ao navegador sem revelação autorizada e auditada.

## 8. Tabela executiva

| Funcionalidade | Situação atual | Prioridade | Esforço | Bloco |
|---|---|---|---|---|
| Dashboard expansível | Parcial | P1 | Médio | A |
| Ficha Gerencial | Funcional, com lacunas | P1 | Médio | B |
| Créditos e custos | Custos completos; créditos parciais | P1 | Baixo/Médio | B |
| Cartões/meios de pagamento | Ausente | P1 | Baixo | B |
| Empresas e receitas | Ausente (1 empresa por projeto) | P1 | Alto | C |
| Inteligência comercial | Ausente | P2 | Médio | D |
| Cofre de Credenciais | Ausente | P1 de segurança | Alto | E |

## 9. Testes e limitações

- Testes SQL existentes em `supabase/tests/` (fases 0.2, blocos 1–4D) permanecem válidos.
- Simulação de múltiplos usuários no banco é limitada (sem acesso direto ao schema `auth`); RLS verificada pela expressão das policies.
- Auditoria não destrutiva: nenhum dado criado ou removido.

## 10. Arquivos envolvidos nos blocos

`src/routes/dashboard.tsx`, `src/components/project-management-summary.tsx`, `src/components/project-platform-accounts.tsx`, `src/components/project-records.tsx`, `src/routes/finance/*`, `src/routes/reports.tsx`, `src/routes/companies.tsx`.

## Encerramento

Desenvolvimento parado. Aguardando autorização expressa para iniciar o Bloco A.
