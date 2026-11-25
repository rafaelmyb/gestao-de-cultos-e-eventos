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

## Acesso e configuração

O aplicativo abre diretamente na tela inicial, sem senha ou login. Todos os painéis e a API de eventos são públicos: qualquer pessoa com o endereço pode consultar e alterar eventos. Não use esta versão para dados restritos.

Copie `.env.example` para `.env.local` e configure `SUPABASE_URL` e `SUPABASE_KEY`. Cadastre as mesmas variáveis na Vercel. A configuração do banco fica apenas no servidor; nunca use o prefixo `VITE_` para segredos.

As operações no banco passam por `/api/events`. A sincronização entre dispositivos consulta a API a cada 1,5 segundo. As políticas RLS do Supabase continuam sendo necessárias para proteger o acesso direto ao banco.

O servidor Vite local disponibiliza as mesmas APIs durante `npm run dev`. `npm run preview` serve somente o frontend compilado.

## Verificação

```sh
npm test
npx tsc --noEmit
npm run build
```

## Limitações existentes

- Os recursos de IA dependem do Gemini e ainda precisam de uma integração no servidor. Nenhuma chave privada Gemini é publicada no navegador.
- Sem conexão com o Supabase, a aplicação usa o armazenamento local do navegador.
