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

/* ---------------- integração direta com o Supabase ---------------- */
const SofipeSupabase = (function(){
  // ▼ URL do projeto e a chave pública "anon" (Project Settings → API).
  // Essa chave é feita para ficar no navegador; quem protege os dados são as
  // políticas de RLS e as funções "security definer" descritas no arquivo
  // supabase-public-rpc.sql que acompanha este site.
  const SUPABASE_URL = 'https://oksvrekneucijxxlyald.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rc3ZyZWtuZXVjaWp4eGx5YWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NTQwNjEsImV4cCI6MjEwMzUzMDA2MX0.G74xLpOBUTE6au5xT7SIF_WmMMZ8JPV38mqaKa6XSX0';

  const cliente = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  function checarCliente(){
    if (!cliente) throw new Error('SDK do Supabase não carregou.');
    return cliente;
  }

  function gerarUuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ---- captação de leads (site público, sem login) ----
  // chama a função "criar_lead_publico" (security definer) em vez de dar
  // insert direto na tabela "leads" — isso não exige nenhuma policy nova de
  // RLS para o "anon", e o site nunca ganha acesso de leitura à tabela.
  async function criarLead({ nome, empresa, cargo, email, telefone, cpf_cnpj, interesse_principal, dados_extras }){
    const { data, error } = await checarCliente().rpc('criar_lead_publico', {
      p_nome: nome,
      p_empresa: empresa || null,
      p_cargo: cargo || null,
      p_email: email || null,
      p_telefone: telefone || null,
      p_cpf_cnpj: cpf_cnpj || null,
      p_interesse_principal: interesse_principal || null,
      p_dados_extras: dados_extras || {}
    });
    if (error) throw error;
    return data; // uuid do lead criado
  }

  // cria (uma única vez por sessão do navegador) o lead que representa a
  // conversa com a Sofia, para poder anexar as mensagens a ele
  async function obterOuCriarLeadChat(){
    const chave = 'sofipe_lead_chat_id';
    let leadId = sessionStorage.getItem(chave);
    if (leadId) return leadId;
    try {
      leadId = await criarLead({ nome: 'Visitante do chat (Sofia)', dados_extras: { origem: 'chat_site' } });
      if (leadId) sessionStorage.setItem(chave, leadId);
    } catch (erro) {
      console.warn('Não foi possível iniciar o registro do chat:', erro.message);
      leadId = null;
    }
    return leadId;
  }

  // grava cada mensagem do chat via a função "registrar_interacao_publica"
  // (também security definer, e só aceita remetente 'lead' ou 'agente_ia')
  async function registrarInteracao({ lead_id, mensagem, remetente, sessao_id }){
    if (!cliente || !lead_id) return;
    const { error } = await cliente.rpc('registrar_interacao_publica', {
      p_lead_id: lead_id,
      p_mensagem: mensagem,
      p_remetente: remetente,
      p_sessao_id: sessao_id || null
    });
    if (error) console.warn('Não foi possível registrar a interação:', error.message);
  }

  // ---- login da equipe (Supabase Auth + tabela "profiles") ----
  // contas de admin/gestor/vendedor são criadas pela própria equipe (não
  // existe cadastro público de conta); aqui só autenticamos.
  async function buscarPerfil(usuarioId){
    const { data } = await checarCliente().from('profiles').select('nome, perfil, ativo').eq('id', usuarioId).maybeSingle();
    return data || null;
  }

  async function entrar({ email, senha }){
    const sb = checarCliente();
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;

    const perfil = data.user ? await buscarPerfil(data.user.id) : null;
    if (perfil && perfil.ativo === false){
      await sb.auth.signOut();
      throw new Error('conta inativa');
    }
    return { usuario: data.user, perfil };
  }

  async function sair(){
    if (cliente) await cliente.auth.signOut();
  }

  async function sessaoAtual(){
    if (!cliente) return { usuario: null, perfil: null };
    const { data } = await cliente.auth.getSession();
    const usuario = data.session ? data.session.user : null;
    const perfil = usuario ? await buscarPerfil(usuario.id) : null;
    return { usuario, perfil };
  }

  function obterSessaoId(){
    let id = sessionStorage.getItem('sofipe_sessao_sofia');
    if (!id){
      id = gerarUuid();
      sessionStorage.setItem('sofipe_sessao_sofia', id);
    }
    return id;
  }

  return { criarLead, obterOuCriarLeadChat, registrarInteracao, entrar, sair, sessaoAtual, obterSessaoId };
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
  const nomeUsuario = document.getElementById('usuario-logado');
  const botaoSair = document.getElementById('sair');
  const cardAcesso = document.getElementById('acesso');
  if (!login || !senha || !botao) return;

  function mostrarLogado(nome){
    if (nomeUsuario){ nomeUsuario.textContent = nome || ''; nomeUsuario.hidden = false; }
    if (botaoSair) botaoSair.hidden = false;
    if (cardAcesso) cardAcesso.hidden = true;
  }
  function mostrarDeslogado(){
    if (nomeUsuario){ nomeUsuario.textContent = ''; nomeUsuario.hidden = true; }
    if (botaoSair) botaoSair.hidden = true;
    if (cardAcesso) cardAcesso.hidden = false;
  }

  // restaura a sessão, caso o visitante já esteja logado (ex.: ao recarregar a página)
  SofipeSupabase.sessaoAtual()
    .then(({ usuario, perfil }) => { if (usuario) mostrarLogado((perfil && perfil.nome) || usuario.email); })
    .catch(() => {});

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

  botao.addEventListener('click', async () => {
    if (!validar()) return;

    botao.dataset.carregando = 'true';
    botao.textContent = 'Entrando…';
    aviso.textContent = '';

    try {
      const { usuario, perfil } = await SofipeSupabase.entrar({ email: login.value, senha: senha.value });
      mostrarLogado((perfil && perfil.nome) || usuario.email);
      if (window.SofipeFecharPainel) window.SofipeFecharPainel();
      login.value = '';
      senha.value = '';
      aviso.textContent = 'Login efetuado! Bem-vindo(a) de volta.';
    } catch (erro) {
      erroSenha.textContent = (erro && erro.message === 'conta inativa')
        ? 'Sua conta está inativa. Fale com o administrador.'
        : 'E-mail ou senha incorretos.';
      senha.focus();
    } finally {
      botao.dataset.carregando = 'false';
      botao.textContent = 'Entrar';
    }
  });

  if (botaoSair){
    botaoSair.addEventListener('click', async () => {
      await SofipeSupabase.sair();
      mostrarDeslogado();
      aviso.textContent = 'Você saiu da sua conta.';
    });
  }
})();

