const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONEXÃO COM MONGODB ---
const linkConexao = process.env.MONGO_URI;

mongoose.connect(linkConexao)
    .then(() => console.log("✅ Conectado ao Banco MongoDB com sucesso!"))
    .catch((erro) => console.error("❌ Erro ao conectar no banco:", erro));

// --- MODELOS MONGOOSE ---

// Modelo de Produto
const Produto = mongoose.model('Produto', {
    nome: String,
    descricao: String,
    codigoBarras: String,
    dataValidade: String,
    preco: Number,
    quantidade: Number,
    estoqueMinimo: Number,
    dataCadastro: { type: Date, default: Date.now }
});

// Modelo de Nível de Acesso
const Nivel = mongoose.model('Nivel', {
    nome: String,
    descricao: String,
    permissoes: {
        gerenciar_acessos: Boolean,
        gerenciar_niveis: Boolean,
        cadastrar_produtos: Boolean,
        editar_produtos: Boolean,
        deletar_produtos: Boolean,
        registrar_movimentacoes: Boolean,
        visualizar_historico: Boolean
    },
    sistema: { type: Boolean, default: false }
});

// Modelo de Usuário
const Usuario = mongoose.model('Usuario', {
    usuario: { type: String, unique: true },
    senha: String,
    nome: String,
    nivelId: String
});

// Modelo de Movimentação
const Movimentacao = mongoose.model('Movimentacao', {
    produtoId: String,
    produtoNome: String,
    tipo: String,
    quantidade: Number,
    observacao: String,
    usuario: String,
    data: { type: Date, default: Date.now }
});

// --- MIDDLEWARES ---
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());

// Configuração de sessão com MongoDB Store
app.use(session({
    secret: process.env.SESSION_SECRET || 'estoque-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: linkConexao,
        ttl: 24 * 60 * 60 // 1 dia
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    proxy: true
}));

app.use(express.static('public'));

