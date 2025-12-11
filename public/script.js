const API_URL = '/api';

let permissoesUsuario = {};

// Verificar autenticação ao carregar a página
async function verificarSessao() {
    try {
        const response = await fetch(`${API_URL}/sessao`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (!data.autenticado) {
            window.location.href = '/login.html';
            return false;
        }

        document.getElementById('nomeUsuario').textContent = `Olá, ${data.nome}`;
        permissoesUsuario = data.permissoes || {};

        // Esconder menus baseado em permissões
        const menuAcessos = document.querySelector('.sidebar-link[data-section="acessos"]');
        if (!permissoesUsuario.gerenciar_acessos && menuAcessos) {
            menuAcessos.style.display = 'none';
        }

        const menuNiveis = document.querySelector('.sidebar-link[data-section="niveis"]');
        if (!permissoesUsuario.gerenciar_niveis && menuNiveis) {
            menuNiveis.style.display = 'none';
        }

        return true;
    } catch (error) {
        console.error('Erro ao verificar sessão:', error);
        window.location.href = '/login.html';
        return false;
    }
}

// Logout
document.getElementById('btnLogout').addEventListener('click', async () => {
    if (!confirm('Deseja realmente sair?')) {
        return;
    }

    try {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        window.location.href = '/login.html';
    }
});

// Toggle menu mobile
const menuToggle = document.getElementById('menuToggle');
if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('active');
    });
}

// Fechar menu ao clicar em um link (mobile)
document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            document.querySelector('.sidebar').classList.remove('active');
        }
    });
});

// Gerenciamento de Abas
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(tabName).classList.add('active');

        if (tabName === 'produtos') {
            carregarProdutos();
        } else if (tabName === 'movimentacoes') {
            carregarMovimentacoes();
            carregarProdutosSelect();
        }
    });
});

// PRODUTOS

// Função para mostrar alerta de estoque baixo
function mostrarAlertaEstoqueBaixo(produtos) {
    // Remover alertas anteriores
    const alertaAnterior = document.querySelector('.alerta-estoque-baixo');
    if (alertaAnterior) {
        alertaAnterior.remove();
    }

    if (produtos.length === 0) {
        return;
    }

    // Criar elemento de alerta
    const alerta = document.createElement('div');
    alerta.className = 'alerta-estoque-baixo';
    alerta.innerHTML = `
        <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin: 20px 30px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <span style="font-size: 1.5rem;">⚠️</span>
                <strong style="color: #856404; font-size: 1.1rem;">Atenção! Produtos com estoque baixo</strong>
            </div>
            <p style="color: #856404; margin: 0 0 10px 0;">Os seguintes produtos atingiram ou estão abaixo do estoque mínimo e precisam de reposição:</p>
            <ul style="color: #856404; margin: 0; padding-left: 20px;">
                ${produtos.map(p => `<li><strong>${p.nome}</strong> - Estoque atual: ${p.quantidade} | Estoque mínimo: ${p.estoqueMinimo || 0}</li>`).join('')}
            </ul>
        </div>
    `;

    // Inserir alerta no início da seção de produtos
    const produtosSection = document.getElementById('produtos');
    const formSection = produtosSection.querySelector('.form-section');
    formSection.parentNode.insertBefore(alerta, formSection);
}

