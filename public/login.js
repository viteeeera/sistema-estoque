const API_URL = 'http://localhost:3000/api';

document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuario = document.getElementById('usuario').value;
    const senha = document.getElementById('senha').value;
    const mensagemErro = document.getElementById('mensagemErro');
    const btnSubmit = e.target.querySelector('button[type="submit"]');

    mensagemErro.classList.remove('mostrar');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Entrando...';

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ usuario, senha })
        });

        const data = await response.json();

        if (response.ok) {
            window.location.href = '/index.html';
        } else {
            mensagemErro.textContent = data.erro || 'Erro ao fazer login';
            mensagemErro.classList.add('mostrar');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Entrar';
        }
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        mensagemErro.textContent = 'Erro ao conectar com o servidor';
        mensagemErro.classList.add('mostrar');
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Entrar';
    }
});