/* ---------------- seções ---------------- */
(function secoes(){
  const textos = {
    quem: {
      titulo: 'Quem somos',
      tipo: 'quem',
      subtitulo: 'Protegemos o que importa para você, com confiança, personalização, atendimento próximo e experiência comprovada.',
      cartoes: [
        { icone: 'cracha', titulo: 'Especialistas regulamentados e confiáveis', texto: 'Credenciados pela SUSEP, garantindo ética, segurança e transparência em cada etapa.' },
        { icone: 'aperto', titulo: 'Coberturas personalizadas para cada necessidade', texto: 'Comparamos operadoras e planos sob medida para proteger o que mais importa para você.' },
        { icone: 'chat', titulo: 'Atendimento próximo e humanizado', texto: 'Suporte ágil, empático e sempre disponível, do primeiro orçamento à renovação anual.' },
        { icone: 'joia', titulo: 'Experiência e resultados comprovados', texto: 'Histórico sólido de proteção e satisfação de pessoas físicas, famílias e empresas.' }
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
        'Telefone: (11) 3740-2037 · WhatsApp: (11) 97089-1940.',
        'E-mail: contato@sofipe.com.br — retornamos no mesmo dia útil.',
        'Endereço: Rua Isabel Dias, 62 - Sala 03 - Mooca - São Paulo.'
      ]
    },
    cadastro: {
      titulo: 'Cadastre-se',
      tipo: 'cadastro'
    }
  };

  const iconesQuem = {
    cracha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="15" rx="2.5"/><circle cx="9" cy="10.5" r="2"/><path d="M6 16c.6-1.6 2-2.5 3-2.5s2.4.9 3 2.5"/><path d="M15 9h4M15 12.5h4"/></svg>',
    aperto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11l4-3 3 2 3-2.5 3 2.5 3-2 4 3"/><path d="M4 11v3.5a1.6 1.6 0 0 0 2.6 1.2l1-.9"/><path d="M20 11v3.5a1.6 1.6 0 0 1-2.6 1.2l-3-2.7-2.3 2a1.7 1.7 0 0 1-2.3-2.5l3.1-3"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v10.5H9l-4 3.5v-3.5H4z"/><circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="12.5" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r=".9" fill="currentColor" stroke="none"/></svg>',
    joia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9z"/><path d="M7 11l3.2-6.3a1.6 1.6 0 0 1 2.9.3l.6 2.1H17a2 2 0 0 1 1.9 2.7l-2 5.6A2 2 0 0 1 15 17h-6"/></svg>'
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
    } else if (dado.tipo === 'quem'){
      const intro = document.createElement('p');
      intro.className = 'quem-intro';
      intro.textContent = dado.subtitulo;
      texto.appendChild(intro);

      const corpo = document.createElement('div');
      corpo.className = 'quem-corpo';

      const visual = document.createElement('div');
      visual.className = 'quem-visual';
      visual.setAttribute('aria-hidden', 'true');
      const img = document.createElement('img');
      img.className = 'quem-visual-logo';
      img.src = 'Foto-quem-somos.png';
      img.alt = '';
      visual.appendChild(img);

      const grade = document.createElement('div');
      grade.className = 'quem-grid';

      dado.cartoes.forEach(c => {
        const cartao = document.createElement('div');
        cartao.className = 'quem-card';
        cartao.innerHTML = `<span class="quem-icone">${iconesQuem[c.icone] || ''}</span>`;

        const h3 = document.createElement('h3');
        h3.textContent = c.titulo;

        const p = document.createElement('p');
        p.textContent = c.texto;

        cartao.append(h3, p);
        grade.appendChild(cartao);
      });

      corpo.append(visual, grade);
      texto.append(corpo);
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
    intro.textContent = 'Preencha seus dados e entraremos em contato com a melhor opção para você.';
    texto.appendChild(intro);

    const form = document.createElement('form');
    form.className = 'form-cadastro';
    form.noValidate = true;

    const campos = [
      { id: 'cad-nome', label: 'Nome', tipo: 'text', autocomplete: 'name' },
      { id: 'cad-empresa', label: 'Empresa', tipo: 'text', autocomplete: 'organization' },
      { id: 'cad-cargo', label: 'Cargo', tipo: 'text', autocomplete: 'organization-title' },
      { id: 'cad-email', label: 'E-mail', tipo: 'email', autocomplete: 'email' },
      { id: 'cad-telefone', label: 'WhatsApp', tipo: 'tel', autocomplete: 'tel' },
      { id: 'cad-cpf-cnpj', label: 'CPF ou CNPJ', tipo: 'text', autocomplete: 'off' },
      { id: 'cad-cnpj-mei', label: 'Possui CNPJ ou MEI?', tipo: 'select', autocomplete: 'off',
        opcoes: ['Sim, tenho CNPJ ou MEI', 'Não tenho CNPJ ou MEI'] },
      { id: 'cad-interesse', label: 'Interesse principal', tipo: 'text', autocomplete: 'off' },
      { id: 'cad-lgpd', label: 'Li e aceito a Política de Privacidade e o tratamento dos meus dados conforme a LGPD.', tipo: 'checkbox' }
    ];

    campos.forEach(c => {
      if (c.tipo === 'checkbox'){
        const wrapLgpd = document.createElement('div');
        wrapLgpd.className = 'campo-cadastro';

        const labelLgpd = document.createElement('label');
        labelLgpd.className = 'campo-lgpd';

        const inputLgpd = document.createElement('input');
        inputLgpd.type = 'checkbox';
        inputLgpd.id = c.id;
        inputLgpd.setAttribute('aria-describedby', c.id + '-erro');

        const textoLgpd = document.createElement('span');
        textoLgpd.textContent = c.label;

        const erroLgpd = document.createElement('span');
        erroLgpd.className = 'erro-cadastro';
        erroLgpd.id = c.id + '-erro';
        erroLgpd.setAttribute('role', 'status');

        inputLgpd.addEventListener('change', () => { erroLgpd.textContent = ''; avisoCadastro.textContent = ''; });

        labelLgpd.append(inputLgpd, textoLgpd);
        wrapLgpd.append(labelLgpd, erroLgpd);
        form.appendChild(wrapLgpd);
        return;
      }

      const wrap = document.createElement('div');
      wrap.className = 'campo-cadastro';

      const label = document.createElement('label');
      label.className = 'oculto';
      label.setAttribute('for', c.id);
      label.textContent = c.label;

      let input;
      if (c.tipo === 'select'){
        input = document.createElement('select');
        input.id = c.id;
        input.setAttribute('aria-describedby', c.id + '-erro');

        const opcaoVazia = document.createElement('option');
        opcaoVazia.value = '';
        opcaoVazia.textContent = c.label;
        opcaoVazia.disabled = true;
        opcaoVazia.selected = true;
        input.appendChild(opcaoVazia);

        c.opcoes.forEach(texto => {
          const opcao = document.createElement('option');
          opcao.value = texto;
          opcao.textContent = texto;
          input.appendChild(opcao);
        });
      } else {
        input = document.createElement('input');
        input.id = c.id;
        input.type = c.tipo;
        input.placeholder = c.label;
        input.autocomplete = c.autocomplete;
        input.setAttribute('aria-describedby', c.id + '-erro');
        if (c.tipo === 'password') input.maxLength = 10;
      }

      const erro = document.createElement('span');
      erro.className = 'erro-cadastro';
      erro.id = c.id + '-erro';
      erro.setAttribute('role', 'status');

      const evento = c.tipo === 'select' ? 'change' : 'input';
      input.addEventListener(evento, () => { erro.textContent = ''; avisoCadastro.textContent = ''; });

      if (c.tipo === 'password'){
        const wrapSenha = document.createElement('div');
        wrapSenha.className = 'campo-senha-wrap';

        const alternar = document.createElement('button');
        alternar.type = 'button';
        alternar.className = 'ver-senha-cadastro';
        alternar.setAttribute('aria-label', 'Mostrar senha');
        alternar.setAttribute('aria-pressed', 'false');
        alternar.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';

        alternar.addEventListener('click', () => {
          const visivel = input.type === 'text';
          input.type = visivel ? 'password' : 'text';
          alternar.setAttribute('aria-pressed', String(!visivel));
          alternar.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
          input.focus();
        });

        wrapSenha.append(input, alternar);
        wrap.append(label, wrapSenha, erro);
      } else {
        wrap.append(label, input, erro);
      }
      form.appendChild(wrap);
    });

    const botaoEnviar = document.createElement('button');
    botaoEnviar.type = 'submit';
    botaoEnviar.className = 'enviar-cadastro';
    botaoEnviar.textContent = 'Enviar';

    const avisoCadastro = document.createElement('p');
    avisoCadastro.className = 'aviso-cadastro';
    avisoCadastro.setAttribute('role', 'status');

    form.append(botaoEnviar, avisoCadastro);
    texto.appendChild(form);

    const nome = form.querySelector('#cad-nome');
    const empresa = form.querySelector('#cad-empresa');
    const cargo = form.querySelector('#cad-cargo');
    const email = form.querySelector('#cad-email');
    const telefone = form.querySelector('#cad-telefone');
    const cpfCnpj = form.querySelector('#cad-cpf-cnpj');
    const cnpjMei = form.querySelector('#cad-cnpj-mei');
    const interesse = form.querySelector('#cad-interesse');
    const lgpd = form.querySelector('#cad-lgpd');
    const erroNome = form.querySelector('#cad-nome-erro');
    const erroEmpresa = form.querySelector('#cad-empresa-erro');
    const erroEmail = form.querySelector('#cad-email-erro');
    const erroTelefone = form.querySelector('#cad-telefone-erro');
    const erroCnpjMei = form.querySelector('#cad-cnpj-mei-erro');
    const erroInteresse = form.querySelector('#cad-interesse-erro');
    const erroLgpd = form.querySelector('#cad-lgpd-erro');

    function validarCadastro(){
      let ok = true;
      erroNome.textContent = '';
      erroEmpresa.textContent = '';
      erroEmail.textContent = '';
      erroTelefone.textContent = '';
      erroCnpjMei.textContent = '';
      erroInteresse.textContent = '';
      erroLgpd.textContent = '';

      if (!nome.value.trim()){
        erroNome.textContent = 'Informe seu nome.';
        ok = false;
      }

      if (!empresa.value.trim()){
        erroEmpresa.textContent = 'Informe o nome da empresa.';
        ok = false;
      }

      const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
      if (!email.value.trim()){
        erroEmail.textContent = 'Informe seu e-mail.';
        ok = false;
      } else if (!emailValido){
        erroEmail.textContent = 'Informe um e-mail válido.';
        ok = false;
      }

      const telefoneDigitos = telefone.value.replace(/\D/g, '');
      if (telefoneDigitos.length < 10){
        erroTelefone.textContent = 'Informe um telefone válido.';
        ok = false;
      }

      if (!cnpjMei.value){
        erroCnpjMei.textContent = 'Selecione se possui CNPJ ou MEI.';
        ok = false;
      }

      if (!interesse.value){
        erroInteresse.textContent = 'Selecione seu interesse principal.';
        ok = false;
      }

      if (!lgpd.checked){
        erroLgpd.textContent = 'É preciso aceitar o tratamento dos dados conforme a LGPD.';
        ok = false;
      }

      if (erroNome.textContent) nome.focus();
      else if (erroEmpresa.textContent) empresa.focus();
      else if (erroEmail.textContent) email.focus();
      else if (erroTelefone.textContent) telefone.focus();
      else if (erroCnpjMei.textContent) cnpjMei.focus();
      else if (erroInteresse.textContent) interesse.focus();
      else if (erroLgpd.textContent) lgpd.focus();

      return ok;
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!validarCadastro()) return;

      botaoEnviar.disabled = true;
      botaoEnviar.textContent = 'Enviando…';
      avisoCadastro.textContent = '';

      const dadosLead = {
        nome: nome.value.trim(),
        empresa: empresa.value.trim(),
        cargo: cargo.value.trim(),
        email: email.value.trim(),
        telefone: telefone.value.trim(),
        cpf_cnpj: cpfCnpj.value.trim(),
        interesse_principal: interesse.value,
        dados_extras: {
          possui_cnpj_mei: cnpjMei.value,
          aceite_lgpd: true,
          origem: 'site-cadastro'
        }
      };

      try {
        // grava o lead pela função pública "criar_lead_publico" (tabela "leads")
        await SofipeSupabase.criarLead(dadosLead);

        form.reset();
        avisoCadastro.textContent = 'Cadastro recebido! Nossa equipe vai entrar em contato com a melhor opção para você.';
      } catch (erro) {
        avisoCadastro.textContent = 'Não foi possível enviar agora. Tente novamente em instantes ou fale com a gente pelo WhatsApp.';
      } finally {
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = 'Enviar';
      }
    });
  }

  /* ---------------- newsletter ---------------- */
  const formNewsletter = document.getElementById('form-newsletter');
  if (formNewsletter){
    const campoEmail = document.getElementById('newsletter-email');
    const avisoNewsletter = document.getElementById('newsletter-aviso');
    const botaoNewsletter = formNewsletter.querySelector('button');

    formNewsletter.addEventListener('submit', async e => {
      e.preventDefault();
      const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campoEmail.value.trim());
      if (!emailValido){
        avisoNewsletter.textContent = 'Informe um e-mail válido.';
        campoEmail.focus();
        return;
      }

      botaoNewsletter.disabled = true;
      avisoNewsletter.textContent = '';

      try {
        // grava o e-mail como lead (tabela "leads"), via a função pública "criar_lead_publico"
        await SofipeSupabase.criarLead({
          nome: 'Assinante newsletter',
          email: campoEmail.value.trim(),
          dados_extras: { origem: 'newsletter' }
        });
        formNewsletter.reset();
        avisoNewsletter.textContent = 'Inscrição confirmada! Obrigado.';
      } catch (erro) {
        avisoNewsletter.textContent = 'Não foi possível concluir agora. Tente novamente em instantes.';
      } finally {
        botaoNewsletter.disabled = false;
      }
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
    painel.classList.toggle('painel-quem', dado.tipo === 'quem');
    montarConteudo(dado);

    painel.setAttribute('aria-hidden', 'false');
    painel.focus();
    atual = chave;
  });
})();

