# Testes de integração — API de alunos, disciplinas e matrículas

Este projeto didático demonstra como verificar a integração entre uma API HTTP em Express, suas regras de negócio e um banco PostgreSQL real. A aplicação permite cadastrar alunos e disciplinas e registrar matrículas.

A suíte está em [server/test/integration/api.test.ts](server/test/integration/api.test.ts) e contém 47 casos, contando as variações de `test.each`. Ela substitui os antigos testes unitários.

## O que os testes integram

Cada requisição percorre as camadas reais da aplicação:

```mermaid
flowchart LR
    Teste[Teste Jest com fetch] --> HTTP[Servidor HTTP local]
    HTTP --> Rotas[Rotas Express]
    Rotas --> Servicos[Serviços e validações]
    Servicos --> Repositorios[Repositórios com pg]
    Repositorios --> Banco[(PostgreSQL de testes)]
```

As rotas recebem JSON e interpretam os parâmetros; os serviços validam os dados e aplicam regras; os repositórios executam SQL parametrizado. O Express devolve o resultado como resposta HTTP.

Por exemplo, o teste de matrícula duplicada cadastra um aluno e uma disciplina, realiza a matrícula e repete a operação. O PostgreSQL rejeita a duplicação pela chave primária composta, o serviço traduz essa violação e a API responde com `409 Conflict`. O teste verifica toda essa colaboração.

Não há mocks de serviços, repositórios ou consultas. Jest executa os casos, ts-jest processa TypeScript, `fetch` envia requisições reais e `pg.Client` mantém a conexão com o banco. Algumas verificações também consultam diretamente as tabelas para confirmar os dados gravados dentro da transação.

## Como executar

### 1. Iniciar o banco de testes

Instale Node.js 24 e Docker com suporte a Docker Compose. Mantenha o Docker em execução. Na raiz do projeto, execute:

```powershell
docker compose -f compose.test.yml up -d --wait
```

O comando inicia somente o PostgreSQL exclusivo dos testes e aguarda seu healthcheck. O servidor HTTP será iniciado pela própria suíte.

### 2. Instalar dependências e executar os testes

```powershell
cd server
npm ci
npm test
```

O Jest procura arquivos `test/integration/**/*.test.ts`. O comando usa `--runInBand` para executar a suíte em série, pois os testes compartilham uma conexão e usam transações para isolar os dados.

Uma execução bem-sucedida apresenta:

```text
Test Suites: 1 passed, 1 total
Tests:       47 passed, 47 total
```

### 3. Verificar cobertura, tipos e compilação

Ainda em `server`:

```powershell
npm run test:verbose
npm run test:coverage
npm run test:typecheck
npm run build
```

| Comando | Finalidade |
| --- | --- |
| `npm test` | Executar os testes com HTTP e PostgreSQL reais. |
| `npm run test:verbose` | Mostrar o nome e o resultado de cada cenário. |
| `npm run test:coverage` | Executar a suíte e medir o código percorrido. |
| `npm run test:typecheck` | Verificar os tipos da aplicação e dos testes, sem gerar arquivos. |
| `npm run build` | Compilar o código de produção para `server/dist/`. |

O relatório HTML fica em `server/coverage/index.html`. A medição inclui `src/**/*.ts`, exceto `main.ts` e `database/connection.ts`, responsáveis pela inicialização de produção e configuração do Pool. Não há percentual mínimo obrigatório. Cobertura mostra o código executado; as asserções determinam os comportamentos verificados.

### 4. Encerrar o banco

Volte à raiz e execute:

```powershell
cd ..
docker compose -f compose.test.yml down
```

O banco usa armazenamento temporário (`tmpfs`). Seus dados são descartados ao remover o contêiner.

## Configuração da conexão

O arquivo [compose.test.yml](compose.test.yml) configura o ambiente abaixo:

| Configuração | Valor |
| --- | --- |
| Serviço | `database-test` |
| Imagem | `postgres:18-alpine` |
| Host acessível pelo Node.js local | `127.0.0.1` |
| Porta publicada | `5434` |
| Porta interna do PostgreSQL | `5432` |
| Banco | `aula3_test` |
| Usuário e senha | `postgres` |

