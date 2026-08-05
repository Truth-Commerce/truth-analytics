# Períodos manuais de relatório para o analista

## Objetivo

Permitir que `analista` e `admin_truth`, ao operar uma organização pela carteira, gerem relatórios de 7, 14, 30, 60, 90 ou 180 dias. A seleção não altera o plano nem a cadência automática da organização.

## Experiência

O card **Gerar relatório** da aba da organização exibirá um seletor obrigatório com as seis opções. O valor padrão será 30 dias. O botão continuará indisponível quando já houver um relatório em andamento e o card continuará informando qual ERP está ativo.

Ao enviar, o sistema mostrará o estado atual de sucesso ou erro. O relatório criado seguirá aparecendo no histórico e na visualização completa com suas datas reais.

## Regra de período

Cada opção representa exatamente N dias-calendário fechados no fuso `America/Sao_Paulo`, terminando ontem às 23:59:59.999. Hoje nunca entra na janela. A mesma função pura usada para formar janelas fechadas será reutilizada para evitar divergência entre interface e backend.

Valores aceitos: `7`, `14`, `30`, `60`, `90` e `180`. Qualquer valor ausente, adulterado, decimal ou fora da lista será recusado com mensagem clara; o backend não confiará no HTML.

## Arquitetura e fluxo

1. O componente `StaffGenerateReport` envia `orgId` e `periodDays`.
2. `staffGenerateReportAction` mantém os gates existentes: sessão de staff, acesso à organização, organização ativa, ERP ativo e ausência de relatório concorrente.
3. Uma função pura valida o período e calcula a janela fechada.
4. O enfileiramento recebe opcionalmente uma janela explícita. Sem ela, preserva o comportamento atual baseado no plano para cliente, cron e demais consumidores.
5. O relatório `queued` armazena `periodo_inicio` e `periodo_fim`; o pipeline existente processa essas datas sem distinguir o papel que iniciou a geração.
6. A auditoria registra `reportId`, provedor, quantidade de dias e as fronteiras calculadas.

## Segurança e limites

- A autorização continua escopada à carteira do analista; `admin_truth` mantém acesso global.
- A lista permitida é definida no servidor e reutilizada pela interface.
- Apenas um relatório ativo por organização continua permitido.
- Não haverá alteração na trava, no plano ou no agendamento automático do cliente.
- O ERP ativo pode ser Bling ou Olist.

## Testes

- Função pura: aceita as seis opções e calcula corretamente as fronteiras em São Paulo.
- Validação: recusa valores ausentes, adulterados e fora da lista.
- Action: encaminha a janela escolhida para a fila e registra o período na auditoria.
- Permissões e erros existentes continuam cobertos: fora da carteira, sem ERP e relatório concorrente.
- Componente: contém as seis opções e envia `periodDays`.
- Regressão: `enqueueReport(orgId)` sem período explícito continua usando o plano da organização.

## Critérios de aceite

- Analista e admin conseguem escolher 7, 14, 30, 60, 90 ou 180 dias na organização aberta.
- Um relatório de 180 dias contém exatamente 180 dias fechados e termina ontem.
- Um valor diferente dos seis permitidos não cria relatório.
- Bling e Olist funcionam com o mesmo seletor.
- Geração automática e geração do cliente mantêm o comportamento anterior.
