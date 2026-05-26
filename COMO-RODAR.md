# 🚀 Como rodar o Ezone Simulator localmente

> Banco de dados: PostgreSQL na VPS `31.97.64.214` (sempre ativo, sem precisar ligar nada local)

---

## Pré-requisitos

- PHP 8.3+
- Composer 2+
- Node.js 18+ / npm
- Conexão com a internet (para acessar o banco na VPS)

---

## 📁 Estrutura de pastas

```
Ezone-simulator/
├── backend/    → Laravel 13 (API + WebSockets)
├── frontend/   → Vite + Phaser 4 (jogo no browser)
└── COMO-RODAR.md
```

---

## ▶️ Iniciando todos os servidores

Você vai precisar de **3 terminais abertos** simultaneamente.

---

### Terminal 1 — Backend Laravel (API REST)

```bash
cd backend
php artisan serve --host=0.0.0.0 --port=8005
```

✅ Disponível em: `http://localhost:8005`

---

### Terminal 2 — Reverb (WebSockets para partidas em tempo real)

```bash
cd backend
php artisan reverb:start --host=0.0.0.0 --port=8080
```

✅ WebSocket em: `ws://localhost:8080`

---

### Terminal 3 — Frontend Vite + Phaser

```bash
cd frontend
npm run dev
```

✅ Jogo disponível em: `http://localhost:5173`

---

## 🔄 Fila de jobs (opcional por enquanto)

Se precisar processar filas (notificações, emails):

```bash
cd backend
php artisan queue:work
```

---

## 🗄️ Banco de dados (VPS — já configurado)

| Campo      | Valor              |
|------------|--------------------|
| Host       | `31.97.64.214`     |
| Porta      | `5432`             |
| Banco      | `ezone`            |
| Usuário    | `lucas`            |
| Senha      | `marmota73@`       |

> Não precisa ligar nada localmente. O banco já está rodando na VPS.

### Rodar migrations (só quando criar novas tabelas)

```bash
cd backend
php artisan migrate
```

### Resetar banco completo (⚠️ apaga todos os dados)

```bash
cd backend
php artisan migrate:fresh
```

---

## 🔑 Variáveis de ambiente

O arquivo `backend/.env` já está configurado. Caso precise revisar:

```
APP_URL=http://localhost:8005
DB_CONNECTION=pgsql
DB_HOST=31.97.64.214
DB_PORT=5432
DB_DATABASE=ezone
DB_USERNAME=lucas
DB_PASSWORD=marmota73@
BROADCAST_CONNECTION=reverb
REVERB_HOST=localhost
REVERB_PORT=8080
```

O arquivo `frontend/.env` aponta para o backend e Reverb:

```
VITE_REVERB_APP_KEY=6i5bwjziieno1xqkkkfr
VITE_REVERB_HOST=localhost
VITE_REVERB_PORT=8080
VITE_API_URL=http://localhost:8005
```

---

## 🧭 Ordem de inicialização recomendada

```
1. Terminal 1 → php artisan serve --port=8005
2. Terminal 2 → php artisan reverb:start --port=8080
3. Terminal 3 → npm run dev
4. Abrir:       http://localhost:5173
```

---

## 🐛 Problemas comuns

| Problema | Solução |
|---|---|
| `Could not connect to database` | Verifique conexão com a internet (banco é na VPS) |
| Porta 8005 em uso | `lsof -i :8005` e mate o processo, ou mude a porta |
| Porta 5173 em uso | Vite escolhe a próxima porta automaticamente (5174, etc.) |
| `php artisan` não encontrado | Certifique-se de estar dentro da pasta `backend/` |
| `npm run dev` com erro | Rode `npm install` dentro da pasta `frontend/` antes |
| Reverb não conecta | Confirme que o Terminal 2 (reverb:start) está rodando |