A suíte lê somente `TEST_DATABASE_URL` para configurar a conexão. Não carrega `.env` nem utiliza as variáveis `DB_*` da aplicação. Com os valores padrão, não é necessário criar `.env` para executar os testes.

Para usar outra instância exclusiva de testes, defina a URL no PowerShell antes de executar o Jest:

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5434/aula3_test"
npm test
```

O banco informado precisa existir, e o usuário deve poder criar schemas e tabelas. Se alterar a porta publicada no Compose, ajuste também a URL. Para voltar à conexão padrão:

```powershell
Remove-Item Env:TEST_DATABASE_URL
```

## Isolamento e ciclo de vida

A suíte usa um schema exclusivo por execução e uma transação por teste.

| Etapa do Jest | Operações |
| --- | --- |
| `beforeAll` | Conecta ao PostgreSQL, cria um schema com prefixo `integration_` e UUID, configura o `search_path`, aplica `database/init.sql` e inicia o Express. |
| `beforeEach` | Executa `BEGIN` antes de cada teste. |
| Teste | Prepara seus registros, envia requisições e verifica as respostas e os dados. |
| `afterEach` | Executa `ROLLBACK`, desfazendo as alterações do teste. |
| `afterAll` | Fecha o servidor HTTP, remove o schema com `DROP SCHEMA ... CASCADE` e encerra a conexão. |

`createApp(client)` recebe o mesmo cliente PostgreSQL usado no controle das transações. Por isso, as consultas dos repositórios participam da transação aberta pelo teste. O servidor escuta em `127.0.0.1` com porta `0`, permitindo que o sistema operacional escolha uma porta disponível.

A suíte aplica o SQL de criação das tabelas, mas não executa `database/seed.sql`. Cada teste prepara seus próprios dados. O auxiliar `fixtures()` cadastra um aluno e uma disciplina por HTTP nos cenários que precisam desses registros.

Sequências de IDs do PostgreSQL podem avançar mesmo após um `ROLLBACK`. Assim, os testes usam os IDs retornados pela API, sem pressupor que toda disciplina receberá o ID `1`.

## Cenários verificados

| Área | Verificações |
| --- | --- |
| Aplicação HTTP | Healthcheck com `200`, rota inexistente com `404` e respostas JSON. |
| Coleções vazias | Alunos, disciplinas e matrículas retornam `[]`. |
| Alunos | Criação com `201`, busca por RA, persistência e ordenação pelo nome. |
| Disciplinas | ID gerado pelo banco, criação, busca, persistência e ordenação por ID. |
| Matrículas | Criação, busca pela chave composta, persistência, ordenação por RA e curso e data ISO no JSON. |
| Campos extras | Campos adicionais não aparecem nos registros retornados nos cenários de criação verificados. |
| Unicidade | RA repetido, nome de disciplina repetido e matrícula duplicada retornam `409`. |
| Chaves estrangeiras | Matrícula com aluno ou disciplina inexistente retorna `404`. |
| Recursos ausentes | Busca de aluno, disciplina ou matrícula inexistente retorna `404`. |
| Identificadores nas URLs | Zero, negativos, decimais, texto misturado, notação exponencial e valores acima do limite retornam `400`. |
| Corpos e nomes inválidos | Tipos inadequados, campos ausentes, nomes curtos, espaços e nomes acima do limite são rejeitados. |
| Chaves no JSON | Valores inválidos de RA e curso e ausência das chaves obrigatórias retornam `400`. |
| Limites válidos | RA `2147483647` e nome com 100 caracteres são aceitos no cadastro de aluno. |
| Parser JSON | JSON malformado retorna `400`; corpo acima do limite retorna `413`. |

Nos erros, os testes verificam o status HTTP e a estrutura `{ statusCode, message, error }`. Nos cenários de criação e consulta, comparam os dados esperados. Consultas SQL diretas confirmam a persistência de alunos, disciplinas e matrículas dentro da transação.

## Como ler e ampliar os testes

Cada caso prepara os dados, executa uma operação e verifica o resultado. O auxiliar `request()` envia JSON, verifica o `Content-Type` e devolve status e corpo da resposta. `expectError()` verifica o contrato dos erros `400`, `404` e `409`; os casos do parser verificam diretamente as respostas `400` e `413`.

Este trecho demonstra um conflito de matrícula provocado no banco real:

```typescript
const keys = await fixtures();

