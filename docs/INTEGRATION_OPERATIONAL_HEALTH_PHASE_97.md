# Fase 97 — Centro de integrações e saúde operacional

O centro diferencia ambiente configurado, cadastro, teste verificado, evidência recente e saúde. Consolida Meta, WhatsApp, Google/YouTube, TikTok, OpenAI, Perplexity, storage e Hostinger, além de filas e dead letters.

Somente booleanos e estados seguros são exibidos; valores de chaves nunca retornam nem entram nos snapshots. Produção exige saúde recente dos provedores críticos e não é promovida automaticamente.

## Homologação

1. aplicar a migration;
2. testar ambiente ausente, somente ENV, cadastro sem teste, teste vencido e falha;
3. validar filas pendentes, falhas e DLQ;
4. registrar dois snapshots iguais e confirmar deduplicação;
5. inspecionar resposta e banco para confirmar ausência de segredos;
6. validar acesso exclusivo da diretoria e dois tenants;
7. executar testes oficiais na Hostinger antes de aceitar produção.
