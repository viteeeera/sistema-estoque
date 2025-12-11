const express = require('express');
const cors = require('cors');
// --- 1. CONFIGURAÇÃO DO BANCO DE DADOS (MONGOOSE) ---
const mongoose = require('mongoose');

// Seu link de conexão (já coloquei sua senha 'teste123' aqui)
//const linkConexao = 'mongodb+srv://admin:teste123@cluster0.zb29fhg.mongodb.net/?appName=Cluster0';
const linkConexao = process.env.MONGO_URI; // Pega o valor da variável de ambiente

// Tenta conectar
mongoose.connect(linkConexao)
  .then(() => console.log("✅ Conectado ao Banco MongoDB com sucesso!"))
  .catch((erro) => console.error("❌ Erro ao conectar no banco:", erro));

// --- 2. CRIANDO O MOLDE DO PRODUTO ---
// Aqui a gente avisa pro banco que todo produto tem Nome, Qtd e Preço
const Produto = mongoose.model('Produto', {
    nome: String,
    descricao: String,
    codigoBarras: String,
    dataValidade: String,
    preco: Number,
    quantidade: Number,
    estoqueMinimo: Number,
    dataCadastro: { type: Date, default: Date.now } // O banco preenche a data sozinho
});
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
//const PORT = 3000;
const PORT = process.env.PORT || 3000; // O Render nos dá a porta correta

app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});

app.use(cors({
//    origin: 'http://localhost:3000',
    origin: '*',
    credentials: true
}));
app.use(express.json());

// Configuração de sessão
app.use(session({
    secret: 'estoque-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // true em produção com HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const PRODUTOS_FILE = path.join(DATA_DIR, 'produtos.json');
const MOVIMENTACOES_FILE = path.join(DATA_DIR, 'movimentacoes.json');
const USUARIOS_FILE = path.join(DATA_DIR, 'usuarios.json');
const NIVEIS_FILE = path.join(DATA_DIR, 'niveis.json');

// Criar diretório de dados se não existir
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Inicializar arquivos se não existirem
if (!fs.existsSync(PRODUTOS_FILE)) {
    fs.writeFileSync(PRODUTOS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(MOVIMENTACOES_FILE)) {
    fs.writeFileSync(MOVIMENTACOES_FILE, JSON.stringify([]));
}

// Inicializar níveis de acesso padrão
function inicializarNiveis() {
    if (!fs.existsSync(NIVEIS_FILE)) {
        const niveisPadrao = [
            {
                id: '1',
                nome: 'Administrador',
                descricao: 'Acesso total ao sistema',
                permissoes: {
                    gerenciar_acessos: true,
                    gerenciar_niveis: true,
                    cadastrar_produtos: true,
                    editar_produtos: true,
                    deletar_produtos: true,
                    registrar_movimentacoes: true,
                    visualizar_historico: true
                },
                sistema: true
            },
            {
                id: '2',
                nome: 'Usuário',
                descricao: 'Acesso básico ao sistema',
                permissoes: {
                    gerenciar_acessos: false,
                    gerenciar_niveis: false,
                    cadastrar_produtos: true,
                    editar_produtos: true,
                    deletar_produtos: false,
                    registrar_movimentacoes: true,
                    visualizar_historico: true
                },
                sistema: true
            }
        ];
        fs.writeFileSync(NIVEIS_FILE, JSON.stringify(niveisPadrao, null, 2));
        console.log('Níveis de acesso padrão criados');
    }
}
inicializarNiveis();

// Inicializar usuários com usuário admin padrão
async function inicializarUsuarios() {
    if (!fs.existsSync(USUARIOS_FILE)) {
        const senhaHash = await bcrypt.hash('admin123', 10);
        const usuariosPadrao = [
            {
                id: '1',
                usuario: 'admin',
                senha: senhaHash,
                nome: 'Administrador',
                nivelId: '1' // ID do nível Administrador
            }
        ];
        fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuariosPadrao, null, 2));
        console.log('Usuário admin criado: admin / admin123');
    }
}
inicializarUsuarios();

// Funções auxiliares
function lerProdutos() {
    return JSON.parse(fs.readFileSync(PRODUTOS_FILE, 'utf8'));
}

function salvarProdutos(produtos) {
    fs.writeFileSync(PRODUTOS_FILE, JSON.stringify(produtos, null, 2));
}

function lerMovimentacoes() {
    return JSON.parse(fs.readFileSync(MOVIMENTACOES_FILE, 'utf8'));
}

function salvarMovimentacoes(movimentacoes) {
    fs.writeFileSync(MOVIMENTACOES_FILE, JSON.stringify(movimentacoes, null, 2));
}

function lerUsuarios() {
    return JSON.parse(fs.readFileSync(USUARIOS_FILE, 'utf8'));
}

function salvarUsuarios(usuarios) {
    fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2));
}