// Carregar produtos na tabela
async function carregarProdutos() {
    try {
        const response = await fetch(`${API_URL}/produtos`, {
            credentials: 'include'
        });
        const produtos = await response.json();

        const tbody = document.querySelector('#tabelaProdutos tbody');
        tbody.innerHTML = '';

        if (produtos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum produto cadastrado</td></tr>';
            return;
        }

        // Verificar produtos com estoque baixo
        const produtosEstoqueBaixo = produtos.filter(p => p.quantidade <= (p.estoqueMinimo || 0));

        // Mostrar alerta se houver produtos com estoque baixo
        mostrarAlertaEstoqueBaixo(produtosEstoqueBaixo);

        produtos.forEach(produto => {
            const tr = document.createElement('tr');
            const estoqueMinimo = produto.estoqueMinimo || 0;
            const estoqueClass = produto.quantidade <= estoqueMinimo ? 'estoque-baixo' : 'estoque-ok';
            const avisoEstoque = produto.quantidade <= estoqueMinimo ? ' ⚠️' : '';
            const produtoId = produto._id || produto.id;

            // Formatar data de validade se existir
            let dataValidadeFormatada = '-';
            if (produto.dataValidade) {
                const data = new Date(produto.dataValidade + 'T00:00:00');
                dataValidadeFormatada = data.toLocaleDateString('pt-BR');
            }

            tr.innerHTML = `
                <td>${produto.nome}</td>
                <td>${produto.codigoBarras || '-'}</td>
                <td>${dataValidadeFormatada}</td>
                <td>${produto.descricao || '-'}</td>
                <td>R$ ${produto.preco.toFixed(2)}</td>
                <td class="${estoqueClass}">${produto.quantidade}${avisoEstoque}</td>
                <td>
                    <button class="btn btn-edit" onclick="editarProduto('${produtoId}')">Editar</button>
                    <button class="btn btn-danger" onclick="deletarProduto('${produtoId}')">Deletar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        alert('Erro ao carregar produtos!');
    }
}

// Formulário de produto
document.getElementById('formProduto').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('produtoId').value;
    const produto = {
        nome: document.getElementById('nome').value,
        descricao: document.getElementById('descricao').value,
        codigoBarras: document.getElementById('codigoBarras').value,
        dataValidade: document.getElementById('dataValidade').value,
        preco: parseFloat(document.getElementById('preco').value),
        quantidade: parseInt(document.getElementById('quantidadeInicial').value),
        estoqueMinimo: parseInt(document.getElementById('estoqueMinimo').value) || 0
    };

    try {
        let response;
        if (id) {
            response = await fetch(`${API_URL}/produtos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(produto)
            });
        } else {
            response = await fetch(`${API_URL}/produtos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(produto)
            });
        }

        if (response.ok) {
            alert(id ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!');
            limparFormularioProduto();
            carregarProdutos();
        } else {
            const erro = await response.json();
            alert(erro.erro || 'Erro ao salvar produto!');
        }
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        alert('Erro ao salvar produto!');
    }
});

// Editar produto
async function editarProduto(id) {
    try {
        const response = await fetch(`${API_URL}/produtos/${id}`, {
            credentials: 'include'
        });
        const produto = await response.json();

        document.getElementById('produtoId').value = produto._id || produto.id;
        document.getElementById('nome').value = produto.nome;
        document.getElementById('descricao').value = produto.descricao || '';
        document.getElementById('codigoBarras').value = produto.codigoBarras || '';
        document.getElementById('dataValidade').value = produto.dataValidade || '';
        document.getElementById('preco').value = produto.preco;
        document.getElementById('quantidadeInicial').value = produto.quantidade;
        document.getElementById('estoqueMinimo').value = produto.estoqueMinimo || 0;
        document.getElementById('quantidadeInicial').disabled = true;

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Erro ao carregar produto:', error);
        alert('Erro ao carregar produto!');
    }
}

// Deletar produto
async function deletarProduto(id) {
    if (!confirm('Tem certeza que deseja deletar este produto?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/produtos/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            alert('Produto deletado com sucesso!');
            carregarProdutos();
        } else {
            const erro = await response.json();
            alert(erro.erro || 'Erro ao deletar produto!');
        }
    } catch (error) {
        console.error('Erro ao deletar produto:', error);
        alert('Erro ao deletar produto!');
    }
}

// Limpar formulário
document.getElementById('btnCancelar').addEventListener('click', limparFormularioProduto);

function limparFormularioProduto() {
    document.getElementById('formProduto').reset();
    document.getElementById('produtoId').value = '';
    document.getElementById('quantidadeInicial').disabled = false;
}

// MOVIMENTAÇÕES

// Carregar produtos no select
async function carregarProdutosSelect() {
    try {
        const response = await fetch(`${API_URL}/produtos`, {
            credentials: 'include'
        });
        const produtos = await response.json();

        const select = document.getElementById('produtoSelect');
        select.innerHTML = '<option value="">Selecione um produto</option>';

        produtos.forEach(produto => {
            const option = document.createElement('option');
            option.value = produto._id || produto.id;
            option.textContent = `${produto.nome} (Estoque: ${produto.quantidade})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
    }
}

// Formulário de movimentação
document.getElementById('formMovimentacao').addEventListener('submit', async (e) => {
    e.preventDefault();

    const movimentacao = {
        produtoId: document.getElementById('produtoSelect').value,
        tipo: document.getElementById('tipoMovimentacao').value,
        quantidade: parseInt(document.getElementById('quantidadeMovimentacao').value),
        observacao: document.getElementById('observacao').value
    };

    try {
        const response = await fetch(`${API_URL}/movimentacoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(movimentacao)
        });

        if (response.ok) {
            alert('Movimentação registrada com sucesso!');
            document.getElementById('formMovimentacao').reset();
            carregarMovimentacoes();
            carregarProdutosSelect();
        } else {
            const erro = await response.json();
            alert(erro.erro || 'Erro ao registrar movimentação!');
        }
    } catch (error) {
        console.error('Erro ao registrar movimentação:', error);
        alert('Erro ao registrar movimentação!');
    }
});

// Variável para armazenar todas as movimentações
let todasMovimentacoes = [];

// Carregar movimentações na tabela
async function carregarMovimentacoes() {
    try {
        const response = await fetch(`${API_URL}/movimentacoes`, {
            credentials: 'include'
        });
        todasMovimentacoes = await response.json();

        exibirMovimentacoes(todasMovimentacoes);
    } catch (error) {
        console.error('Erro ao carregar movimentações:', error);
        alert('Erro ao carregar movimentações!');
    }
}

// Exibir movimentações filtradas
function exibirMovimentacoes(movimentacoes) {
    const tbody = document.querySelector('#tabelaMovimentacoes tbody');
    tbody.innerHTML = '';

    if (movimentacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhuma movimentação registrada</td></tr>';
        return;
    }

    // Ordenar por data decrescente
    const movimentacoesOrdenadas = [...movimentacoes].sort((a, b) => new Date(b.data) - new Date(a.data));

    movimentacoesOrdenadas.forEach(mov => {
        const tr = document.createElement('tr');
        const data = new Date(mov.data);
        const dataFormatada = data.toLocaleString('pt-BR');
        const tipoClass = mov.tipo === 'entrada' ? 'tipo-entrada' : 'tipo-saida';
        const tipoTexto = mov.tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA';

        tr.innerHTML = `
            <td>${dataFormatada}</td>
            <td>${mov.produtoNome}</td>
            <td class="${tipoClass}">${tipoTexto}</td>
            <td>${mov.quantidade}</td>
            <td>${mov.usuario || '-'}</td>
            <td>${mov.observacao || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Filtrar movimentações por período
function filtrarMovimentacoes() {
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;

    let movimentacoesFiltradas = todasMovimentacoes;

    if (dataInicio) {
        const inicio = new Date(dataInicio + 'T00:00:00');
        movimentacoesFiltradas = movimentacoesFiltradas.filter(mov => new Date(mov.data) >= inicio);
    }

    if (dataFim) {
        const fim = new Date(dataFim + 'T23:59:59');
        movimentacoesFiltradas = movimentacoesFiltradas.filter(mov => new Date(mov.data) <= fim);
    }

    exibirMovimentacoes(movimentacoesFiltradas);
}

// Limpar filtros
function limparFiltros() {
    document.getElementById('dataInicio').value = '';
    document.getElementById('dataFim').value = '';
    exibirMovimentacoes(todasMovimentacoes);
}

// NAVEGAÇÃO DO MENU LATERAL

document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;

        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));

        link.classList.add('active');
        document.getElementById(section).classList.add('active');

        if (section === 'estoque') {
            document.getElementById('pageTitle').textContent = 'Sistema de Controle de Estoque';
            carregarProdutos();
        } else if (section === 'acessos') {
            document.getElementById('pageTitle').textContent = 'Gerenciamento de Acessos';
            carregarUsuarios();
            carregarNiveisSelect();
        } else if (section === 'niveis') {
            document.getElementById('pageTitle').textContent = 'Gerenciamento de Níveis de Acesso';
            carregarNiveis();
        }
    });
});