/* ---------------- chatbot Sofia (respostas por palavras-chave) ---------------- */
(function chatbotSofia(){
  const janela = document.getElementById('sofia');
  const abrir = document.getElementById('abrir-sofia');
  const fechar = document.getElementById('fechar-sofia');
  const msgs = document.getElementById('sofia-msgs');
  const chips = document.getElementById('sofia-chips');
  const form = document.getElementById('sofia-form');
  const campo = document.getElementById('sofia-input');
  if (!janela || !abrir) return;

  const CONTATO = 'Você fala com a nossa equipe pelo telefone (11) 3740-2037 ou pelo WhatsApp (11) 97089-1940, ou ainda pelo e-mail contato@sofipe.com.br. Respondemos no mesmo dia útil.';
  const COTAR = { rotulo: 'Fazer cadastro / cotação', secao: 'cadastro' };

  // ordem importa: a primeira regra que combinar responde
  const regras = [
    { re: /\b(oi|ola|bom dia|boa tarde|boa noite|e ai)\b/, t: 'Olá! Eu sou a Sofia, assistente virtual da Sofipe. Posso te ajudar com planos de saúde e outros seguros. O que você procura?' },
    { re: /(obrigad|valeu|agradec)/, t: 'Por nada! Se precisar de mais alguma coisa, é só chamar.' },
    { re: /(tchau|ate mais|ate logo|encerrar)/, t: 'Até mais! Quando quiser, é só voltar a falar com a Sofia.' },
    { re: /(atendente|humano|pessoa|corretor|falar com alguem|ligar)/, t: 'Claro! ' + CONTATO },
    { re: /(telefone|whats|zap|email|e-mail|contato|horario|atendimento)/, t: CONTATO, botoes: [{ rotulo: 'Abrir "Entre em contato"', secao: 'contato' }] },
    { re: /(senha|login|entrar|acessar|conta)/, t: 'Para entrar, use seu e-mail e sua senha (de 6 a 10 caracteres) no formulário ao lado. Ainda não tem conta? Faça o cadastro em poucos passos.', botoes: [COTAR] },
    { re: /(cotac|orcamento|preco|valor|quanto custa|contratar|cadastr|simular)/, t: 'Não passo valores por aqui, porque o preço depende do seu perfil. Faça o cadastro e nossa equipe retorna com a melhor opção para você.', botoes: [COTAR] },
    { re: /(saude|plano|medic|hospital|convenio|operadora|rede credenciada|familia)/, t: 'Somos especialistas em planos de saúde. Comparamos operadoras e planos sob medida para você e sua família, com a melhor rede credenciada.', botoes: [COTAR, { rotulo: 'Ver seguros', secao: 'seguros' }] },
    { re: /(vida|falecimento|beneficiar)/, t: 'O Seguro de Vida protege quem você ama, com uma cobertura sob medida para o seu momento de vida.', botoes: [COTAR] },
    { re: /(responsabilidade|terceiros)/, t: 'A Responsabilidade Civil cobre danos causados a terceiros, para você ter tranquilidade no dia a dia.', botoes: [COTAR] },
    { re: /(residenc|casa|imovel|apartamento|incendio|roubo)/, t: 'O Seguro Residencial protege o seu imóvel contra incêndio, roubo e outros imprevistos.', botoes: [COTAR] },
    { re: /(seguro|cobertura|proteg)/, t: 'Trabalhamos com Seguro Saúde, Seguro de Vida, Responsabilidade Civil e Seguro Residencial. Qual deles te interessa?', botoes: [{ rotulo: 'Ver seguros', secao: 'seguros' }] },
    { re: /(quem|susep|empresa|sofipe|confia|experiencia)/, t: 'A Sofipe é uma corretora credenciada pela SUSEP, com atendimento próximo e humanizado, do primeiro orçamento à renovação anual.', botoes: [{ rotulo: 'Quem somos', secao: 'quem' }] }
  ];
  const sugestoes = ['Plano de saúde', 'Outros seguros', 'Fazer cotação', 'Falar com atendente'];
  const padrao = 'Não tenho certeza de que entendi. Posso ajudar com planos de saúde, outros seguros, cotação ou contato. Escolha uma opção abaixo ou fale com a nossa equipe: (11) 4000-0000.';

  const normalizar = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function rolar(){ msgs.scrollTop = msgs.scrollHeight; }

  function balao(tipo, texto){
    const el = document.createElement('div');
    el.className = 'sofia-msg ' + tipo;
    el.textContent = texto;
    msgs.appendChild(el);
    rolar();
    return el;
  }

  function abrirSecao(secao){
    const alvo = document.querySelector('[data-secao="' + secao + '"]');
    if (alvo) alvo.click();
    if (window.innerWidth <= 700) fecharChat();
  }

  function criarBotoes(el, botoes){
    (botoes || []).forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sofia-acao';
      btn.textContent = b.rotulo;
      btn.addEventListener('click', () => abrirSecao(b.secao));
      el.appendChild(btn);
    });
  }

  async function responder(texto){
    const digitando = balao('bot digitando', '•••');
    const sessionId = SofipeSupabase.obterSessaoId();

    // garante um lead para esta conversa e registra a mensagem do visitante
    // (tabela "interacoes_agente"); se isso falhar, o chat continua normalmente
    SofipeSupabase.obterOuCriarLeadChat().then(leadId => {
      if (leadId) SofipeSupabase.registrarInteracao({ lead_id: leadId, mensagem: texto, remetente: 'lead', sessao_id: sessionId });
    }).catch(() => {});

    const q = normalizar(texto);
    const regra = regras.find(r => r.re.test(q));
    const resposta = regra ? regra.t : padrao;

    setTimeout(() => {
      digitando.remove();
      const el = balao('bot', resposta);
      criarBotoes(el, regra && regra.botoes);
      rolar();

      SofipeSupabase.obterOuCriarLeadChat().then(leadId => {
        if (leadId) SofipeSupabase.registrarInteracao({ lead_id: leadId, mensagem: resposta, remetente: 'agente_ia', sessao_id: sessionId });
      }).catch(() => {});
    }, 550);
  }

  function enviar(texto){
    texto = texto.trim();
    if (!texto) return;
    balao('eu', texto);
    responder(texto);
  }

  function abrirChat(){
    janela.hidden = false;
    abrir.hidden = true;                 // o botão some enquanto o chat está aberto
    abrir.setAttribute('aria-expanded', 'true');
    if (!msgs.children.length){
      balao('bot', 'Olá! Eu sou a Sofia, assistente virtual da Sofipe. Como posso te ajudar hoje?');
    }
    campo.focus();
  }
  function fecharChat(){
    janela.hidden = true;
    abrir.hidden = false;
    abrir.setAttribute('aria-expanded', 'false');
  }

  sugestoes.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sofia-chip';
    b.textContent = s;
    b.addEventListener('click', () => enviar(s));
    chips.appendChild(b);
  });

  abrir.addEventListener('click', () => (janela.hidden ? abrirChat() : fecharChat()));
  fechar.addEventListener('click', () => { fecharChat(); abrir.focus(); });
  janela.addEventListener('keydown', e => { if (e.key === 'Escape'){ fecharChat(); abrir.focus(); } });
  form.addEventListener('submit', e => {
    e.preventDefault();
    enviar(campo.value);
    campo.value = '';
  });
})();
