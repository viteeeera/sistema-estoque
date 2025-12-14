# Sistema de Controle de Estoque

Sistema completo de controle de estoque com autenticacao, controle de acessos e recuperacao de senha por e-mail.

## Acesso Online

O sistema esta disponivel em: **https://sistema-estoque-qg2u.onrender.com**

### Credenciais Padrao
- **Usuario:** admin
- **Senha:** Admin@123

> Recomendamos trocar a senha apos o primeiro acesso.

## Funcionalidades

### Gestao de Produtos
- Cadastro, edicao e exclusao de produtos
- Codigo de barras e data de validade
- Alerta de estoque minimo
- Visualizacao de estoque em tempo real

### Movimentacoes
- Registro de entradas e saidas
- Historico completo com filtro por periodo
- Rastreamento por usuario

### Controle de Acessos
- Sistema de login com autenticacao segura
- Niveis de acesso personalizaveis (Administrador, Usuario, etc.)
- Permissoes granulares por funcionalidade
- Bloqueio automatico apos tentativas de login falhas

### Recuperacao de Senha
- Recuperacao via e-mail
- Link seguro com expiracao de 1 hora

### Seguranca
- Senhas criptografadas com bcrypt
- Rate limiting para prevenir ataques
- Headers de seguranca com Helmet
- Sessoes persistentes no MongoDB

## Tecnologias Utilizadas

- **Backend:** Node.js + Express
- **Banco de Dados:** MongoDB Atlas
- **Sessoes:** express-session + connect-mongo
- **Seguranca:** Helmet, bcryptjs, express-rate-limit
- **E-mail:** Resend API
- **Frontend:** HTML5, CSS3, JavaScript
- **Hospedagem:** Render

## Variaveis de Ambiente

Para executar o projeto, configure as seguintes variaveis:

```env
MONGO_URI=sua_string_de_conexao_mongodb
SESSION_SECRET=sua_chave_secreta_para_sessoes
RESEND_API_KEY=sua_api_key_do_resend
APP_URL=https://seu-dominio.com
NODE_ENV=production
```

## Executar Localmente

1. Clone o repositorio:
   ```bash
   git clone https://github.com/viteeeera/sistema-estoque.git
   cd sistema-estoque
   ```

2. Instale as dependencias:
   ```bash
   npm install
   ```

3. Configure as variaveis de ambiente (crie um arquivo `.env`)

4. Inicie o servidor:
   ```bash
   npm start
   ```

5. Acesse: `http://localhost:3000`

## Estrutura do Projeto

```
Estoque/
├── server.js              # Servidor Express, API REST e modelos MongoDB
├── package.json           # Configuracoes e dependencias
└── public/                # Arquivos do frontend
    ├── index.html         # Pagina principal (sistema)
    ├── login.html         # Pagina de login
    ├── esqueci-senha.html # Solicitar recuperacao de senha
    ├── redefinir-senha.html # Redefinir senha
    ├── style.css          # Estilos do sistema
    ├── login.css          # Estilos das paginas de autenticacao
    ├── script.js          # Logica do sistema principal
    └── login.js           # Logica de autenticacao
```

## API Endpoints

### Autenticacao
- `POST /api/login` - Login
- `POST /api/logout` - Logout
- `GET /api/sessao` - Verificar sessao
- `POST /api/esqueci-senha` - Solicitar recuperacao
- `POST /api/redefinir-senha` - Redefinir senha

### Usuarios (requer permissao)
- `GET /api/usuarios` - Listar usuarios
- `POST /api/usuarios` - Criar usuario
- `PUT /api/usuarios/:id` - Atualizar usuario
- `DELETE /api/usuarios/:id` - Deletar usuario
- `POST /api/usuarios/:id/desbloquear` - Desbloquear usuario

### Niveis de Acesso (requer permissao)
- `GET /api/niveis` - Listar niveis
- `POST /api/niveis` - Criar nivel
- `PUT /api/niveis/:id` - Atualizar nivel
- `DELETE /api/niveis/:id` - Deletar nivel

### Produtos (requer autenticacao)
- `GET /api/produtos` - Listar produtos
- `GET /api/produtos/:id` - Buscar produto
- `POST /api/produtos` - Criar produto
- `PUT /api/produtos/:id` - Atualizar produto
- `DELETE /api/produtos/:id` - Deletar produto

### Movimentacoes (requer autenticacao)
- `GET /api/movimentacoes` - Listar movimentacoes
- `POST /api/movimentacoes` - Registrar movimentacao

## Permissoes Disponiveis

| Permissao | Descricao |
|-----------|-----------|
| gerenciar_acessos | Criar, editar e deletar usuarios |
| gerenciar_niveis | Criar, editar e deletar niveis de acesso |
| cadastrar_produtos | Cadastrar novos produtos |
| editar_produtos | Editar produtos existentes |
| deletar_produtos | Deletar produtos |
| registrar_movimentacoes | Registrar entradas e saidas |
| visualizar_historico | Ver historico de movimentacoes |

## Licenca

Este projeto foi desenvolvido para fins educacionais e de uso interno.
