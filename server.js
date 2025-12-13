const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÃO DO RESEND (E-MAIL) ---
const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// --- CONEXÃO COM MONGODB ---
const linkConexao = process.env.MONGO_URI;

mongoose.connect(linkConexao)
    .then(() => console.log("✅ Conectado ao Banco MongoDB com sucesso!"))
    .catch((erro) => console.error("❌ Erro ao conectar no banco:", erro));

// --- MODELOS MONGOOSE ---

// Modelo de Produto
const Produto = mongoose.model('Produto', {
    nome: { type: String, required: true, trim: true },
    descricao: { type: String, trim: true },
    codigoBarras: { type: String, trim: true },
    dataValidade: String,
    preco: { type: Number, min: 0 },
    quantidade: { type: Number, min: 0, default: 0 },
    estoqueMinimo: { type: Number, min: 0, default: 0 },
    dataCadastro: { type: Date, default: Date.now }
});

// Modelo de Nível de Acesso
const Nivel = mongoose.model('Nivel', {
    nome: { type: String, required: true, trim: true },
    descricao: { type: String, trim: true },
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

// Modelo de Usuário (com e-mail)
const Usuario = mongoose.model('Usuario', {
    usuario: { type: String, unique: true, required: true, trim: true, lowercase: true },
    email: { type: String, unique: true, required: true, trim: true, lowercase: true },
    senha: { type: String, required: true },
    nome: { type: String, required: true, trim: true },
    nivelId: { type: String, required: true },
    bloqueadoAte: { type: Date, default: null },
    tentativasLogin: { type: Number, default: 0 },
    resetToken: { type: String, default: null },
    resetTokenExpira: { type: Date, default: null }
});

// Modelo de Movimentação
const Movimentacao = mongoose.model('Movimentacao', {
    produtoId: String,
    produtoNome: String,
    tipo: { type: String, enum: ['entrada', 'saida'] },
    quantidade: { type: Number, min: 1 },
    observacao: String,
    usuario: String,
    data: { type: Date, default: Date.now }
});

// --- MIDDLEWARES DE SEGURANÇA ---

// Helmet - Headers de segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// CORS restrito
const allowedOrigins = [
    'http://localhost:3000',
    'https://sistema-estoque-xqv7.onrender.com',
    process.env.APP_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Permitir requisições sem origin (como mobile apps ou Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado pelo CORS'));
        }
    },
    credentials: true
}));

// Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requisições por IP
    message: { erro: 'Muitas requisições. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(globalLimiter);

// Rate limiting específico para login (mais restrito)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 tentativas de login por IP
    message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting para recuperação de senha
const resetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // máximo 3 solicitações por hora
    message: { erro: 'Muitas solicitações de recuperação. Tente novamente em 1 hora.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(express.json({ limit: '10kb' })); // Limitar tamanho do body

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

// --- FUNÇÕES DE VALIDAÇÃO ---
function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

function validarSenha(senha) {
    return senha && senha.length >= 6;
}

function sanitizar(str) {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/[<>]/g, '');
}

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
            const senhaHash = await bcrypt.hash('Admin@123', 10);
            await Usuario.create({
                usuario: 'admin',
                email: 'admin@sistema.local',
                senha: senhaHash,
                nome: 'Administrador',
                nivelId: nivelAdmin._id.toString()
            });
            console.log('✅ Usuário admin criado (troque a senha no primeiro acesso!)');
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

// Função para enviar e-mail de recuperação
async function enviarEmailRecuperacao(email, nome, token) {
    const linkRecuperacao = `${APP_URL}/redefinir-senha.html?token=${token}`;

    try {
        // Se não tiver API key configurada, apenas loga
        if (!process.env.RESEND_API_KEY) {
            console.log('📧 [DEV] Link de recuperação:', linkRecuperacao);
            return true;
        }

        await resend.emails.send({
            from: 'Sistema de Estoque <onboarding@resend.dev>',
            to: email,
            subject: 'Recuperação de Senha - Sistema de Estoque',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #667eea;">Recuperação de Senha</h2>
                    <p>Olá, <strong>${nome}</strong>!</p>
                    <p>Recebemos uma solicitação para redefinir sua senha.</p>
                    <p>Clique no botão abaixo para criar uma nova senha:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${linkRecuperacao}"
                           style="background: #667eea; color: white; padding: 15px 30px;
                                  text-decoration: none; border-radius: 5px; display: inline-block;">
                            Redefinir Senha
                        </a>
                    </div>
                    <p style="color: #666; font-size: 14px;">
                        Este link expira em <strong>1 hora</strong>.
                    </p>
                    <p style="color: #666; font-size: 14px;">
                        Se você não solicitou esta recuperação, ignore este e-mail.
                    </p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px;">
                        Sistema de Controle de Estoque
                    </p>
                </div>
            `
        });
        return true;
    } catch (erro) {
        console.error('Erro ao enviar e-mail:', erro);
        return false;
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

// Login (com rate limiting)
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const usuario = sanitizar(req.body.usuario);
        const senha = req.body.senha;

        if (!usuario || !senha) {
            return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });
        }

        const user = await Usuario.findOne({ usuario: usuario.toLowerCase() });
        if (!user) {
            return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
        }

        // Verificar se usuário está bloqueado
        if (user.bloqueadoAte && user.bloqueadoAte > new Date()) {
            const minutosRestantes = Math.ceil((user.bloqueadoAte - new Date()) / 60000);
            return res.status(429).json({
                erro: `Conta bloqueada. Tente novamente em ${minutosRestantes} minutos.`
            });
        }

        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) {
            // Incrementar tentativas falhas
            user.tentativasLogin = (user.tentativasLogin || 0) + 1;

            // Bloquear após 5 tentativas
            if (user.tentativasLogin >= 5) {
                user.bloqueadoAte = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
                user.tentativasLogin = 0;
                await user.save();
                return res.status(429).json({
                    erro: 'Conta bloqueada por 15 minutos devido a muitas tentativas.'
                });
            }

            await user.save();
            return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
        }

        // Login bem-sucedido - resetar tentativas
        user.tentativasLogin = 0;
        user.bloqueadoAte = null;
        await user.save();

        const nivel = await Nivel.findById(user.nivelId);

        req.session.userId = user._id.toString();
        req.session.usuario = user.usuario;
        req.session.nome = user.nome;
        req.session.nivelId = user.nivelId;

        res.json({
            usuario: user.usuario,
            nome: user.nome,
            email: user.email,
            nivelId: user.nivelId,
            nivelNome: nivel ? nivel.nome : 'Desconhecido',
            permissoes: nivel ? nivel.permissoes : {}
        });
    } catch (erro) {
        console.error('Erro no login:', erro);
        res.status(500).json({ erro: 'Erro interno do servidor' });
    }
});

// Solicitar recuperação de senha
app.post('/api/esqueci-senha', resetLimiter, async (req, res) => {
    try {
        const email = sanitizar(req.body.email);

        if (!email || !validarEmail(email)) {
            return res.status(400).json({ erro: 'E-mail inválido' });
        }

        const user = await Usuario.findOne({ email: email.toLowerCase() });

        // Sempre retorna sucesso para não revelar se o e-mail existe
        if (!user) {
            return res.json({
                mensagem: 'Se o e-mail existir, você receberá as instruções de recuperação.'
            });
        }

        // Gerar token de recuperação
        const token = crypto.randomBytes(32).toString('hex');
        user.resetToken = token;
        user.resetTokenExpira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
        await user.save();

        // Enviar e-mail
        await enviarEmailRecuperacao(user.email, user.nome, token);

        res.json({
            mensagem: 'Se o e-mail existir, você receberá as instruções de recuperação.'
        });
    } catch (erro) {
        console.error('Erro na recuperação de senha:', erro);
        res.status(500).json({ erro: 'Erro ao processar solicitação' });
    }
});

// Redefinir senha
app.post('/api/redefinir-senha', async (req, res) => {
    try {
        const { token, novaSenha } = req.body;

        if (!token || !novaSenha) {
            return res.status(400).json({ erro: 'Token e nova senha são obrigatórios' });
        }

        if (!validarSenha(novaSenha)) {
            return res.status(400).json({ erro: 'A senha deve ter no mínimo 6 caracteres' });
        }

        const user = await Usuario.findOne({
            resetToken: token,
            resetTokenExpira: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ erro: 'Token inválido ou expirado' });
        }

        // Atualizar senha
        user.senha = await bcrypt.hash(novaSenha, 10);
        user.resetToken = null;
        user.resetTokenExpira = null;
        user.tentativasLogin = 0;
        user.bloqueadoAte = null;
        await user.save();

        res.json({ mensagem: 'Senha redefinida com sucesso!' });
    } catch (erro) {
        console.error('Erro ao redefinir senha:', erro);
        res.status(500).json({ erro: 'Erro ao redefinir senha' });
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
        const user = await Usuario.findById(req.session.userId);

        res.json({
            autenticado: true,
            usuario: req.session.usuario,
            nome: req.session.nome,
            email: user ? user.email : '',
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
        const nome = sanitizar(req.body.nome);
        if (!nome || nome.length < 2) {
            return res.status(400).json({ erro: 'Nome do nível é obrigatório (mín. 2 caracteres)' });
        }

        const novoNivel = await Nivel.create({
            nome: nome,
            descricao: sanitizar(req.body.descricao) || '',
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

        nivel.nome = sanitizar(req.body.nome) || nivel.nome;
        nivel.descricao = sanitizar(req.body.descricao) || nivel.descricao;
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
            const nivel = niveis.find(n => n._id.toString() === (u.nivelId || '').toString());
            return {
                _id: u._id,
                id: u._id,
                usuario: u.usuario,
                email: u.email,
                nome: u.nome,
                nivelId: u.nivelId,
                nivelNome: nivel ? nivel.nome : 'Desconhecido',
                bloqueado: u.bloqueadoAte && u.bloqueadoAte > new Date()
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
        const usuario = sanitizar(req.body.usuario);
        const email = sanitizar(req.body.email);
        const nome = sanitizar(req.body.nome);
        const senha = req.body.senha;

        // Validações
        if (!usuario || usuario.length < 3) {
            return res.status(400).json({ erro: 'Usuário deve ter no mínimo 3 caracteres' });
        }
        if (!email || !validarEmail(email)) {
            return res.status(400).json({ erro: 'E-mail inválido' });
        }
        if (!nome || nome.length < 2) {
            return res.status(400).json({ erro: 'Nome deve ter no mínimo 2 caracteres' });
        }
        if (!validarSenha(senha)) {
            return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });
        }

        const usuarioExiste = await Usuario.findOne({
            $or: [
                { usuario: usuario.toLowerCase() },
                { email: email.toLowerCase() }
            ]
        });
        if (usuarioExiste) {
            return res.status(400).json({ erro: 'Usuário ou e-mail já existe' });
        }

        const senhaHash = await bcrypt.hash(senha, 10);
        const novoUsuario = await Usuario.create({
            usuario: usuario.toLowerCase(),
            email: email.toLowerCase(),
            senha: senhaHash,
            nome: nome,
            nivelId: req.body.nivelId
        });

        const nivel = await Nivel.findById(novoUsuario.nivelId);

        res.status(201).json({
            _id: novoUsuario._id,
            id: novoUsuario._id,
            usuario: novoUsuario.usuario,
            email: novoUsuario.email,
            nome: novoUsuario.nome,
            nivelId: novoUsuario.nivelId,
            nivelNome: nivel ? nivel.nome : 'Desconhecido'
        });
    } catch (erro) {
        console.error('Erro ao criar usuário:', erro);
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

        // Atualizar senha se fornecida
        if (req.body.senha) {
            if (!validarSenha(req.body.senha)) {
                return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });
            }
            usuario.senha = await bcrypt.hash(req.body.senha, 10);
        }

        // Atualizar nome
        if (req.body.nome) {
            usuario.nome = sanitizar(req.body.nome);
        }

        // Atualizar e-mail
        if (req.body.email && req.body.email !== usuario.email) {
            const email = sanitizar(req.body.email);
            if (!validarEmail(email)) {
                return res.status(400).json({ erro: 'E-mail inválido' });
            }
            const emailExiste = await Usuario.findOne({ email: email.toLowerCase(), _id: { $ne: usuario._id } });
            if (emailExiste) {
                return res.status(400).json({ erro: 'E-mail já está em uso' });
            }
            usuario.email = email.toLowerCase();
        }

        // Atualizar nível
        if (req.body.nivelId) {
            usuario.nivelId = req.body.nivelId;
        }

        // Atualizar username
        if (req.body.usuario && req.body.usuario !== usuario.usuario) {
            const novoUsuario = sanitizar(req.body.usuario).toLowerCase();
            const usuarioExiste = await Usuario.findOne({ usuario: novoUsuario, _id: { $ne: usuario._id } });
            if (usuarioExiste) {
                return res.status(400).json({ erro: 'Usuário já existe' });
            }
            usuario.usuario = novoUsuario;
        }

        await usuario.save();

        const nivel = await Nivel.findById(usuario.nivelId);

        res.json({
            _id: usuario._id,
            id: usuario._id,
            usuario: usuario.usuario,
            email: usuario.email,
            nome: usuario.nome,
            nivelId: usuario.nivelId,
            nivelNome: nivel ? nivel.nome : 'Desconhecido'
        });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar usuário' });
    }
});

// Desbloquear usuário (admin pode desbloquear manualmente)
app.post('/api/usuarios/:id/desbloquear', requireAuth, requirePermission('gerenciar_acessos'), async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }

        usuario.bloqueadoAte = null;
        usuario.tentativasLogin = 0;
        await usuario.save();

        res.json({ mensagem: 'Usuário desbloqueado com sucesso' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao desbloquear usuário' });
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
        const nome = sanitizar(req.body.nome);
        if (!nome || nome.length < 2) {
            return res.status(400).json({ erro: 'Nome do produto é obrigatório (mín. 2 caracteres)' });
        }

        const novoProduto = await Produto.create({
            nome: nome,
            descricao: sanitizar(req.body.descricao) || '',
            codigoBarras: sanitizar(req.body.codigoBarras) || '',
            dataValidade: req.body.dataValidade || '',
            preco: parseFloat(req.body.preco) || 0,
            quantidade: parseInt(req.body.quantidade) || 0,
            estoqueMinimo: parseInt(req.body.estoqueMinimo) || 0
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

        if (req.body.nome) {
            produto.nome = sanitizar(req.body.nome);
        }
        produto.descricao = req.body.descricao !== undefined ? sanitizar(req.body.descricao) : produto.descricao;
        produto.codigoBarras = req.body.codigoBarras !== undefined ? sanitizar(req.body.codigoBarras) : produto.codigoBarras;
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

        if (!quantidade || quantidade < 1) {
            return res.status(400).json({ erro: 'Quantidade deve ser maior que zero' });
        }

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
            observacao: sanitizar(req.body.observacao) || '',
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
