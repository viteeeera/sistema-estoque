# Sistema de Controle de Estoque

Sistema simples de cadastro de produtos e controle de estoque com entradas e saídas, desenvolvido com Node.js, Express e JavaScript.

## Funcionalidades

- **Cadastro de Produtos**: Adicionar, editar e excluir produtos
- **Controle de Estoque**: Visualizar quantidade disponível de cada produto
- **Movimentações**: Registrar entradas e saídas de produtos
- **Histórico**: Visualizar histórico completo de movimentações
- **Interface Responsiva**: Design moderno e adaptável a diferentes dispositivos

## Tecnologias Utilizadas

- **Backend**: Node.js + Express
- **Frontend**: HTML5, CSS3, JavaScript
- **Armazenamento**: Arquivos JSON (sem necessidade de banco de dados)

## Como Executar

1. Certifique-se de ter o Node.js instalado (versão 14 ou superior)

2. No terminal, navegue até a pasta do projeto:
   ```bash
   cd Estoque
   ```

3. Instale as dependências (se ainda não instalou):
   ```bash
   npm install
   ```

4. Inicie o servidor:
   ```bash
   npm start
   ```

5. Abra seu navegador e acesse:
   ```
   http://localhost:3000
   ```

## Estrutura do Projeto

```
Estoque/
├── server.js              # Servidor Express e API REST
├── package.json           # Configurações e dependências
├── data/                  # Arquivos de dados (criado automaticamente)
│   ├── produtos.json      # Dados dos produtos
│   └── movimentacoes.json # Histórico de movimentações
└── public/                # Arquivos do frontend
    ├── index.html         # Página principal
    ├── style.css          # Estilos
    └── script.js          # Lógica do frontend
```

## Uso do Sistema

### Cadastrar Produto
1. Acesse a aba "Produtos"
2. Preencha o formulário com nome, descrição, preço e quantidade inicial
3. Clique em "Salvar Produto"

### Editar Produto
1. Na lista de produtos, clique em "Editar"
2. Modifique os campos desejados
3. Clique em "Salvar Produto"

### Registrar Movimentação
1. Acesse a aba "Movimentações"
2. Selecione o produto
3. Escolha o tipo (Entrada ou Saída)
4. Informe a quantidade
5. Adicione uma observação (opcional)
6. Clique em "Registrar Movimentação"

## API Endpoints

### Produtos
- `GET /api/produtos` - Listar todos os produtos
- `GET /api/produtos/:id` - Buscar produto por ID
- `POST /api/produtos` - Criar novo produto
- `PUT /api/produtos/:id` - Atualizar produto
- `DELETE /api/produtos/:id` - Deletar produto

### Movimentações
- `GET /api/movimentacoes` - Listar todas as movimentações
- `POST /api/movimentacoes` - Criar nova movimentação

## Observações

- Os dados são salvos automaticamente em arquivos JSON na pasta `data/`
- Produtos com estoque abaixo de 10 unidades aparecem em vermelho
- O sistema valida se há quantidade suficiente antes de registrar saídas
- Todas as movimentações são registradas com data e hora