function lerNiveis() {
    return JSON.parse(fs.readFileSync(NIVEIS_FILE, 'utf8'));
}

function salvarNiveis(niveis) {
    fs.writeFileSync(NIVEIS_FILE, JSON.stringify(niveis, null, 2));
}

// Função para obter permissões de um usuário
function obterPermissoes(userId) {
    const usuarios = lerUsuarios();
    const usuario = usuarios.find(u => u.id === userId);
    if (!usuario) return null;

    const niveis = lerNiveis();
    const nivel = niveis.find(n => n.id === usuario.nivelId);
    return nivel ? nivel.permissoes : null;
}

// Middleware de autenticação
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ erro: 'Não autenticado' });
}

// Middleware de autorização por permissão
function requirePermission(permissao) {
    return (req, res, next) => {
        const permissoes = obterPermissoes(req.session.userId);
        if (permissoes && permissoes[permissao]) {
            return next();
        }
        return res.status(403).json({ erro: 'Acesso negado. Permissão insuficiente.' });
    };
}

// ROTAS - AUTENTICAÇÃO

// Login
app.post('/api/login', async (req, res) => {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });
    }

    const usuarios = lerUsuarios();
    const user = usuarios.find(u => u.usuario === usuario);

    if (!user) {
        return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);

    if (!senhaValida) {
        return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    }

    const niveis = lerNiveis();
    const nivel = niveis.find(n => n.id === user.nivelId);

    req.session.userId = user.id;
    req.session.usuario = user.usuario;
    req.session.nome = user.nome;
    req.session.nivelId = user.nivelId;

    res.json({
        usuario: user.usuario,
        nome: user.nome,
        nivelId: user.nivelId,
        nivelNome: nivel ? nivel.nome : 'Desconhecido',
        permissoes: nivel ? nivel.permissoes : {}
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ erro: 'Erro ao fazer logout' });
        }
        res.json({ mensagem: 'Logout realizado com sucesso' });
    });
});

// Verificar sessão
app.get('/api/sessao', (req, res) => {
    if (req.session && req.session.userId) {
        const permissoes = obterPermissoes(req.session.userId);
        const niveis = lerNiveis();
        const nivel = niveis.find(n => n.id === req.session.nivelId);

        res.json({
            autenticado: true,
            usuario: req.session.usuario,
            nome: req.session.nome,
            nivelId: req.session.nivelId,
            nivelNome: nivel ? nivel.nome : 'Desconhecido',
            permissoes: permissoes || {}
        });
    } else {
        res.json({ autenticado: false });
    }
});

// ROTAS - NÍVEIS DE ACESSO

// Listar todos os níveis (requer permissão)
app.get('/api/niveis', requireAuth, requirePermission('gerenciar_niveis'), (req, res) => {
    const niveis = lerNiveis();
    res.json(niveis);
});

// Criar novo nível (requer permissão)
app.post('/api/niveis', requireAuth, requirePermission('gerenciar_niveis'), (req, res) => {
    const niveis = lerNiveis();

    const novoNivel = {
        id: Date.now().toString(),
        nome: req.body.nome,
        descricao: req.body.descricao || '',
        permissoes: req.body.permissoes || {
            gerenciar_acessos: false,
            gerenciar_niveis: false,
            cadastrar_produtos: false,
            editar_produtos: false,
            deletar_produtos: false,
            registrar_movimentacoes: false,
            visualizar_historico: false
        },
        sistema: false
    };

    niveis.push(novoNivel);
    salvarNiveis(niveis);
    res.status(201).json(novoNivel);
});