expect((await request("/api/enrollments", "POST", keys)).status).toBe(201);

await expectError("/api/enrollments", 409, "POST", keys);
```

Ao adicionar cenários, prepare os dados necessários no próprio teste, aguarde as operações assíncronas e use `test.each` para variações de entrada. Mantenha os casos independentes da ordem e aproveite os hooks existentes para a limpeza.

Uma violação SQL, como uma duplicação, deixa a transação PostgreSQL em estado de erro até o `ROLLBACK`. Nos testes atuais, a requisição que provoca essa violação é a última operação do caso. Considere esse comportamento antes de acrescentar consultas depois de um erro do banco.

## Estrutura relevante

```text
.
├── compose.test.yml                   # PostgreSQL exclusivo dos testes
├── compose.yml                        # Aplicação completa
├── database/
│   ├── init.sql                       # Tabelas e restrições usadas pela suíte
│   └── seed.sql                       # Dados da demonstração; não usados nos testes
├── front/                            # Interface da demonstração
└── server/
    ├── jest.config.cjs                # Descoberta, transformação e cobertura
    ├── tsconfig.test.json             # Tipagem da aplicação e dos testes
    ├── package.json                   # Dependências e comandos
    ├── test/integration/api.test.ts   # Suíte HTTP com PostgreSQL real
    └── src/
        ├── app.ts                    # createApp(db), rotas e tratamento de erros
        ├── main.ts                   # Inicialização de produção
        ├── validation.ts             # Validações de entrada
        ├── database/                 # Conexão e identificação de violações SQL
        └── modules/
            ├── students/             # Rotas, serviço e repositório de alunos
            ├── courses/              # Rotas, serviço e repositório de disciplinas
            └── enrollments/          # Rotas, serviço e repositório de matrículas
```

## Escopo e limites

A suíte verifica a integração da API até o PostgreSQL. Não cobre o navegador, o frontend, o proxy Nginx, o processo iniciado por `main.ts`, o Pool de produção ou requisições concorrentes. Os testes verificam gravações dentro de transações revertidas; não verificam durabilidade após um commit e uma reconexão.

O endpoint `/health` verifica a resposta da aplicação e não consulta o banco. Ainda assim, esse teste depende do PostgreSQL porque a preparação é compartilhada por toda a suíte.

## Problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| `ECONNREFUSED 127.0.0.1:5434` | Confirme que o Docker está em execução e inicie o serviço com `docker compose -f compose.test.yml up -d --wait`. |
| Porta `5434` ocupada | Altere a porta publicada no Compose e ajuste `TEST_DATABASE_URL`. |
| Falha de autenticação | Confira usuário, senha e banco na URL de conexão. |
| Erro ao criar schema | Confira as permissões do usuário no banco de testes. |
| Muitos testes com o mesmo erro de conexão | Resolva a conexão usada no `beforeAll`, necessária para todos os casos. |

Na raiz do projeto, inspecione o serviço com:

```powershell
docker compose -f compose.test.yml ps
docker compose -f compose.test.yml logs database-test
```

## Executar a demonstração completa

Para explorar manualmente a API e a interface, copie `.env.example` para `.env`, caso ainda não tenha o arquivo, e execute na raiz:

```powershell
docker compose up -d --build
```

Com as portas do modelo, a interface fica em `http://localhost:8080`, a API em `http://localhost:3002/api/students` e o banco da demonstração em `localhost:5433`. Essa execução usa `compose.yml`, o seed e o volume da aplicação. A suíte automatizada usa `compose.test.yml` e o banco exclusivo na porta `5434`.
