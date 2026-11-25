# Gestão de Cultos e Eventos

Aplicação React, TypeScript e Vite para organizar eventos, roteiros e cronômetros, com visualizações de administração, telão, dispositivos móveis e núcleos.

## Executar localmente

Requer Node.js 22 e npm.

```sh
npm ci
npm run dev
```

Acesse http://localhost:3000.

## Compilar

```sh
npm run build
npm run preview
```

Os arquivos de produção são gerados em `dist`.

## Deploy na Vercel

Importe este repositório na Vercel. O arquivo `vercel.json` configura o framework Vite, o comando de build e a pasta de saída. A branch de produção é `main`.

## Autenticação e configuração

Copie `.env.example` para `.env.local` e configure:

- `PANEL_PASSWORD`: senha compartilhada forte, com pelo menos 16 caracteres.
- `SESSION_SECRET`: segredo aleatório de pelo menos 32 caracteres, usado para assinar as sessões.
- `SUPABASE_URL` e `SUPABASE_KEY`: configuração do banco, usada apenas no servidor.

Cadastre essas mesmas variáveis na Vercel. Nunca use o prefixo `VITE_` para segredos.
Todos os painéis, incluindo telão e núcleos, exigem login. A sessão dura 12 horas, usa cookie HttpOnly, Secure em produção e SameSite=Strict. Alterar a senha invalida as sessões existentes. O botão Sair apaga o cookie do dispositivo e o cache local de eventos.

As operações no banco passam por `/api/events`, que verifica a sessão. A sincronização entre dispositivos consulta a API a cada 1,5 segundo. As políticas RLS do Supabase continuam sendo necessárias para proteger o acesso direto ao banco. O aplicativo usa uma senha compartilhada, sem contas ou permissões individuais. A limitação de tentativas de login é por instância do servidor.

O servidor Vite local disponibiliza as mesmas APIs durante `npm run dev`. `npm run preview` serve somente o frontend compilado.

## Verificação

```sh
npm test
npx tsc --noEmit
npm run build
```

## Limitações existentes

- Os recursos de IA dependem do Gemini e ainda precisam de uma integração no servidor. Nenhuma chave privada Gemini é publicada no navegador.
- Sem conexão com o Supabase, a aplicação usa o armazenamento local do navegador. O acesso ao aplicativo ainda exige uma sessão autenticada.
