/* ============ Sofipe — comportamento ============ */

/* ---------------- fundo de polígonos escuros ---------------- */
(function fundoPoligonal(){
  const svg = document.getElementById('fundo');
  if (!svg) return;

  const L = 1600, A = 900;              // grade lógica
  const cols = 9, rows = 6;
  const passoX = L / cols, passoY = A / rows;
  const jitter = 0.42;                  // quanto os pontos podem se deslocar
  const ns = 'http://www.w3.org/2000/svg';

  svg.setAttribute('viewBox', `0 0 ${L} ${A}`);

  // pontos com deslocamento aleatório (bordas ficam fixas)
  const pts = [];
  for (let y = 0; y <= rows; y++){
    pts[y] = [];
    for (let x = 0; x <= cols; x++){
      const borda = x === 0 || y === 0 || x === cols || y === rows;
      const dx = borda ? 0 : (Math.random() - .5) * passoX * jitter * 2;
      const dy = borda ? 0 : (Math.random() - .5) * passoY * jitter * 2;
      pts[y][x] = [x * passoX + dx, y * passoY + dy];
    }
  }

  const frag = document.createDocumentFragment();

  function triangulo(a, b, c){
    // luz vinda do canto superior esquerdo
    const cx = (a[0] + b[0] + c[0]) / 3 / L;
    const cy = (a[1] + b[1] + c[1]) / 3 / A;
    const luz = 1 - (cx * .45 + cy * .55);
    const tom = Math.round(10 + luz * 34 + (Math.random() - .5) * 16);
    const v = Math.max(5, Math.min(58, tom));

    const p = document.createElementNS(ns, 'polygon');
    p.setAttribute('points', `${a} ${b} ${c}`);
    p.setAttribute('fill', `rgb(${v},${v},${v})`);
    p.setAttribute('stroke', 'rgba(0,0,0,.35)');
    p.setAttribute('stroke-width', '1');
    frag.appendChild(p);
  }

  for (let y = 0; y < rows; y++){
    for (let x = 0; x < cols; x++){
      const p00 = pts[y][x], p10 = pts[y][x+1];
      const p01 = pts[y+1][x], p11 = pts[y+1][x+1];
      if ((x + y) % 2 === 0){
        triangulo(p00, p10, p11);
        triangulo(p00, p11, p01);
      } else {
        triangulo(p00, p10, p01);
        triangulo(p10, p11, p01);
      }
    }
  }

  svg.appendChild(frag);
})();

/* ---------------- contas (armazenamento local de demonstração) ---------------- */
const ContasSofipe = (function(){
  const CHAVE = 'sofipe_contas';

  function listar(){
    try { return JSON.parse(localStorage.getItem(CHAVE)) || []; }
    catch { return []; }
  }
  function salvar(contas){
    localStorage.setItem(CHAVE, JSON.stringify(contas));
  }
  function existe(login){
    return listar().some(c => c.login.toLowerCase() === login.trim().toLowerCase());
  }
  function criar(conta){
    const contas = listar();
    contas.push(conta);
    salvar(contas);
  }
  function validar(login, senha){
    return listar().some(c =>
      c.login.toLowerCase() === login.trim().toLowerCase() && c.senha === senha
    );
  }
  function buscar(login){
    return listar().find(c => c.login.toLowerCase() === login.trim().toLowerCase()) || null;
  }
  return { existe, criar, validar, buscar };
})();

/* ---------------- mostrar / ocultar senha ---------------- */
(function verSenha(){
  const botao = document.getElementById('alternar');
  const campo = document.getElementById('senha');
  if (!botao || !campo) return;

  botao.addEventListener('click', () => {
    const visivel = campo.type === 'text';
    campo.type = visivel ? 'password' : 'text';
    botao.setAttribute('aria-pressed', String(!visivel));
    botao.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
    campo.focus();
  });
})();

