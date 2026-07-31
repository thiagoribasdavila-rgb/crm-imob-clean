#!/usr/bin/env bash
# DIAGNÓSTICO DO SERVIDOR — somente leitura, não altera nada.
#
# Rode NO SERVIDOR, antes de qualquer deploy. Ele responde a pergunta que o
# diagnóstico externo de 31/07 não conseguiu responder: quem serve o domínio.
#
#   bash server-diagnostic.sh > diagnostico-$(hostname)-$(date +%Y%m%d).txt
#
# Nenhum valor de variável de ambiente é impresso — só o NOME e se existe.
set -uo pipefail

linha() { printf '\n── %s ──\n' "$1"; }
ok()    { command -v "$1" >/dev/null 2>&1; }

linha "IDENTIDADE"
hostname; uname -a; cat /etc/os-release 2>/dev/null | head -2

linha "RECURSOS"
free -h 2>/dev/null | head -2
df -h / 2>/dev/null | head -2
nproc 2>/dev/null | sed 's/^/cpus: /'

linha "RUNTIME"
for c in node npm pnpm yarn corepack pm2; do
  printf '%-9s ' "$c"
  ok "$c" && { $c --version 2>/dev/null | head -1; } || echo "ausente"
done
ok node && { echo "caminho:  $(command -v node)"; echo "real:     $(readlink -f "$(command -v node)")"; }

linha "PROCESSOS DA APLICAÇÃO"
ok pm2 && pm2 list 2>/dev/null || echo "pm2 ausente"
ps aux 2>/dev/null | grep -E '[n]ode|[n]ext' | head -10 || echo "nenhum processo node"

linha "QUEM ESCUTA AS PORTAS"
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E ':(80|443|3000|3001|8080|8000)\b' || echo "nenhum listener nas portas da aplicação"

linha "SERVIDOR WEB"
for s in nginx apache2 caddy; do
  printf '%-9s ' "$s"
  systemctl is-active "$s" 2>/dev/null || echo "inativo/ausente"
done
ok nginx && nginx -T 2>/dev/null | grep -E 'server_name|proxy_pass|root ' | head -20

linha "SERVIÇOS SYSTEMD RELACIONADOS"
systemctl list-units --type=service --state=running 2>/dev/null | grep -iE 'atlas|node|next|pm2' || echo "nenhum"

linha "DOCKER"
ok docker && docker ps 2>/dev/null || echo "docker ausente"

linha "ONDE ESTÁ A APLICAÇÃO"
for d in /opt/atlas-one /var/www /home/*/atlas* /srv/atlas* /opt/atlas*; do
  [ -d "$d" ] && { echo "$d"; ls -la "$d" 2>/dev/null | head -6; }
done 2>/dev/null || echo "nenhum diretório conhecido"

linha "ARQUIVOS DE AMBIENTE — só nomes, nunca valores"
find / -maxdepth 5 -name '.env*' -not -path '*/node_modules/*' -not -path '/proc/*' 2>/dev/null | head -10 | while read -r f; do
  printf '%s  (%s variáveis)\n' "$f" "$(grep -cE '^[A-Z_]+=' "$f" 2>/dev/null || echo '?')"
done

linha "AGENDAMENTO"
crontab -l 2>/dev/null | grep -v '^#' | head -20 || echo "sem crontab do usuário atual"

linha "CERTIFICADOS"
ls -la /etc/letsencrypt/live/ 2>/dev/null || echo "sem letsencrypt"

linha "FIREWALL"
(ufw status 2>/dev/null || iptables -L -n 2>/dev/null | head -8) || echo "não consultável"

linha "CONCLUSÃO — responda antes de seguir"
cat <<'FIM'
1. Existe processo Node servindo alguma porta?          (seção PROCESSOS/PORTAS)
2. O Nginx faz proxy para alguma porta local?           (seção SERVIDOR WEB)
3. Existe diretório de aplicação com build?             (seção ONDE ESTÁ)
Se as três forem NÃO, este servidor NÃO é a origem de atlasaios.com.br.
FIM