// GERENCIAMENTO DE USUÁRIOS

// Carregar níveis de acesso no select
async function carregarNiveisSelect() {
    try {
        const response = await fetch(`${API_URL}/niveis`, {
            credentials: 'include'
        });

        if (!response.ok) {
            return;
        }

        const niveis = await response.json();
        const select = document.getElementById('nivelUsuarioSelect');
        select.innerHTML = '<option value="">Selecione um nível</option>';

        niveis.forEach(nivel => {
            const option = document.createElement('option');
            option.value = nivel._id || nivel.id;
            option.textContent = nivel.nome;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar níveis:', error);
    }
}

// Carregar usuários na tabela
async function carregarUsuarios() {
    try {
        const response = await fetch(`${API_URL}/usuarios`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Erro ao carregar usuários');
        }

        const usuarios = await response.json();
        const tbody = document.querySelector('#tabelaUsuarios tbody');
        tbody.innerHTML = '';

        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum usuário cadastrado</td></tr>';
            return;
        }

        usuarios.forEach(usuario => {
            const tr = document.createElement('tr');
            const usuarioId = usuario._id || usuario.id;

            tr.innerHTML = `
                <td>${usuario.nome}</td>
                <td>${usuario.usuario}</td>
                <td><span style="background: #667eea; color: white; padding: 4px 8px; border-radius: 3px; font-size: 0.85rem;">${usuario.nivelNome}</span></td>
                <td>
                    <button class="btn btn-edit" onclick="editarUsuario('${usuarioId}')">Editar</button>
                    <button class="btn btn-danger" onclick="deletarUsuario('${usuarioId}')">Deletar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        alert('Erro ao carregar usuários! Você precisa ter permissão.');
    }
}

// Formulário de usuário
document.getElementById('formUsuario').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('usuarioId').value;
    const usuario = {
        nome: document.getElementById('nomeCompleto').value,
        usuario: document.getElementById('loginUsuario').value,
        nivelId: document.getElementById('nivelUsuarioSelect').value,
        senha: document.getElementById('senhaUsuario').value
    };

    try {
        let response;
        if (id) {
            if (!usuario.senha) {
                delete usuario.senha;
            }
            response = await fetch(`${API_URL}/usuarios/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(usuario)
            });
        } else {
            response = await fetch(`${API_URL}/usuarios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(usuario)
            });
        }

        if (response.ok) {
            alert(id ? 'Usuário atualizado com sucesso!' : 'Usuário cadastrado com sucesso!');
            limparFormularioUsuario();
            carregarUsuarios();
        } else {
            const erro = await response.json();
            alert(erro.erro || 'Erro ao salvar usuário!');
        }
    } catch (error) {
        console.error('Erro ao salvar usuário:', error);
        alert('Erro ao salvar usuário!');
    }
});

// Editar usuário
async function editarUsuario(id) {
    try {
        const response = await fetch(`${API_URL}/usuarios`, {
            credentials: 'include'
        });
        const usuarios = await response.json();
        const usuario = usuarios.find(u => (u._id || u.id) === id);

        if (usuario) {
            document.getElementById('usuarioId').value = usuario._id || usuario.id;
            document.getElementById('nomeCompleto').value = usuario.nome;
            document.getElementById('loginUsuario').value = usuario.usuario;
            document.getElementById('nivelUsuarioSelect').value = usuario.nivelId;
            document.getElementById('senhaUsuario').value = '';
            document.getElementById('senhaUsuario').placeholder = 'Deixe em branco para manter a senha atual';
            document.getElementById('senhaUsuario').required = false;

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Erro ao carregar usuário:', error);
        alert('Erro ao carregar usuário!');
    }
}

// Deletar usuário
async function deletarUsuario(id) {
    if (!confirm('Tem certeza que deseja deletar este usuário?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/usuarios/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            alert('Usuário deletado com sucesso!');
            carregarUsuarios();
        } else {
            const erro = await response.json();
            alert(erro.erro || 'Erro ao deletar usuário!');
        }
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        alert('Erro ao deletar usuário!');
    }
}

// Limpar formulário de usuário
document.getElementById('btnCancelarUsuario').addEventListener('click', limparFormularioUsuario);

function limparFormularioUsuario() {
    document.getElementById('formUsuario').reset();
    document.getElementById('usuarioId').value = '';
    document.getElementById('senhaUsuario').placeholder = 'Digite a senha';
    document.getElementById('senhaUsuario').required = true;
}

// GERENCIAMENTO DE NÍVEIS DE ACESSO

// Carregar níveis de acesso na tabela
async function carregarNiveis() {
    try {
        const response = await fetch(`${API_URL}/niveis`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Erro ao carregar níveis');
        }

        const niveis = await response.json();
        const tbody = document.querySelector('#tabelaNiveis tbody');
        tbody.innerHTML = '';

        if (niveis.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum nível cadastrado</td></tr>';
            return;
        }

        niveis.forEach(nivel => {
            const tr = document.createElement('tr');
            const nivelId = nivel._id || nivel.id;

            // Ordem das permissões
            const ordemPermissoes = [
                'gerenciar_acessos',
                'gerenciar_niveis',
                'cadastrar_produtos',
                'editar_produtos',
                'deletar_produtos',
                'registrar_movimentacoes',
                'visualizar_historico'
            ];

            const nomes = {
                gerenciar_acessos: 'Gerenciar Acessos',
                gerenciar_niveis: 'Gerenciar Níveis',
                cadastrar_produtos: 'Cadastrar Produtos',
                editar_produtos: 'Editar Produtos',
                deletar_produtos: 'Deletar Produtos',
                registrar_movimentacoes: 'Registrar Movimentações',
                visualizar_historico: 'Visualizar Histórico'
            };

            const permissoesAtivas = ordemPermissoes
                .filter(key => nivel.permissoes && nivel.permissoes[key])
                .map(key => nomes[key]);

            const permissoesHTML = permissoesAtivas.length > 0
                ? permissoesAtivas.map(p => `<span style="display: inline-block; background: #e8f4f8; color: #0066cc; padding: 3px 8px; border-radius: 3px; margin: 2px; font-size: 0.8rem;">✓ ${p}</span>`).join('')
                : '<span style="color: #999;">Nenhuma permissão</span>';

            const acoesBtns = nivel.sistema ?
                '<span style="color: #999; font-size: 0.9rem;">Nível do Sistema</span>' :
                `<button class="btn btn-edit" onclick="editarNivel('${nivelId}')">Editar</button>
                 <button class="btn btn-danger" onclick="deletarNivel('${nivelId}')">Deletar</button>`;

            tr.innerHTML = `
                <td><strong>${nivel.nome}</strong></td>
                <td>${nivel.descricao || '-'}</td>
                <td style="line-height: 1.8;">${permissoesHTML}</td>
                <td>${acoesBtns}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar níveis:', error);
        alert('Erro ao carregar níveis! Você precisa ter permissão.');
    }
}

// Formulário de nível
document.getElementById('formNivel').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('nivelAcessoId').value;
    const nivel = {
        nome: document.getElementById('nomeNivel').value,
        descricao: document.getElementById('descricaoNivel').value,
        permissoes: {
            gerenciar_acessos: document.getElementById('perm_gerenciar_acessos').checked,
            gerenciar_niveis: document.getElementById('perm_gerenciar_niveis').checked,
            cadastrar_produtos: document.getElementById('perm_cadastrar_produtos').checked,
            editar_produtos: document.getElementById('perm_editar_produtos').checked,
            deletar_produtos: document.getElementById('perm_deletar_produtos').checked,
            registrar_movimentacoes: document.getElementById('perm_registrar_movimentacoes').checked,
            visualizar_historico: document.getElementById('perm_visualizar_historico').checked
        }
    };

    try {
        let response;
        if (id) {
            response = await fetch(`${API_URL}/niveis/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(nivel)
            });
        } else {
            response = await fetch(`${API_URL}/niveis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(nivel)
            });
        }

        if (response.ok) {
            alert(id ? 'Nível atualizado com sucesso!' : 'Nível cadastrado com sucesso!');
            limparFormularioNivel();
            carregarNiveis();
        } else {
            const erro = await response.json();
            alert(erro.erro || 'Erro ao salvar nível!');
        }
    } catch (error) {
        console.error('Erro ao salvar nível:', error);
        alert('Erro ao salvar nível!');
    }
});

