# Fase 55 — vínculo entre release e trilha auditável

O recibo revisado só pode chegar ao gate final se sua impressão de evidência estiver ligada a uma entrada íntegra do ledger. O vínculo verifica a mesma evidência, o mesmo hash de entrada e uma referência segura de gate.

Ele não substitui os gates técnicos; mantém build, ZIP e publicação bloqueados até que todos sejam fechados de forma independente. Nenhum segredo, dado de cliente, sessão ou dado pessoal é aceito.

```bash
node scripts/preflight-atlas-release-audit-binding.mjs --self-test
```
