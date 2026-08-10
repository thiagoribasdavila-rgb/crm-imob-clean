# V3000 — baseline de conversão e IA baseada em evidência

## Resultado desta evolução

O Atlas One deixou de apresentar uma porcentagem fixa de “calibragem” e passou a calcular cobertura de evidências da organização autenticada. A leitura combina execução de provedores, memória comercial estruturada, documentos verificados, decisões supervisionadas e cenários de homologação registrados.

Essa cobertura mede se existem evidências suficientes para operar e aprender. Ela **não é precisão preditiva**, taxa de conversão ou promessa de resultado. Precisão só pode ser informada por um estudo posterior, com amostra real, resultado observado e validação humana.

## Fontes de evidência

- `ai_usage_events`: chamadas realmente executadas, provedor, custo e latência;
- `ai_orchestration_decisions`: decisões e execuções supervisionadas;
- `lead_commercial_memory_states`: memória comercial estruturada por lead e corretor;
- `project_materials`: conhecimento vigente revisado e marcado como verificado;
- `homologation_results`: cenários aprovados ou reprovados por usuários autorizados.

Todas as consultas aplicam `organization_id`. Nenhuma evidência de outro tenant participa do indicador.

## Contrato operacional

- o motor local continua disponível quando o modelo externo falhar;
- nenhuma ação externa é autônoma;
- mensagens, alterações e decisões sensíveis exigem aprovação humana;
- dados pessoais permanecem restritos a provedores confiáveis;
- prompts brutos não compõem a memória comercial;
- ausência de evidência aparece como ausência, nunca como sucesso presumido.

## Gate para uso real

O painel de homologação deve registrar pelo menos um cenário real por fluxo crítico, e o AI Health Center deve comprovar uma chamada supervisionada do provedor configurado. Depois disso, a equipe deve acompanhar custo, latência, aceite da recomendação e resultado comercial sem confundir esses indicadores.

## Escopo de segurança

Esta etapa alterou somente código local, testes e documentação. Não executou migration, escrita no Supabase, deploy ou ação em canais externos.
