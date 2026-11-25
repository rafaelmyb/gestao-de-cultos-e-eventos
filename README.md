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

Copie `.env.example` para `.env.local` e configure `CULTOS_SUPABASE_URL` e `CULTOS_SUPABASE_SERVICE_ROLE_KEY`. A integração Supabase da Vercel fornece essas variáveis com o prefixo `CULTOS`. A chave de serviço fica somente no servidor; nunca use o prefixo `VITE_` para segredos.

Em um banco exclusivo, aplique `database/schema.sql` para criar a tabela e a função de atualização atômica. A tabela usa RLS e não permite acesso direto pelas chaves públicas; a API do servidor usa a chave de serviço.

As operações no banco passam por `/api/events`, sem cache HTTP. Os painéis consultam o servidor a cada segundo quando visíveis e retomam a consulta imediatamente ao voltar ao primeiro plano ou reconectar. O cronômetro usa um prazo comum e o horário do servidor para compensar diferenças entre relógios.

Somente a abertura pelo organizador cria eventos; voluntários e telões aguardam os dados publicados. Alterações que falharam ficam em uma fila local e são reenviadas na reconexão. Respostas atrasadas não substituem alterações mais recentes. A nuvem verde indica sincronização confirmada, e um aviso informa falha de conexão.

Para recuperar um evento criado antes da configuração do banco, abra o painel do organizador no mesmo navegador onde ele foi criado. O roteiro salvo localmente será enviado ao novo banco se o evento ainda não existir nele. Não limpe os dados do navegador antes dessa recuperação.

O servidor Vite local disponibiliza as mesmas APIs durante `npm run dev`. `npm run preview` serve somente o frontend compilado.

## Verificação

```sh
npm test
npx tsc --noEmit
npm run build
```

## Limitações existentes

- Os recursos de IA dependem do Gemini e ainda precisam de uma integração no servidor. Nenhuma chave privada Gemini é publicada no navegador.
- Sem conexão com o Supabase, alterações ficam locais e não chegam aos outros dispositivos até a reconexão.
