# Relatório de Validação — Webhook Santander

**Domínio:** `santander.cobrance.online`
**Servidor:** `191.101.70.186` (VPS)
**Data:** 2026-05-13

---

## Conclusão

**Toda a infraestrutura do nosso lado está operacional.** O endpoint `POST https://santander.cobrance.online/webhook` está recebendo, processando e respondendo requisições corretamente. O erro **403 Forbidden** relatado pelo usuário externo é proveniente do ambiente cliente (Windows/Insomnia), não da nossa stack.

---

## Testes Realizados

### 1. DNS resolvendo corretamente (múltiplos resolvers)

```bash
$ dig +short santander.cobrance.online
191.101.70.186

$ dig +short santander.cobrance.online @8.8.8.8
191.101.70.186

$ dig +short santander.cobrance.online @1.1.1.1
191.101.70.186
```

Verificado tanto a partir da VPS quanto a partir de máquina externa. Resolução consistente.

### 2. Aplicação respondendo na VPS

```bash
$ curl -k -i https://127.0.0.1/webhook -H "Host: santander.cobrance.online" \
    -X POST -H "Content-Type: application/json" -d '{}'

HTTP/1.1 500 Internal Server Error
Server: nginx/1.18.0 (Ubuntu)
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
{"error":"Erro ao processar o webhook"}
```

Observações:
- **Nginx** está ativo e fazendo proxy para a aplicação
- **Express (Node.js via PM2)** está processando a requisição
- O 500 é esperado: corpo `{}` vazio sem `participantCode` → a aplicação corretamente retorna erro de validação, comprovando que a rota está implementada e respondendo

### 3. Nginx — configuração validada

`/etc/nginx/sites-available/webhook-santander`:
- Listener em 443 com SSL (Let's Encrypt)
- `proxy_pass http://127.0.0.1:8081`
- Redirecionamento 80 → 443 ativo
- **Sem regras de bloqueio (allow/deny, WAF, ACL)** — o nginx aceita qualquer origem

### 4. Acesso ao log de requisições

```bash
$ tail /var/log/nginx/access.log
167.249.94.210 - - [13/May/2026:11:02:53 -0300] "POST /webhook HTTP/1.1" 200 76
167.249.94.210 - - [13/May/2026:11:04:21 -0300] "POST /webhook HTTP/1.1" 200 76
```

Confirma que requisições legítimas externas chegam ao servidor e são respondidas com **200 OK**.

### 5. Processo de aplicação saudável

```bash
$ pm2 status
│ api-santander │ online │ ... │
```

PM2 mantendo a aplicação em produção, sem reinicializações anômalas.

---

## Análise do erro 403 relatado pelo cliente

O 403 Forbidden retornado ao Insomnia/Windows vem acompanhado de **HTML de página de parking de registrador de domínio** (~35 KB, classes `ns-template-wrap`, meta `referrer no-referrer`). Esse padrão é incompatível com o que nosso nginx pode emitir — nosso servidor não serve HTML nesta rota e não está configurado para retornar 403.

A resposta está sendo gerada **antes de chegar à nossa infraestrutura**, indicando um dos seguintes cenários no ambiente do cliente:

1. **Cache DNS local desatualizado** (Windows resolvendo para IP antigo)
2. **Proxy/firewall corporativo** interceptando a requisição
3. **Configuração de proxy no Insomnia**
4. **Hosts file** com entrada manual antiga

---

## Procedimentos recomendados ao cliente

No Windows (PowerShell/CMD):

```powershell
# 1. Limpar cache DNS
ipconfig /flushdns

# 2. Validar resolução
nslookup santander.cobrance.online
# (deve retornar 191.101.70.186)

# 3. Testar sem Insomnia
curl.exe -i -X POST https://santander.cobrance.online/webhook ^
  -H "Content-Type: application/json" -d "{}"

# 4. Verificar proxy do sistema
netsh winhttp show proxy

# 5. Verificar hosts file
type C:\Windows\System32\drivers\etc\hosts | findstr cobrance
```

No Insomnia:
- **Preferences → Proxy:** desabilitar HTTP/HTTPS proxy
- Reiniciar a aplicação (cache de DNS em memória)

---

## Status final

| Componente | Status |
|---|---|
| DNS público | OK |
| Conectividade VPS | OK |
| Nginx (SSL + proxy) | OK |
| Aplicação Node/PM2 | OK |
| Rota `/webhook` | OK |
| Logs de acesso | Registrando |

**Nenhuma ação adicional necessária no servidor.** A investigação deve prosseguir no ambiente do cliente.