// Atualizar nível (requer permissão)
app.put('/api/niveis/:id', requireAuth, requirePermission('gerenciar_niveis'), (req, res) => {
    const niveis = lerNiveis();
    const index = niveis.findIndex(n => n.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ erro: 'Nível não encontrado' });
    }

    if (niveis[index].sistema) {
        return res.status(403).json({ erro: 'Não é possível editar níveis do sistema' });
    }

    niveis[index].nome = req.body.nome || niveis[index].nome;
    niveis[index].descricao = req.body.descricao || niveis[index].descricao;
    niveis[index].permissoes = req.body.permissoes || niveis[index].permissoes;

    salvarNiveis(niveis);
    res.json(niveis[index]);
});

// Deletar nível (requer permissão)
app.delete('/api/niveis/:id', requireAuth, requirePermission('gerenciar_niveis'), (req, res) => {
    const niveis = lerNiveis();
    const index = niveis.findIndex(n => n.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ erro: 'Nível não encontrado' });
    }

    if (niveis[index].sistema) {
        return res.status(403).json({ erro: 'Não é possível deletar níveis do sistema' });
    }

    const usuarios = lerUsuarios();
    const usuariosComNivel = usuarios.filter(u => u.nivelId === req.params.id);
    if (usuariosComNivel.length > 0) {
        return res.status(400).json({ erro: 'Existem usuários vinculados a este nível' });
    }

    niveis.splice(index, 1);
    salvarNiveis(niveis);
    res.json({ mensagem: 'Nível deletado com sucesso' });
});

// ROTAS - USUÁRIOS

// Listar todos os usuários (requer permissão)
app.get('/api/usuarios', requireAuth, requirePermission('gerenciar_acessos'), (req, res) => {
    const usuarios = lerUsuarios();
    const niveis = lerNiveis();

    const usuariosSemSenha = usuarios.map(u => {
        const nivel = niveis.find(n => n.id === u.nivelId);
        return {
            id: u.id,
            usuario: u.usuario,
            nome: u.nome,
            nivelId: u.nivelId,
            nivelNome: nivel ? nivel.nome : 'Desconhecido'
        };
    });
    res.json(usuariosSemSenha);
});

// Criar novo usuário (requer permissão)
app.post('/api/usuarios', requireAuth, requirePermission('gerenciar_acessos'), async (req, res) => {
    const usuarios = lerUsuarios();

    const usuarioExiste = usuarios.find(u => u.usuario === req.body.usuario);
    if (usuarioExiste) {
        return res.status(400).json({ erro: 'Usuário já existe' });
    }

    const senhaHash = await bcrypt.hash(req.body.senha, 10);
    const novoUsuario = {
        id: Date.now().toString(),
        usuario: req.body.usuario,
        senha: senhaHash,
        nome: req.body.nome,
        nivelId: req.body.nivelId || '2'
    };

    usuarios.push(novoUsuario);
    salvarUsuarios(usuarios);

    const niveis = lerNiveis();
    const nivel = niveis.find(n => n.id === novoUsuario.nivelId);

    const usuarioSemSenha = {
        id: novoUsuario.id,
        usuario: novoUsuario.usuario,
        nome: novoUsuario.nome,
        nivelId: novoUsuario.nivelId,
        nivelNome: nivel ? nivel.nome : 'Desconhecido'
    };

    res.status(201).json(usuarioSemSenha);
});

