# Iga Gestão de Projetos

PROMPT — Sistema de Gestão de Projetos e Tarefas

Crie um Sistema de Gestão de Projetos e Tarefas completo, moderno e intuitivo, com foco em organização, produtividade e controle operacional para empresas de consultoria e prestação de serviços.

🧩 1. Cadastro de Empresas (Clientes)

O sistema deve permitir o cadastro e gestão de empresas com os seguintes campos:

 Nome da Empresa (obrigatório)

 CNPJ (opcional)

 Nome do Contato

 Telefone do Contato (com máscara)

 Email do Contato

 Endereço completo

 Bairro

 CEP

 Cidade

 UF

Funcionalidades adicionais:

 Listagem com busca e filtros

 Histórico de projetos por empresa

 Status da empresa (Ativa / Inativa)

📁 2. Cadastro de Projetos

Cada projeto deve estar vinculado a uma empresa e conter:

 Nome do Projeto

 Empresa vinculada

 Descrição geral do projeto (campo rico, com formatação)

 Valor do Projeto (R$)

 Prazo de execução (data início e fim)

Status do Projeto:

 Planejamento

 Em andamento

 Pausado

 Concluído

 Cancelado

Funcionalidades:

 Dashboard com visão geral do projeto

 Percentual de progresso automático baseado nas tarefas

 Timeline (linha do tempo)

 Alertas de prazo (projetos próximos do vencimento)

 Upload de arquivos (imagens, PDFs, documentos)

 Área de comentários por projeto (com histórico)

✅ 3. Gestão de Tarefas

Cada projeto deve conter tarefas estruturadas com:

 Nome da tarefa

 Descrição detalhada

 Responsável (usuário)

 Data de início

 Prazo final

Prioridade:

 Baixa

 Média

 Alta

 Urgente

🔄 Status das Tarefas (Fluxo Operacional Obrigatório)

As tarefas devem seguir um fluxo de acompanhamento claro e rastreável, com os seguintes status:

 Pendente

 Iniciada

 Em andamento

 Pausada

 Concluída

Regras:

 O sistema deve registrar automaticamente o histórico de mudança de status (data, hora e usuário).

 Deve ser possível visualizar o tempo total em cada etapa.

 O progresso do projeto deve ser calculado com base na evolução das tarefas.

 Tarefas com prazo vencido devem gerar alerta automático, independentemente do status.

🧩 Estrutura e Funcionalidades das Tarefas

 Kanban (arrastar tarefas entre status)

 Lista e visualização em calendário

 Subtarefas

 Checklists internos

 Anexos por tarefa

 Comentários por tarefa (com histórico)

 Notificações automáticas (mudança de status, prazo, menção)

🌐 Compartilhamento de Tarefas

O sistema deve permitir o compartilhamento online de tarefas com usuários específicos, mesmo que não façam parte diretamente do projeto.

Funcionalidades:

 Compartilhar tarefa via link seguro (com autenticação ou acesso controlado)

 Definir permissões por usuário compartilhado:

 Visualizar

 Comentar

 Editar (opcional)

 Controle de acesso individual por tarefa

 Registro de atividades dos usuários externos (logs)

 Possibilidade de revogar acesso a qualquer momento

 Notificações para usuários compartilhados quando houver atualizações

👥 4. Sistema de Usuários e Permissões

Cadastro de usuários com:

 Nome completo

 Telefone/Contato

 Email (login)

 Função/Cargo

Tipo de acesso:

 Administrador

 Usuário comum

🔐 Estrutura de Permissões

👑 Proprietário

 Acesso total ao sistema

 Gerenciar empresas, projetos e usuários

 Definir permissões

🤝 Colaborador

 Criar e editar tarefas

 Atualizar status

 Inserir comentários e arquivos

👁️ Visualizador

 Apenas visualização

 Sem permissão de edição

Extras:

 Permissões por projeto (não apenas global)

 Controle de quem pode ver/editar cada projeto

 Controle de acesso por tarefa (incluindo compartilhamentos externos)

📊 5. Dashboard e Relatórios

O sistema deve possuir dashboards com:

 Projetos ativos, atrasados e concluídos

 Tarefas por status

 Tarefas por responsável

 Indicadores de produtividade

 Percentual médio de conclusão

Relatórios:

 Relatório por empresa

 Relatório por projeto

 Relatório de tarefas (filtros por período, status, usuário)

🔔 6. Notificações e Alertas

 Notificações em tempo real no sistema

 Alertas de tarefas atrasadas

 Lembretes de prazos próximos

 Notificação de comentários ou atualizações

📎 7. Gestão de Arquivos

 Upload de arquivos por projeto e tarefa

 Organização por categorias

 Visualização rápida (preview)

 Histórico de uploads

🔍 8. Busca e Filtros Avançados

 Busca global (empresas, projetos e tarefas)

Filtros por:

 Status

 Responsável

 Prazo

 Empresa

⚙️ 9. Funcionalidades Extras (Diferencial)

 Log de atividades (histórico completo de ações)

 Integração futura com APIs (ERP, CRM, etc.)

 Sistema responsivo (desktop e mobile)

 Interface moderna (UI/UX limpa e intuitiva)

 Modo escuro

 Exportação de relatórios (PDF e Excel)

 Backup automático de dados

🎯 Objetivo do Sistema

Criar uma plataforma que permita:

 Controle total dos projetos

 Organização clara das tarefas

 Acompanhamento de produtividade

 Comunicação centralizada entre equipe

 Redução de atrasos e retrabalho

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://igagestaoprojetos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ca1e3404-0d1b-406a-b499-38a6b7cd6c79).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