// --- INICIALIZAÇÃO DE DADOS PADRÃO ---
async function inicializarDados() {
    try {
        // Verificar se já existem níveis
        const niveisExistentes = await Nivel.countDocuments();
        if (niveisExistentes === 0) {
            await Nivel.create([
                {
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
            ]);
            console.log('✅ Níveis de acesso padrão criados');
        }

        // Verificar se já existe usuário admin
        const adminExistente = await Usuario.findOne({ usuario: 'admin' });
        if (!adminExistente) {
            const nivelAdmin = await Nivel.findOne({ nome: 'Administrador' });
            const senhaHash = await bcrypt.hash('admin123', 10);
            await Usuario.create({
                usuario: 'admin',
                senha: senhaHash,
                nome: 'Administrador',
                nivelId: nivelAdmin._id.toString()
            });
            console.log('✅ Usuário admin criado: admin / admin123');
        }
    } catch (erro) {
        console.error('❌ Erro ao inicializar dados:', erro);
    }
}

// Chamar inicialização após conexão
mongoose.connection.once('open', inicializarDados);

// --- FUNÇÕES AUXILIARES ---
async function obterPermissoes(userId) {
    try {
        const usuario = await Usuario.findById(userId);
        if (!usuario) return null;

        const nivel = await Nivel.findById(usuario.nivelId);
        return nivel ? nivel.permissoes : null;
    } catch {
        return null;
    }
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
    return async (req, res, next) => {
        const permissoes = await obterPermissoes(req.session.userId);
        if (permissoes && permissoes[permissao]) {
            return next();
        }
        return res.status(403).json({ erro: 'Acesso negado. Permissão insuficiente.' });
    };
}

// --- ROTAS DE AUTENTICAÇÃO ---

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;

        if (!usuario || !senha) {
            return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });
        }

        const user = await Usuario.findOne({ usuario });
        if (!user) {
            return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
        }

        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
        }

        const nivel = await Nivel.findById(user.nivelId);

        req.session.userId = user._id.toString();
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
    } catch (erro) {
        console.error('Erro no login:', erro);
        res.status(500).json({ erro: 'Erro interno do servidor' });
    }
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
app.get('/api/sessao', async (req, res) => {
    if (req.session && req.session.userId) {
        const permissoes = await obterPermissoes(req.session.userId);
        const nivel = await Nivel.findById(req.session.nivelId);

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

// --- ROTAS DE NÍVEIS DE ACESSO ---

// Listar todos os níveis
app.get('/api/niveis', requireAuth, requirePermission('gerenciar_niveis'), async (req, res) => {
    try {
        const niveis = await Nivel.find();
        res.json(niveis);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar níveis' });
    }
});

// Criar novo nível
app.post('/api/niveis', requireAuth, requirePermission('gerenciar_niveis'), async (req, res) => {
    try {
        const novoNivel = await Nivel.create({
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
        });
        res.status(201).json(novoNivel);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao criar nível' });
    }
});

// Atualizar nível
app.put('/api/niveis/:id', requireAuth, requirePermission('gerenciar_niveis'), async (req, res) => {
    try {
        const nivel = await Nivel.findById(req.params.id);
        if (!nivel) {
            return res.status(404).json({ erro: 'Nível não encontrado' });
        }

        if (nivel.sistema) {
            return res.status(403).json({ erro: 'Não é possível editar níveis do sistema' });
        }

        nivel.nome = req.body.nome || nivel.nome;
        nivel.descricao = req.body.descricao || nivel.descricao;
        nivel.permissoes = req.body.permissoes || nivel.permissoes;

        await nivel.save();
        res.json(nivel);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar nível' });
    }
});

// Deletar nível
app.delete('/api/niveis/:id', requireAuth, requirePermission('gerenciar_niveis'), async (req, res) => {
    try {
        const nivel = await Nivel.findById(req.params.id);
        if (!nivel) {
            return res.status(404).json({ erro: 'Nível não encontrado' });
        }

        if (nivel.sistema) {
            return res.status(403).json({ erro: 'Não é possível deletar níveis do sistema' });
        }

        const usuariosComNivel = await Usuario.countDocuments({ nivelId: req.params.id });
        if (usuariosComNivel > 0) {
            return res.status(400).json({ erro: 'Existem usuários vinculados a este nível' });
        }

        await Nivel.findByIdAndDelete(req.params.id);
        res.json({ mensagem: 'Nível deletado com sucesso' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao deletar nível' });
    }
});

// --- ROTAS DE USUÁRIOS ---

// Listar todos os usuários
app.get('/api/usuarios', requireAuth, requirePermission('gerenciar_acessos'), async (req, res) => {
    try {
        const usuarios = await Usuario.find();
        const niveis = await Nivel.find();

        const usuariosSemSenha = usuarios.map(u => {
            const nivel = niveis.find(n => n._id.toString() === u.nivelId);
            return {
                id: u._id,
                usuario: u.usuario,
                nome: u.nome,
                nivelId: u.nivelId,
                nivelNome: nivel ? nivel.nome : 'Desconhecido'
            };
        });
        res.json(usuariosSemSenha);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar usuários' });
    }
});

// Criar novo usuário
app.post('/api/usuarios', requireAuth, requirePermission('gerenciar_acessos'), async (req, res) => {
    try {
        const usuarioExiste = await Usuario.findOne({ usuario: req.body.usuario });
        if (usuarioExiste) {
            return res.status(400).json({ erro: 'Usuário já existe' });
        }

        const senhaHash = await bcrypt.hash(req.body.senha, 10);
        const novoUsuario = await Usuario.create({
            usuario: req.body.usuario,
            senha: senhaHash,
            nome: req.body.nome,
            nivelId: req.body.nivelId
        });

        const nivel = await Nivel.findById(novoUsuario.nivelId);

        res.status(201).json({
            id: novoUsuario._id,
            usuario: novoUsuario.usuario,
            nome: novoUsuario.nome,
            nivelId: novoUsuario.nivelId,
            nivelNome: nivel ? nivel.nome : 'Desconhecido'
        });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao criar usuário' });
    }
});

// Atualizar usuário
app.put('/api/usuarios/:id', requireAuth, requirePermission('gerenciar_acessos'), async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }

        if (req.body.senha) {
            usuario.senha = await bcrypt.hash(req.body.senha, 10);
        }

        usuario.nome = req.body.nome || usuario.nome;
        usuario.nivelId = req.body.nivelId || usuario.nivelId;

        if (req.body.usuario && req.body.usuario !== usuario.usuario) {
            const usuarioExiste = await Usuario.findOne({ usuario: req.body.usuario });
            if (usuarioExiste) {
                return res.status(400).json({ erro: 'Usuário já existe' });
            }
            usuario.usuario = req.body.usuario;
        }

        await usuario.save();

        const nivel = await Nivel.findById(usuario.nivelId);

        res.json({
            id: usuario._id,
            usuario: usuario.usuario,
            nome: usuario.nome,
            nivelId: usuario.nivelId,
            nivelNome: nivel ? nivel.nome : 'Desconhecido'
        });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar usuário' });
    }
});

// Deletar usuário
app.delete('/api/usuarios/:id', requireAuth, requirePermission('gerenciar_acessos'), async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }

        if (usuario._id.toString() === req.session.userId) {
            return res.status(400).json({ erro: 'Você não pode deletar seu próprio usuário' });
        }

        await Usuario.findByIdAndDelete(req.params.id);
        res.json({ mensagem: 'Usuário deletado com sucesso' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao deletar usuário' });
    }
});

// --- ROTAS DE PRODUTOS ---

// Listar todos os produtos
app.get('/api/produtos', requireAuth, async (req, res) => {
    try {
        const produtos = await Produto.find();
        res.json(produtos);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar produtos' });
    }
});

// Buscar produto por ID
app.get('/api/produtos/:id', requireAuth, async (req, res) => {
    try {
        const produto = await Produto.findById(req.params.id);
        if (produto) {
            res.json(produto);
        } else {
            res.status(404).json({ erro: 'Produto não encontrado' });
        }
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar produto' });
    }
});

// Criar novo produto
app.post('/api/produtos', requireAuth, async (req, res) => {
    try {
        const { nome, descricao, codigoBarras, dataValidade, preco, quantidade, estoqueMinimo } = req.body;

        const novoProduto = await Produto.create({
            nome,
            descricao: descricao || '',
            codigoBarras: codigoBarras || '',
            dataValidade: dataValidade || '',
            preco: parseFloat(preco) || 0,
            quantidade: parseInt(quantidade) || 0,
            estoqueMinimo: parseInt(estoqueMinimo) || 0
        });

        res.status(201).json(novoProduto);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao cadastrar produto' });
    }
});

// Atualizar produto
app.put('/api/produtos/:id', requireAuth, async (req, res) => {
    try {
        const produto = await Produto.findById(req.params.id);
        if (!produto) {
            return res.status(404).json({ erro: 'Produto não encontrado' });
        }

        produto.nome = req.body.nome || produto.nome;
        produto.descricao = req.body.descricao !== undefined ? req.body.descricao : produto.descricao;
        produto.codigoBarras = req.body.codigoBarras !== undefined ? req.body.codigoBarras : produto.codigoBarras;
        produto.dataValidade = req.body.dataValidade !== undefined ? req.body.dataValidade : produto.dataValidade;
        produto.preco = req.body.preco !== undefined ? parseFloat(req.body.preco) : produto.preco;
        produto.estoqueMinimo = req.body.estoqueMinimo !== undefined ? parseInt(req.body.estoqueMinimo) : produto.estoqueMinimo;

        await produto.save();
        res.json(produto);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar produto' });
    }
});

// Deletar produto
app.delete('/api/produtos/:id', requireAuth, requirePermission('deletar_produtos'), async (req, res) => {
    try {
        const produto = await Produto.findById(req.params.id);
        if (!produto) {
            return res.status(404).json({ erro: 'Produto não encontrado' });
        }

        await Produto.findByIdAndDelete(req.params.id);
        res.json({ mensagem: 'Produto deletado com sucesso' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao deletar produto' });
    }
});

// --- ROTAS DE MOVIMENTAÇÕES ---

// Listar todas as movimentações
app.get('/api/movimentacoes', requireAuth, async (req, res) => {
    try {
        const movimentacoes = await Movimentacao.find();
        res.json(movimentacoes);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar movimentações' });
    }
});

// Criar nova movimentação
app.post('/api/movimentacoes', requireAuth, async (req, res) => {
    try {
        const produto = await Produto.findById(req.body.produtoId);
        if (!produto) {
            return res.status(404).json({ erro: 'Produto não encontrado' });
        }

        const quantidade = parseInt(req.body.quantidade);
        const tipo = req.body.tipo;

        if (tipo === 'saida' && produto.quantidade < quantidade) {
            return res.status(400).json({ erro: 'Quantidade insuficiente em estoque' });
        }

        if (tipo === 'entrada') {
            produto.quantidade += quantidade;
        } else if (tipo === 'saida') {
            produto.quantidade -= quantidade;
        } else {
            return res.status(400).json({ erro: 'Tipo inválido. Use "entrada" ou "saida"' });
        }

        const novaMovimentacao = await Movimentacao.create({
            produtoId: req.body.produtoId,
            produtoNome: produto.nome,
            tipo: tipo,
            quantidade: quantidade,
            observacao: req.body.observacao || '',
            usuario: req.session.nome
        });

        await produto.save();

        res.status(201).json({
            movimentacao: novaMovimentacao,
            produtoAtualizado: produto
        });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao registrar movimentação' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