// Editar nível
async function editarNivel(id) {
    try {
        const response = await fetch(`${API_URL}/niveis`, {
            credentials: 'include'
        });
        const niveis = await response.json();
        const nivel = niveis.find(n => (n._id || n.id) === id);

        if (nivel) {
            if (nivel.sistema) {
                alert('Não é possível editar níveis do sistema');
                return;
            }

            document.getElementById('nivelAcessoId').value = nivel._id || nivel.id;
            document.getElementById('nomeNivel').value = nivel.nome;
            document.getElementById('descricaoNivel').value = nivel.descricao || '';
            document.getElementById('perm_gerenciar_acessos').checked = nivel.permissoes?.gerenciar_acessos || false;
            document.getElementById('perm_gerenciar_niveis').checked = nivel.permissoes?.gerenciar_niveis || false;
            document.getElementById('perm_cadastrar_produtos').checked = nivel.permissoes?.cadastrar_produtos || false;
            document.getElementById('perm_editar_produtos').checked = nivel.permissoes?.editar_produtos || false;
            document.getElementById('perm_deletar_produtos').checked = nivel.permissoes?.deletar_produtos || false;
            document.getElementById('perm_registrar_movimentacoes').checked = nivel.permissoes?.registrar_movimentacoes || false;
            document.getElementById('perm_visualizar_historico').checked = nivel.permissoes?.visualizar_historico || false;

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Erro ao carregar nível:', error);
        alert('Erro ao carregar nível!');
    }
}

// Deletar nível
async function deletarNivel(id) {
    if (!confirm('Tem certeza que deseja deletar este nível de acesso?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/niveis/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            alert('Nível deletado com sucesso!');
            carregarNiveis();
        } else {
            const erro = await response.json();
            alert(erro.erro || 'Erro ao deletar nível!');
        }
    } catch (error) {
        console.error('Erro ao deletar nível:', error);
        alert('Erro ao deletar nível!');
    }
}

// Limpar formulário de nível
document.getElementById('btnCancelarNivel').addEventListener('click', limparFormularioNivel);

function limparFormularioNivel() {
    document.getElementById('formNivel').reset();
    document.getElementById('nivelAcessoId').value = '';
}

// Inicializar aplicação
async function inicializar() {
    const autenticado = await verificarSessao();
    if (autenticado) {
        carregarProdutos();
    }
}

inicializar();
