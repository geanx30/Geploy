# Geploy

Painel web para que cada desenvolvedor gerencie **apenas os sistemas dos quais é dono** neste servidor: atualizar (`git pull`), iniciar, parar e reiniciar, sem precisar de acesso direto ao servidor.

## Como funciona

- Um **administrador** cadastra cada sistema pelo painel: nome, pasta do repositório no servidor, tipo de processo (Serviço Windows via NSSM, ou Site/App Pool do IIS) e o usuário dono.
- Cada **usuário comum** loga e só enxerga os sistemas que são dele. Toda ação (update/start/stop/restart) é resolvida no servidor a partir do registro cadastrado — o usuário nunca informa path ou nome de serviço, então não há como ele alcançar a pasta/serviço de outra pessoa.
- Toda ação fica registrada em um log de auditoria (quem, quando, o quê, saída do comando).

## Alertas por e-mail

Tela **SMTP** (admin) configura o servidor de envio (host, porta, usuário/senha, remetente) e permite enviar um e-mail de teste. Cadastre um **e-mail em cada usuário** (tela Usuários) para que os alertas cheguem:

- **Atualização suspeita**: quando a análise de risco encontra algo e a atualização fica pendente de aprovação, todos os admins com e-mail cadastrado recebem um aviso.
- **Sistema fora do ar**: um monitor interno verifica o status de todos os sistemas a cada minuto; se um sistema ficar fora do ar por **3 minutos seguidos**, é enviado um e-mail para todos os admins + o dono do sistema (só uma vez por queda, não fica repetindo — só alerta de novo se cair outra vez depois de ter voltado).

## Tema claro/escuro

Botão de sol/lua ao lado de "Minha conta" na barra lateral. A preferência fica salva no navegador de cada pessoa (`localStorage`), então cada usuário escolhe o seu sem afetar os outros.

## Estrutura

```
server/   API Node/Express (porta definida em server/.env)
client/   SPA React (Vite), consome a API
data/     banco SQLite (geploy.db) — fora do git
```

Usa o módulo `node:sqlite` nativo do Node 24+ (sem dependências nativas para compilar).

## Primeira instalação

```bash
cd server
npm install
copy .env.example .env   # edite os valores, veja abaixo
npm run seed-admin       # cria o primeiro usuário admin a partir do .env

cd ../client
npm install
```

### Variáveis de ambiente (`server/.env`)

| Variável | Descrição |
|---|---|
| `PORT` | Porta do Geploy. **Confira com `netstat -ano` antes** — este servidor já roda vários outros sistemas em outras portas. |
| `JWT_SECRET` | String aleatória longa para assinar as sessões. |
| `GEPLOY_MASTER_KEY` | 64 caracteres hex (32 bytes) para criptografar tokens git salvos no banco. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | Usadas só pelo `npm run seed-admin`, para criar/resetar o primeiro admin. |
| `DB_PATH` | Caminho do arquivo SQLite (padrão `../data/geploy.db`). |

**Troque a senha do admin padrão assim que logar pela primeira vez** (tela Usuários → editar).

## Rodando em desenvolvimento

```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd client && npm run dev
```

Acesse `http://localhost:5173` (o Vite faz proxy de `/api` para o server).

## Build de produção

```bash
cd client && npm run build
cd ../server && npm start
```

O `server` passa a servir o build do `client` (pasta `client/dist`) e a API, tudo na mesma porta (`PORT` do `.env`).

## Rodando como Windows Service (NSSM)

Já está instalado e rodando neste servidor assim (NSSM em `C:\nssm\win64\nssm.exe`, mesmo binário usado pelos outros sistemas):

```bat
nssm install Geploy "C:\Program Files\nodejs\node.exe" "C:\Sistemas\Geploy\server\src\index.js"
nssm set Geploy AppDirectory "C:\Sistemas\Geploy\server"
nssm set Geploy AppStdout "C:\Sistemas\Geploy\logs\service-out.log"
nssm set Geploy AppStderr "C:\Sistemas\Geploy\logs\service-err.log"
nssm set Geploy AppRotateFiles 1
nssm set Geploy Start SERVICE_AUTO_START
nssm start Geploy
```

- **Porta**: `server/.env` está com `PORT=5173` — reaproveita a regra de firewall já liberada (a mesma usada antes pelo Vite em desenvolvimento), então não precisou abrir porta nova. Acesse por `http://vm-sistemas:5173`.
- **Logs**: `logs/service-out.log` e `logs/service-err.log` (com rotação habilitada).
- **Gerenciar o serviço**: `nssm restart Geploy`, `nssm stop Geploy`, `sc query Geploy`.
- **Conta do serviço e permissões**: instalado com a conta padrão do NSSM (LocalSystem), igual aos demais serviços deste servidor — já tem os privilégios necessários para `sc.exe start/stop` e `appcmd.exe`. Trade-off documentado: essa conta tem controle total do servidor, então proteja bem `GEPLOY_MASTER_KEY`/`.env` e a senha do admin do Geploy. Uma alternativa mais restrita, se quiser endurecer depois, é criar uma conta de serviço dedicada e usar `sc sdset` para conceder só start/stop nos serviços específicos gerenciados.
- **Desenvolvimento depois do deploy**: como a porta 5173 agora é ocupada pelo serviço em produção, para rodar `client && npm run dev` localmente de novo, mude temporariamente `PORT` no `server/.env` para outra porta livre (ex.: `7070`) e ajuste o proxy em `client/vite.config.js` para apontar pra ela.

## Cadastrando um sistema (como admin)

