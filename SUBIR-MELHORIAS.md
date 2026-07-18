# Subir melhorias do Ezone TCG na VPS

Este guia e para atualizar o jogo em producao na VPS, sem mexer nos outros sistemas hospedados no servidor.

Dominios atuais:

- Pagina oficial beta: `https://ezonetcg.vbxsistemas.com.br`
- Jogo: `https://play.vbxsistemas.com.br`

Pasta do projeto na VPS:

```bash
/home/ezonetcg/app
```

Servicos do jogo:

- API Laravel: `ezonetcg-api`
- WebSocket Reverb: `ezonetcg-reverb`

---

## Atualizacao rapida

Use este fluxo quando voce alterou cartas, cenas, layout, regras do jogo ou frontend.

Se a VPS ja estiver configurada com Git:

```bash
cd /home/ezonetcg/app
git pull

cd frontend
npm install
npm run build

systemctl restart ezonetcg-api
systemctl restart ezonetcg-reverb
```

Teste:

```bash
systemctl status ezonetcg-api --no-pager
systemctl status ezonetcg-reverb --no-pager
curl -I https://play.vbxsistemas.com.br
```

Se aparecer `fatal: not a git repository`, a producao ainda foi subida por upload manual. Use uma das opcoes abaixo.

---

## Atualizacao sem Git

Use este fluxo quando voce enviar os arquivos manualmente para a VPS por SFTP, SCP, painel ou compactado.

1. Envie os arquivos novos para:

```bash
/home/ezonetcg/app
```

2. Nao sobrescreva estes arquivos/pastas sem conferir:

```bash
/home/ezonetcg/app/backend/.env
/home/ezonetcg/app/frontend/.env
/home/ezonetcg/app/backend/storage
```

3. Depois rode na VPS:

```bash
cd /home/ezonetcg/app/backend
php83 /usr/local/bin/composer install --no-dev --optimize-autoloader
php83 artisan migrate --force
php83 artisan optimize:clear
php83 artisan config:cache
php83 artisan route:cache

cd /home/ezonetcg/app/frontend
npm install
npm run build

systemctl restart ezonetcg-api
systemctl restart ezonetcg-reverb
```

4. Teste:

```bash
curl -I https://ezonetcg.vbxsistemas.com.br
curl -I https://play.vbxsistemas.com.br
```

---

## Configurar a VPS para atualizar via Git

Use este caminho para transformar a pasta de producao em um deploy por Git.

Antes de comecar, confirme a URL do repositorio. Exemplo:

```bash
git@github.com:usuario/repositorio.git
```

ou:

```bash
https://github.com/usuario/repositorio.git
```

1. Faca backup da producao atual:

```bash
cp -a /home/ezonetcg/app /home/ezonetcg/app-backup-$(date +%Y%m%d-%H%M)
```

2. Guarde os arquivos de ambiente:

```bash
cp /home/ezonetcg/app/backend/.env /home/ezonetcg/backend.env.producao
cp /home/ezonetcg/app/frontend/.env /home/ezonetcg/frontend.env.producao
```

3. Clone o repositorio em uma nova pasta:

```bash
cd /home/ezonetcg
git clone URL_DO_REPOSITORIO app-git
```

4. Restaure os `.env` de producao:

```bash
cp /home/ezonetcg/backend.env.producao /home/ezonetcg/app-git/backend/.env
cp /home/ezonetcg/frontend.env.producao /home/ezonetcg/app-git/frontend/.env
```

5. Instale e gere build:

```bash
cd /home/ezonetcg/app-git/backend
php83 /usr/local/bin/composer install --no-dev --optimize-autoloader
php83 artisan migrate --force
php83 artisan optimize:clear
php83 artisan config:cache
php83 artisan route:cache

cd /home/ezonetcg/app-git/frontend
npm install
npm run build
```

6. Troque as pastas:

```bash
mv /home/ezonetcg/app /home/ezonetcg/app-manual-antigo
mv /home/ezonetcg/app-git /home/ezonetcg/app
```

7. Reinicie os servicos:

```bash
systemctl restart ezonetcg-api
systemctl restart ezonetcg-reverb
```

8. Teste:

```bash
curl -I https://play.vbxsistemas.com.br
```

Depois disso, as proximas atualizacoes podem usar:

```bash
cd /home/ezonetcg/app
git pull
```

---

## Quando tiver alteracao no backend

Use quando mudar controllers, models, migrations, rotas, regras do Laravel ou configuracoes do backend.

```bash
cd /home/ezonetcg/app
git pull

cd backend
php83 /usr/local/bin/composer install --no-dev --optimize-autoloader
php83 artisan migrate --force
php83 artisan optimize:clear
php83 artisan config:cache
php83 artisan route:cache

systemctl restart ezonetcg-api
systemctl restart ezonetcg-reverb
```

Depois, se tambem houve mudanca no frontend:

```bash
cd /home/ezonetcg/app/frontend
npm install
npm run build
```

---

## Quando alterar o frontend/.env

Sempre que mudar variaveis `VITE_`, e obrigatorio gerar um novo build.

Arquivo:

```bash
/home/ezonetcg/app/frontend/.env
```

Exemplo de producao:

```env
VITE_REVERB_APP_KEY=6i5bwjziieno1xqkkkfr
VITE_REVERB_HOST=play.vbxsistemas.com.br
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
VITE_API_URL=/api
```

Depois rode:

```bash
cd /home/ezonetcg/app/frontend
npm run build
```

Para confirmar que o build nao ficou apontando para localhost:

```bash
grep -R "localhost:8080\|localhost:8005" dist/assets -n | head
```

Se aparecer algo, revise o `.env` e rode `npm run build` novamente.

---

## Reiniciar servicos

```bash
systemctl restart ezonetcg-api
systemctl restart ezonetcg-reverb
```

Ver status:

```bash
systemctl status ezonetcg-api --no-pager
systemctl status ezonetcg-reverb --no-pager
```

Ver logs:

```bash
journalctl -u ezonetcg-api -n 80 --no-pager
journalctl -u ezonetcg-reverb -n 80 --no-pager
```

---

## Testes basicos depois de subir

Pagina:

```bash
curl -I https://ezonetcg.vbxsistemas.com.br
```

Jogo:

```bash
curl -I https://play.vbxsistemas.com.br
```

API:

```bash
curl -s -X POST https://play.vbxsistemas.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"email":"SEU_EMAIL","password":"SUA_SENHA"}'
```

Resposta esperada em login correto: JSON com `token` e `user`.

Resposta esperada em login errado: erro de validacao informando e-mail ou senha invalidos.

---

## Backup rapido antes de uma atualizacao grande

Antes de uma alteracao com risco maior:

```bash
cp -a /home/ezonetcg/app /home/ezonetcg/app-backup-$(date +%Y%m%d-%H%M)
```

Para listar backups:

```bash
ls -la /home/ezonetcg | grep app-backup
```

---

## Cuidados importantes

- Nao instalar Nginx nesta VPS: ela usa Apache/httpd com outros sistemas de clientes.
- Nao editar sites de clientes.
- O arquivo do jogo fica isolado em:

```bash
/etc/httpd/conf.d/ezonetcg.conf
```

- Antes de recarregar Apache, sempre testar:

```bash
apachectl configtest
```

Se aparecer `Syntax OK`:

```bash
systemctl reload httpd
```

---

## Quando precisar mexer no Apache

Arquivo do Ezone:

```bash
nano /etc/httpd/conf.d/ezonetcg.conf
```

Depois:

```bash
apachectl configtest
systemctl reload httpd
```

---

## Certificado SSL

O certificado atual foi emitido com Certbot webroot.

Renovacao geralmente e automatica. Para testar:

```bash
certbot renew --dry-run
```

Certificado:

```bash
/etc/letsencrypt/live/ezonetcg.vbxsistemas.com.br/fullchain.pem
/etc/letsencrypt/live/ezonetcg.vbxsistemas.com.br/privkey.pem
```

---

## Resumo do fluxo mais comum

```bash
cd /home/ezonetcg/app
git pull

cd frontend
npm run build

systemctl restart ezonetcg-api
systemctl restart ezonetcg-reverb

curl -I https://play.vbxsistemas.com.br
```
