# Fase 30 — Dados incompletos

## Resultado

Ao abrir uma lead, o corretor recebe perguntas priorizadas pelo valor comercial do dado ausente. A tela evita um formulário extenso e mostra primeiro o que destrava contato, intenção, matching ou continuidade.

## Funcionamento

- lacunas críticas: canal válido;
- alta prioridade: objetivo, prazo, pagamento e investimento;
- prioridade média: região, dormitórios, projeto e próxima ação;
- respostas estruturadas recalibram a qualificação;
- campos livres recebem foco direto no perfil;
- projeto e agendamento levam à ação correta;
- completude é ponderada, não uma simples contagem.

O diagnóstico é determinístico e local, portanto não chama modelos pagos. CPF, CNPJ, endereço exato e documentos não aumentam completude comercial nem score.

## Segurança e homologação

A avaliação é produzida somente depois de sessão e acesso hierárquico à lead. Para homologar, testar perfis vazios, parciais e completos; responder opções rápidas; preencher campos; salvar; recarregar; e confirmar que a próxima pergunta muda sem expor dados laterais.

Execute `npm run data-completeness:check`. Testes externos ainda necessários: quatro perfis, dois tenants e aferição com corretores sobre utilidade e tempo de qualificação.