Tela **Sistemas → Novo sistema**:
- **Pasta do repositório**: caminho local no servidor (ex.: `C:\Sistemas\NomeDoSistema`).
- **Tipo de processo**: Serviço Windows (informe o nome exato do serviço, igual ao `sc query`) ou Site IIS (nome do site e, opcionalmente, do App Pool para recycle no restart).
- **Credencial do Git**: necessária se o repositório for privado.
  - *HTTPS + Token*: gere um PAT (Personal Access Token) no GitHub/Azure DevOps/GitLab com permissão só de leitura (`repo`/`read_repository`) e cole aqui. Fica criptografado no banco. **O token é opcional**: se o admin deixar em branco, o card do sistema mostra "Configurar token" para o dono até ele mesmo cadastrar o próprio PAT — só depois disso o botão Atualizar libera. Um token já cadastrado pode ser **removido** (pelo admin na edição do sistema, ou pelo próprio dono no card) — o sistema volta a exigir um novo, útil ao trocar o dono do sistema.
  - *Chave SSH*: informe o caminho de um arquivo de chave privada (deploy key) já existente no servidor, dedicado a esse repositório.
- **Comandos pós-atualização (opcional)**: um comando por linha, executado nessa ordem na pasta do repositório logo após o `git pull` ter sucesso (ex.: `npm install`, `npm run build`, `node scripts/init-db.js`). Para na primeira falha. Esses são os comandos "de base" do sistema.
- **Endereço interno / DNS público (opcional)**: onde o sistema roda (ex.: `vm-sistemas:3000`) e/ou o domínio público (ex.: `gcontrol.grupogadens.com.br`). Aparecem como links clicáveis no card, para quem for acessar o sistema não precisar perguntar.

## Editando arquivos do sistema

O link **Arquivos** no card abre um navegador da pasta do sistema com editor de texto (para ajustar `.env`, configs etc.). Dono e admins podem usar, cada um só nos sistemas que acessa.

- Só enxerga/edita dentro da pasta cadastrada do sistema: `..`, caminhos absolutos, atalhos/junctions que apontam para fora, nomes curtos 8.3 e streams NTFS são bloqueados (validação em `server/src/services/fileManager.js`).
- `.git` e `node_modules` ficam ocultos e inacessíveis. Só arquivos de texto de até 1 MB; binários não abrem.
- Cada salvamento guarda a versão anterior (últimas 20 por arquivo, em `data/file-backups/`, fora da pasta do sistema) e aparece em "Versões anteriores" no editor. Carregar uma versão antiga só preenche o editor; vale quando salvar.
- Preserva as quebras de linha originais (CRLF/LF) e recusa salvar se o arquivo mudou no disco depois de aberto.
- A auditoria registra quem editou qual arquivo, nunca o conteúdo (pode ter segredos).
- Editar o `.env` não reinicia o sistema: a mudança só vale depois de reiniciar o serviço.
- **Upload de arquivos**: botão "Enviar arquivo" ou arrastar e soltar, na pasta aberta. Útil para arquivos que não vêm do GitHub (banco de dados, `.env` pronto). Streaming direto pro disco (sem limite de memória), com barra de progresso; limite de tamanho configurável via `MAX_UPLOAD_MB` no `.env` (padrão 500 MB). Se já existir um arquivo com o mesmo nome, pede confirmação antes de substituir — e a versão antiga também vira backup.

## Atualizando um sistema (como dono)

Ao clicar em **Atualizar** no card do sistema, o Geploy primeiro faz um `git fetch` + `diff` (sem alterar nada ainda) e mostra: o que vai mudar (diff/arquivos) e os comandos pós-atualização já configurados pelo admin (se houver) — o dono pode **ajustá-los só para aquela execução** (não altera o cadastro permanente).

Esse diff passa por um **scanner de padrões de risco** (sem IA, só regex — `services/riskScan.js`): comando destrutivo de arquivos, execução dinâmica de código (`eval`, `Invoke-Expression`...), download+execução remota, segredo/credencial hardcoded, desativação de TLS, possível exfiltração de env vars, shell reverso, controle de outro serviço do Windows.

- **Sem achados, ou quem clica é admin**: o botão aplica na hora (`git pull` + comandos pós-atualização).
- **Com achados e quem clica é um usuário comum (não admin)**: o botão vira **"Enviar para aprovação"** — nada é aplicado; cria-se uma solicitação pendente (tela **Aprovações**, só admin) com o diff completo e os achados. Um admin aprova (aplica de verdade, com os mesmos comandos salvos no pedido) ou rejeita (nada muda no código).

Tudo — pedido, aprovação, rejeição e aplicação — fica registrado na auditoria.

## Segurança — pontos importantes

- Toda rota de ação (`/api/systems/:id/...`) carrega o sistema pelo `id` e confere no banco se o usuário logado é o dono (ou admin) antes de executar qualquer coisa — **nenhum path ou nome de serviço vem do cliente**.
- Comandos de git/controle de processo são sempre executados com `execFile` e argumentos fixos (nunca `exec`/shell), evitando injeção de comando.
- Os **comandos pós-atualização** são a exceção consciente a essa regra: rodam via `cmd.exe /c` porque precisam suportar coisas como `npm install`. O valor base vem do cadastro do admin, mas o dono do sistema pode editá-lo por execução — ou seja, qualquer dono de sistema pode rodar comandos arbitrários no servidor com os privilégios da conta do Geploy, só que a partir da pasta do próprio sistema dele. Leve isso em conta ao decidir as permissões da conta de serviço (seção acima).
- Tokens de git ficam criptografados (AES-256-GCM) no banco, nunca em texto puro.
- Troque `JWT_SECRET`, `GEPLOY_MASTER_KEY` e a senha do admin padrão antes de expor a ferramenta para os demais usuários.