/* ---------------- entrar ---------------- */
(function acesso(){
  const login = document.getElementById('login');
  const senha = document.getElementById('senha');
  const erroLogin = document.getElementById('erro-login');
  const erroSenha = document.getElementById('erro-senha');
  const botao = document.getElementById('entrar');
  const aviso = document.getElementById('aviso');
  if (!login || !senha || !botao) return;

  [login, senha].forEach(campo => {
    campo.addEventListener('input', () => {
      (campo === login ? erroLogin : erroSenha).textContent = '';
      aviso.textContent = '';
    });
    campo.addEventListener('keydown', e => {
      if (e.key === 'Enter') botao.click();
    });
  });

  function validar(){
    let ok = true;
    erroLogin.textContent = '';
    erroSenha.textContent = '';

    if (!login.value.trim()){
      erroLogin.textContent = 'Informe seu e-mail.';
      ok = false;
    }
    if (senha.value.length < 6){
      erroSenha.textContent = 'A senha tem no mínimo 6 caracteres.';
      ok = false;
    }
    if (!ok) (erroLogin.textContent ? login : senha).focus();
    return ok;
  }

  botao.addEventListener('click', () => {
    if (!validar()) return;

    botao.dataset.carregando = 'true';
    botao.textContent = 'Entrando…';
    aviso.textContent = '';

    // ▼ ponto de integração: troque pelo fetch da sua API de autenticação
    setTimeout(() => {
      botao.dataset.carregando = 'false';
      botao.textContent = 'Entrar';

      if (ContasSofipe.validar(login.value, senha.value)){
        const conta = ContasSofipe.buscar(login.value);
        const nomeUsuario = document.getElementById('usuario-logado');
        const botaoSair = document.getElementById('sair');
        const cardAcesso = document.getElementById('acesso');
        if (nomeUsuario && conta){
          nomeUsuario.textContent = conta.nome;
          nomeUsuario.hidden = false;
        }
        if (botaoSair) botaoSair.hidden = false;
        if (cardAcesso) cardAcesso.hidden = true;
        if (window.SofipeFecharPainel) window.SofipeFecharPainel();
        login.value = '';
        senha.value = '';
        aviso.textContent = 'Login efetuado! Bem-vindo(a) de volta.';
      } else {
        erroSenha.textContent = 'E-mail ou senha incorretos.';
        senha.focus();
      }
    }, 900);
  });

  const botaoSair = document.getElementById('sair');
  const nomeUsuario = document.getElementById('usuario-logado');
  const cardAcesso = document.getElementById('acesso');
  if (botaoSair && nomeUsuario){
    botaoSair.addEventListener('click', () => {
      nomeUsuario.textContent = '';
      nomeUsuario.hidden = true;
      botaoSair.hidden = true;
      if (cardAcesso) cardAcesso.hidden = false;
      aviso.textContent = 'Você saiu da sua conta.';
    });
  }
})();