// Atualizar usuário (requer permissão)
app.put('/api/usuarios/:id', requireAuth, requirePermission('gerenciar_acessos'), async (req, res) => {
    const usuarios = lerUsuarios();
    const index = usuarios.findIndex(u => u.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    if (req.body.senha) {
        usuarios[index].senha = await bcrypt.hash(req.body.senha, 10);
    }

    usuarios[index].nome = req.body.nome || usuarios[index].nome;
    usuarios[index].nivelId = req.body.nivelId || usuarios[index].nivelId;

    if (req.body.usuario && req.body.usuario !== usuarios[index].usuario) {
        const usuarioExiste = usuarios.find(u => u.usuario === req.body.usuario && u.id !== req.params.id);
        if (usuarioExiste) {
            return res.status(400).json({ erro: 'Usuário já existe' });
        }
        usuarios[index].usuario = req.body.usuario;
    }

    salvarUsuarios(usuarios);

    const niveis = lerNiveis();
    const nivel = niveis.find(n => n.id === usuarios[index].nivelId);

    const usuarioSemSenha = {
        id: usuarios[index].id,
        usuario: usuarios[index].usuario,
        nome: usuarios[index].nome,
        nivelId: usuarios[index].nivelId,
        nivelNome: nivel ? nivel.nome : 'Desconhecido'
    };

    res.json(usuarioSemSenha);
});

// Deletar usuário (requer permissão)
app.delete('/api/usuarios/:id', requireAuth, requirePermission('gerenciar_acessos'), (req, res) => {
    const usuarios = lerUsuarios();
    const index = usuarios.findIndex(u => u.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    if (usuarios[index].id === req.session.userId) {
        return res.status(400).json({ erro: 'Você não pode deletar seu próprio usuário' });
    }

    usuarios.splice(index, 1);
    salvarUsuarios(usuarios);
    res.json({ mensagem: 'Usuário deletado com sucesso' });
});

// ROTAS - PRODUTOS

// Listar todos os produtos (requer autenticação)
/*app.get('/api/produtos', requireAuth, (req, res) => {
    const produtos = lerProdutos();
    res.json(produtos);
});
*/

// Listar todos os produtos (requer autenticação)
// ADICIONADO: 'async' antes dos parenteses do (req, res)
app.get('/api/produtos', requireAuth, async (req, res) => {
    try {
        // MUDANÇA: Em vez de lerProdutos(), pedimos ao Mongoose buscar tudo
        const produtos = await Produto.find();
        
        res.json(produtos);
    } catch (erro) {
        // Se der erro no banco, o front recebe um aviso
        res.status(500).json({ erro: "Erro ao buscar no banco de dados" });
    }
});

// Buscar produto por ID (requer autenticação)
app.get('/api/produtos/:id', requireAuth, (req, res) => {
    const produtos = lerProdutos();
    const produto = produtos.find(p => p.id === req.params.id);
    if (produto) {
        res.json(produto);
    } else {
        res.status(404).json({ erro: 'Produto não encontrado' });
    }
});

// Criar novo produto (requer autenticação)
/*app.post('/api/produtos', requireAuth, (req, res) => {
    const produtos = lerProdutos();
    const novoProduto = {
        id: Date.now().toString(),
        nome: req.body.nome,
        descricao: req.body.descricao || '',
        codigoBarras: req.body.codigoBarras || '',
        dataValidade: req.body.dataValidade || '',
        preco: parseFloat(req.body.preco) || 0,
        quantidade: parseInt(req.body.quantidade) || 0,
        estoqueMinimo: parseInt(req.body.estoqueMinimo) || 0,
        dataCadastro: new Date().toISOString()
    };
    produtos.push(novoProduto);
    salvarProdutos(produtos);
    res.status(201).json(novoProduto);
});
*/

// Criar novo produto (requer autenticação)
app.post('/api/produtos', requireAuth, async (req, res) => {
    try {
        // Pegamos os dados que vieram do Frontend
        const { nome, descricao, codigoBarras, dataValidade, preco, quantidade, estoqueMinimo } = req.body;

        // CRIAR E SALVAR NO BANCO (Mongoose)
        const novoProduto = await Produto.create({
            nome,
            descricao: descricao || '',       // Se não vier nada, salva vazio
            codigoBarras: codigoBarras || '',
            dataValidade: dataValidade || '',
            preco: parseFloat(preco) || 0,
            quantidade: parseInt(quantidade) || 0,
            estoqueMinimo: parseInt(estoqueMinimo) || 0
            // Não precisa passar 'id' nem 'dataCadastro', o MongoDB cria automático!
        });

        // Devolve o produto criado para o Frontend confirmar
        res.status(201).json(novoProduto);

    } catch (erro) {
        console.error(erro); // Mostra o erro no seu terminal pra ajudar
        res.status(500).json({ erro: "Erro ao cadastrar produto no banco" });
    }
});

// Atualizar produto (requer autenticação)
app.put('/api/produtos/:id', requireAuth, (req, res) => {
    const produtos = lerProdutos();
    const index = produtos.findIndex(p => p.id === req.params.id);
    if (index !== -1) {
        produtos[index] = {
            ...produtos[index],
            nome: req.body.nome || produtos[index].nome,
            descricao: req.body.descricao !== undefined ? req.body.descricao : produtos[index].descricao,
            codigoBarras: req.body.codigoBarras !== undefined ? req.body.codigoBarras : produtos[index].codigoBarras,
            dataValidade: req.body.dataValidade !== undefined ? req.body.dataValidade : produtos[index].dataValidade,
            preco: req.body.preco !== undefined ? parseFloat(req.body.preco) : produtos[index].preco,
            estoqueMinimo: req.body.estoqueMinimo !== undefined ? parseInt(req.body.estoqueMinimo) : produtos[index].estoqueMinimo
        };
        salvarProdutos(produtos);
        res.json(produtos[index]);
    } else {
        res.status(404).json({ erro: 'Produto não encontrado' });
    }
});

// Deletar produto (requer permissão)
app.delete('/api/produtos/:id', requireAuth, requirePermission('deletar_produtos'), (req, res) => {
    const produtos = lerProdutos();
    const index = produtos.findIndex(p => p.id === req.params.id);
    if (index !== -1) {
        produtos.splice(index, 1);
        salvarProdutos(produtos);
        res.json({ mensagem: 'Produto deletado com sucesso' });
    } else {
        res.status(404).json({ erro: 'Produto não encontrado' });
    }
});

// ROTAS - MOVIMENTAÇÕES

// Listar todas as movimentações (requer autenticação)
app.get('/api/movimentacoes', requireAuth, (req, res) => {
    const movimentacoes = lerMovimentacoes();
    res.json(movimentacoes);
});

// Criar nova movimentação (entrada ou saída) (requer autenticação)
app.post('/api/movimentacoes', requireAuth, (req, res) => {
    const produtos = lerProdutos();
    const movimentacoes = lerMovimentacoes();

    const produto = produtos.find(p => p.id === req.body.produtoId);
    if (!produto) {
        return res.status(404).json({ erro: 'Produto não encontrado' });
    }

    const quantidade = parseInt(req.body.quantidade);
    const tipo = req.body.tipo; // 'entrada' ou 'saida'

    if (tipo === 'saida' && produto.quantidade < quantidade) {
        return res.status(400).json({ erro: 'Quantidade insuficiente em estoque' });
    }

    // Atualizar quantidade do produto
    if (tipo === 'entrada') {
        produto.quantidade += quantidade;
    } else if (tipo === 'saida') {
        produto.quantidade -= quantidade;
    } else {
        return res.status(400).json({ erro: 'Tipo inválido. Use "entrada" ou "saida"' });
    }

    // Criar movimentação com registro do usuário
    const novaMovimentacao = {
        id: Date.now().toString(),
        produtoId: req.body.produtoId,
        produtoNome: produto.nome,
        tipo: tipo,
        quantidade: quantidade,
        observacao: req.body.observacao || '',
        usuario: req.session.nome,
        data: new Date().toISOString()
    };

    movimentacoes.push(novaMovimentacao);

    salvarProdutos(produtos);
    salvarMovimentacoes(movimentacoes);

    res.status(201).json({
        movimentacao: novaMovimentacao,
        produtoAtualizado: produto
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