/* ---------------- seções ---------------- */
(function secoes(){
  const textos = {
    quem: {
      titulo: 'Quem somos',
      corpo: [
        'A Sofipe é uma corretora dedicada a planos de saúde. Comparamos operadoras, redes credenciadas e carências para que a escolha seja feita com informação, não com pressa.',
        'Atendemos pessoas físicas, famílias e empresas, do primeiro orçamento à renovação anual.'
      ]
    },
    seguros: {
      titulo: 'Seguros',
      tipo: 'cotacoes',
      cartoes: [
        { titulo: 'Seguro Saúde', texto: 'Encontre o plano ideal para você e sua família, com a melhor rede credenciada.' },
        { titulo: 'Seguro de Vida', texto: 'Proteja quem você ama com uma cobertura sob medida para o seu momento de vida.' },
        { titulo: 'Responsabilidade Civil', texto: 'Cobertura para danos causados a terceiros, com tranquilidade no seu dia a dia.' },
        { titulo: 'Seguro Residencial', texto: 'Proteção completa para o seu imóvel contra incêndio, roubo e outros imprevistos.' }
      ]
    },
    contato: {
      titulo: 'Entre em contato',
      corpo: [
        'Telefone e WhatsApp: (11) 4000-0000 · atendimento de segunda a sexta, das 9h às 18h.',
        'E-mail: contato@sofipe.com.br — retornamos no mesmo dia útil.'
      ]
    },
    cadastro: {
      titulo: 'Cadastre-se',
      tipo: 'cadastro'
    }
  };

  const painel = document.getElementById('painel');
  const titulo = document.getElementById('painel-titulo');
  const texto = document.getElementById('painel-texto');
  if (!painel) return;

  let atual = null;

  function fecharPainel(){
    painel.setAttribute('aria-hidden', 'true');
    atual = null;
  }
  window.SofipeFecharPainel = fecharPainel;

  function montarConteudo(dado){
    texto.innerHTML = '';

    if (dado.tipo === 'cadastro'){
      montarFormularioCadastro();
    } else if (dado.tipo === 'cotacoes'){
      const grade = document.createElement('div');
      grade.className = 'grade-cotacoes';

      dado.cartoes.forEach(c => {
        const cartao = document.createElement('div');
        cartao.className = 'cartao-cotacao';

        const h3 = document.createElement('h3');
        h3.textContent = c.titulo;

        const p = document.createElement('p');
        p.textContent = c.texto;

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'obter';
        botao.textContent = 'Obter';
        botao.dataset.secao = 'cadastro';

        cartao.append(h3, p, botao);
        grade.appendChild(cartao);
      });

      texto.appendChild(grade);
    } else {
      dado.corpo.forEach(p => {
        const el = document.createElement('p');
        el.textContent = p;
        texto.appendChild(el);
      });
    }
  }

  function montarFormularioCadastro(){
    const intro = document.createElement('p');
    intro.className = 'cadastro-intro';
    intro.textContent = 'Crie seu login e senha para acessar a área do cliente.';
    texto.appendChild(intro);

    const form = document.createElement('form');
    form.className = 'form-cadastro';
    form.noValidate = true;

    const campos = [
      { id: 'cad-nome', label: 'Nome completo', tipo: 'text', autocomplete: 'name' },
      { id: 'cad-login', label: 'E-mail', tipo: 'text', autocomplete: 'username' },
      { id: 'cad-senha', label: 'Senha', tipo: 'password', autocomplete: 'new-password' },
      { id: 'cad-confirmar', label: 'Confirmar senha', tipo: 'password', autocomplete: 'new-password' }
    ];

    campos.forEach(c => {
      const wrap = document.createElement('div');
      wrap.className = 'campo-cadastro';

      const label = document.createElement('label');
      label.className = 'oculto';
      label.setAttribute('for', c.id);
      label.textContent = c.label;

      const input = document.createElement('input');
      input.id = c.id;
      input.type = c.tipo;
      input.placeholder = c.label;
      input.autocomplete = c.autocomplete;
      input.setAttribute('aria-describedby', c.id + '-erro');

      const erro = document.createElement('span');
      erro.className = 'erro-cadastro';
      erro.id = c.id + '-erro';
      erro.setAttribute('role', 'status');

      input.addEventListener('input', () => { erro.textContent = ''; avisoCadastro.textContent = ''; });

      wrap.append(label, input, erro);
      form.appendChild(wrap);
    });

    const botaoEnviar = document.createElement('button');
    botaoEnviar.type = 'submit';
    botaoEnviar.className = 'enviar-cadastro';
    botaoEnviar.textContent = 'Criar conta';

    const avisoCadastro = document.createElement('p');
    avisoCadastro.className = 'aviso-cadastro';
    avisoCadastro.setAttribute('role', 'status');

    form.append(botaoEnviar, avisoCadastro);
    texto.appendChild(form);

    const nome = form.querySelector('#cad-nome');
    const loginNovo = form.querySelector('#cad-login');
    const senhaNova = form.querySelector('#cad-senha');
    const confirmar = form.querySelector('#cad-confirmar');
    const erroNome = form.querySelector('#cad-nome-erro');
    const erroLoginNovo = form.querySelector('#cad-login-erro');
    const erroSenhaNova = form.querySelector('#cad-senha-erro');
    const erroConfirmar = form.querySelector('#cad-confirmar-erro');

    function validarCadastro(){
      let ok = true;
      erroNome.textContent = '';
      erroLoginNovo.textContent = '';
      erroSenhaNova.textContent = '';
      erroConfirmar.textContent = '';

      if (!nome.value.trim()){
        erroNome.textContent = 'Informe seu nome.';
        ok = false;
      }

      if (!loginNovo.value.trim()){
        erroLoginNovo.textContent = 'Informe seu e-mail.';
        ok = false;
      } else if (ContasSofipe.existe(loginNovo.value)){
        erroLoginNovo.textContent = 'Esse e-mail já está em uso.';
        ok = false;
      }

      if (senhaNova.value.length < 6){
        erroSenhaNova.textContent = 'A senha tem no mínimo 6 caracteres.';
        ok = false;
      }

      if (confirmar.value !== senhaNova.value || !confirmar.value){
        erroConfirmar.textContent = 'As senhas não coincidem.';
        ok = false;
      }

      if (erroNome.textContent) nome.focus();
      else if (erroLoginNovo.textContent) loginNovo.focus();
      else if (erroSenhaNova.textContent) senhaNova.focus();
      else if (erroConfirmar.textContent) confirmar.focus();

      return ok;
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!validarCadastro()) return;

      botaoEnviar.disabled = true;
      botaoEnviar.textContent = 'Criando…';
      avisoCadastro.textContent = '';

      // ▼ ponto de integração: troque pelo fetch da sua API de cadastro/autenticação
      setTimeout(() => {
        ContasSofipe.criar({
          nome: nome.value.trim(),
          login: loginNovo.value.trim(),
          senha: senhaNova.value
        });

        // pré-preenche o card de login com as credenciais recém-criadas
        const loginCampo = document.getElementById('login');
        const senhaCampo = document.getElementById('senha');
        if (loginCampo) loginCampo.value = loginNovo.value.trim();
        if (senhaCampo) senhaCampo.value = senhaNova.value;

        form.reset();
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = 'Criar conta';
        avisoCadastro.textContent = 'Conta criada! Seu login já está preenchido.';
      }, 900);
    });
  }

  // delegação: cobre tanto os links do menu quanto os botões "Obter"
  // criados dinamicamente dentro do painel
  document.addEventListener('click', e => {
    const logo = e.target.closest('.marca, .rodape-marca');
    if (logo){                          // logo: fecha o painel e segue para o topo
      fecharPainel();
      return;
    }

    const link = e.target.closest('[data-secao]');
    if (!link) return;
    e.preventDefault();

    const chave = link.dataset.secao;

    if (atual === chave){               // clicar de novo fecha
      fecharPainel();
      return;
    }

    const dado = textos[chave];
    if (!dado) return;

    titulo.textContent = dado.titulo;
    painel.classList.toggle('painel-seguros', dado.tipo === 'cotacoes');
    montarConteudo(dado);

    painel.setAttribute('aria-hidden', 'false');
    painel.focus();
    atual = chave;
  });
})();