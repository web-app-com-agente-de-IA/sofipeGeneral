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

  // ---- leads da equipe (regras de visibilidade ficam no banco: ver supabase-leads-equipe.sql) ----
  async function listarLeadsEquipe(){
    const { data, error } = await checarCliente().rpc('listar_leads_equipe');
    if (error) throw error;
    return data || [];
  }
  async function listarEquipe(){
    const { data, error } = await checarCliente().rpc('listar_equipe_atribuicao');
    if (error) throw error;
    return data || [];
  }
  async function reatribuirLead(leadId, responsavelId){
    const { error } = await checarCliente().rpc('reatribuir_lead', { p_lead_id: leadId, p_responsavel_id: responsavelId });
    if (error) throw error;
  }

  // gestão da equipe: a criação de contas roda na Edge Function "gerir-equipe"
  // (usa a chave service_role no servidor; ver supabase/functions/gerir-equipe)
  const NOME_FUNCAO_EQUIPE = 'smooth-task';   // nome com que a Edge Function foi publicada no Supabase
  async function gerirEquipe(payload){
    const { data, error } = await checarCliente().functions.invoke(NOME_FUNCAO_EQUIPE, { body: payload });
    if (error){
      let msg = 'Não foi possível concluir agora. Tente novamente.';
      const resp = error.context;
      try {
        if (resp && typeof resp.json === 'function'){
          const status = resp.status;
          let corpo = null;
          try { corpo = await resp.json(); } catch (e) { /* corpo vazio ou não-JSON */ }
          if (corpo && corpo.erro) msg = corpo.erro;
          else if (status === 404) msg = 'A função ' + NOME_FUNCAO_EQUIPE + ' não foi encontrada no Supabase. Confira se ela foi publicada com esse nome exato.';
          else if (status === 401) msg = 'Sua sessão expirou. Clique em Sair e entre de novo.';
          else {
            const detalhe = corpo && (corpo.message || corpo.msg);
            msg = 'Erro ' + status + ' na função gerir-equipe' + (detalhe ? ': ' + detalhe : '. Veja os Logs em Edge Functions → gerir-equipe.');
          }
        } else {
          msg = 'Não foi possível chamar a função gerir-equipe. Confira se ela foi publicada no Supabase com esse nome exato.';
        }
      } catch (e) { /* mantém a mensagem padrão */ }
      throw new Error(msg);
    }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  }

  // conversa com a Sofia: roda na Edge Function "sofia-chat", que chama o Gemini (Google)
  // com a chave guardada no servidor (secret GEMINI_API_KEY)
  const NOME_FUNCAO_SOFIA = 'sofia-chat';
  async function conversarSofia(mensagens, sessaoId){
    const { data, error } = await checarCliente().functions.invoke(NOME_FUNCAO_SOFIA, {
      body: { mensagens, sessao_id: sessaoId }
    });
    if (error) throw error;
    if (!data || !data.resposta) throw new Error((data && data.erro) || 'Resposta vazia da Sofia.');
    return data; // { resposta, lead_cadastrado }
  }

  function obterSessaoId(){
    let id = sessionStorage.getItem('sofipe_sessao_sofia');
    if (!id){
      id = gerarUuid();
      sessionStorage.setItem('sofipe_sessao_sofia', id);
    }
    return id;
  }

  return { criarLead, obterOuCriarLeadChat, registrarInteracao, conversarSofia, entrar, sair, sessaoAtual, obterSessaoId, listarLeadsEquipe, listarEquipe, reatribuirLead, gerirEquipe };
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

  const ROTULOS_PERFIL = { admin: 'Administrador', gestor: 'Gestor', vendedor: 'Vendedor' };

  function mostrarLogado(nome, sessao){
    const papel = sessao && sessao.perfil ? ROTULOS_PERFIL[sessao.perfil.perfil] : '';
    if (nomeUsuario){ nomeUsuario.textContent = (nome || '') + (papel ? ' · ' + papel : ''); nomeUsuario.hidden = false; }
    if (botaoSair) botaoSair.hidden = false;
    if (cardAcesso) cardAcesso.hidden = true;
    document.body.classList.add('modo-equipe');      // logado: só o que importa para a equipe
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('sofipe:login', { detail: sessao || { usuario: null, perfil: null } }));
  }
  function mostrarDeslogado(){
    if (nomeUsuario){ nomeUsuario.textContent = ''; nomeUsuario.hidden = true; }
    if (botaoSair) botaoSair.hidden = true;
    if (cardAcesso) cardAcesso.hidden = false;
    if (window.SofipeFecharPainel) window.SofipeFecharPainel();
    document.body.classList.remove('modo-equipe');   // volta ao site público
    document.dispatchEvent(new CustomEvent('sofipe:logout'));
  }
  // depois de entrar, já abre a aba de leads
  function abrirLeads(){
    const a = document.getElementById('atalho-leads');
    if (a) a.click();
  }

  // restaura a sessão, caso o visitante já esteja logado (ex.: ao recarregar a página)
  SofipeSupabase.sessaoAtual()
    .then(({ usuario, perfil }) => { if (usuario){ mostrarLogado((perfil && perfil.nome) || usuario.email, { usuario, perfil }); abrirLeads(); } })
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
      if (window.SofipeFecharPainel) window.SofipeFecharPainel();
      mostrarLogado((perfil && perfil.nome) || usuario.email, { usuario, perfil });
      abrirLeads();
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
        { titulo: 'Seguro Saúde', texto: 'Encontre o plano ideal para você e sua família, com a melhor rede credenciada.',
          explicacao: 'O Seguro Saúde da Sofipe conecta você às principais operadoras do mercado, com planos individuais, familiares e empresariais. Comparamos coberturas, carências e rede credenciada para encontrar a opção que cabe no seu bolso e atende às suas necessidades.',
          checklist: ['Disponível para CNPJ ou MEI', 'A partir de 01 vida', 'Cobertura completa'] },
        { titulo: 'Seguro de Vida', texto: 'Proteja quem você ama com uma cobertura sob medida para o seu momento de vida.',
          explicacao: 'O Seguro de Vida garante segurança financeira para quem você ama em caso de imprevistos, com indenização ágil aos beneficiários. Você escolhe o valor de cobertura e pode incluir proteções extras, como invalidez e doenças graves.',
          checklist: ['Segurança financeira para a família', 'Cobertura por invalidez', 'Assistência e serviços adicionais'] },
        { titulo: 'Responsabilidade Civil', texto: 'Cobertura para danos causados a terceiros, com tranquilidade no seu dia a dia.',
          explicacao: 'O Seguro de Responsabilidade Civil cobre indenizações por danos materiais ou corporais que você cause a terceiros, seja em acidentes do dia a dia, no trabalho ou em casa. É uma proteção extra para imprevistos que fogem do seu controle.',
          checklist: ['Proteção contra danos a terceiros', 'Indenização em processos judiciais', 'Segurança para você e sua empresa'] },
        { titulo: 'Seguro Residencial', texto: 'Proteção completa para o seu imóvel contra incêndio, roubo e outros imprevistos.',
          explicacao: 'O Seguro Residencial protege seu imóvel contra incêndio, roubo, furto, danos elétricos e outros imprevistos, cobrindo tanto a estrutura quanto os bens dentro dela. Também pode incluir assistências como chaveiro, encanador e eletricista 24h.',
          checklist: ['Proteção contra incêndio e roubo', 'Cobertura para danos elétricos', 'Assistência 24h (chaveiro, encanador, eletricista)'] }
      ]
    },
    contato: {
      titulo: 'Entre em contato',
      tipo: 'contato',
      subtitulo: 'Fale com a Sofipe pelo canal que for melhor para você. Retornamos no mesmo dia útil.',
      canais: [
        { icone: 'telefone', titulo: 'Telefone', texto: '(11) 3740-2037', href: 'tel:+551137402037', acao: 'Ligar agora' },
        { icone: 'whatsapp', titulo: 'WhatsApp', texto: '(11) 97089-1940', href: 'https://wa.me/5511970891940', externo: true, acao: 'Chamar no WhatsApp' },
        { icone: 'email', titulo: 'E-mail', texto: 'contato@sofipe.com.br', href: 'mailto:contato@sofipe.com.br', acao: 'Enviar e-mail' },
        { icone: 'local', titulo: 'Endereço', texto: 'Rua Isabel Dias, 62 - Sala 03 - Mooca - São Paulo',
          href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Rua Isabel Dias, 62, Mooca, São Paulo'), externo: true, acao: 'Ver no mapa' }
      ],
      redes: [
        { icone: 'instagram', nome: 'Instagram', href: 'https://www.instagram.com/sofipesolucoes' },
        { icone: 'facebook', nome: 'Facebook', href: 'https://www.facebook.com/sofipesolucoes' },
        { icone: 'linkedin', nome: 'LinkedIn', href: 'https://www.linkedin.com/company/sofipesolucoes/' }
      ]
    },
    cadastro: {
      titulo: 'Cadastre-se',
      tipo: 'cadastro'
    },
    leads: {
      titulo: 'Leads',
      tipo: 'leads'
    },
    equipe: {
      titulo: 'Equipe',
      tipo: 'equipe'
    }
  };

  const iconesQuem = {
    cracha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="15" rx="2.5"/><circle cx="9" cy="10.5" r="2"/><path d="M6 16c.6-1.6 2-2.5 3-2.5s2.4.9 3 2.5"/><path d="M15 9h4M15 12.5h4"/></svg>',
    aperto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11l4-3 3 2 3-2.5 3 2.5 3-2 4 3"/><path d="M4 11v3.5a1.6 1.6 0 0 0 2.6 1.2l1-.9"/><path d="M20 11v3.5a1.6 1.6 0 0 1-2.6 1.2l-3-2.7-2.3 2a1.7 1.7 0 0 1-2.3-2.5l3.1-3"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v10.5H9l-4 3.5v-3.5H4z"/><circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="12.5" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r=".9" fill="currentColor" stroke="none"/></svg>',
    joia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9z"/><path d="M7 11l3.2-6.3a1.6 1.6 0 0 1 2.9.3l.6 2.1H17a2 2 0 0 1 1.9 2.7l-2 5.6A2 2 0 0 1 15 17h-6"/></svg>'
  };

  const iconesCotacoes = {
    'Seguro Saúde': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.35-9.5-8.8C.9 8.7 2.4 5.5 5.6 5c2-.3 3.6.6 4.9 2.1.4.5 1.1 1.3 1.5 1.9.4-.6 1.1-1.4 1.5-1.9C14.8 5.6 16.4 4.7 18.4 5c3.2.5 4.7 3.7 3.1 7.2C19 16.65 12 21 12 21z"/><path d="M9 12h2l1-2 1.5 4L15 12h2"/></svg>',
    'Seguro de Vida': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8" r="3"/><path d="M3 20c0-3 2.5-5.2 5.5-5.2S14 17 14 20"/><circle cx="16.5" cy="9.5" r="2.3"/><path d="M14.2 20c.2-2.3 2-4.3 4.4-4.3S22.5 18 22.7 20"/></svg>',
    'Responsabilidade Civil': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    'Seguro Residencial': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v9.5a1 1 0 0 0 1 1h4V15h4v5.5h4a1 1 0 0 0 1-1V10"/></svg>'
  };


  const iconesContato = {
    telefone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.5l1.8 4.5-2.2 1.4a11 11 0 0 0 5.5 5.5l1.4-2.2L20 15v3.5a1.5 1.5 0 0 1-1.6 1.5C10.7 19.4 4.6 13.3 4 5.6A1.5 1.5 0 0 1 5 4z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M9 8.5c.2 2.6 2.9 5.3 5.5 5.5l1.2-1.3-2-1-.9.7a4 4 0 0 1-1.9-1.9l.7-.9-1-2z"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/></svg>',
    local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 8.5h2V5h-2c-2.2 0-4 1.8-4 4v2H9v3.5h2V19h3.5v-4.5H17l.5-3.5h-3V9c0-.55.45-1 1-1z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="9" r="1" fill="currentColor" stroke="none"/><path d="M8 12v5M12 17v-3.2c0-1.5 1-2.3 2.2-2.3S16 12.3 16 13.8V17"/></svg>'
  };

  /* páginas detalhadas do "Saiba Mais" — conteúdo baseado nas páginas oficiais de sofipe.com.br */
  const PASSOS_VIDA = [
    { t: 'Consulta com um especialista', d: 'Entendemos as necessidades da sua empresa.' },
    { t: 'Proposta personalizada', d: 'Você recebe opções adequadas ao seu orçamento.' },
    { t: 'Ativação do seguro', d: 'Cobertura imediata para seus colaboradores.' },
    { t: 'Gestão e manutenção', d: 'Suporte completo e otimizações contínuas do contrato.' }
  ];
  const PASSOS_ATENDIMENTO = [
    { t: 'Consultoria especializada', d: 'Analisamos suas necessidades para indicar os planos mais adequados ao seu perfil e orçamento.' },
    { t: 'Análise de perfil da empresa', d: 'Estudamos o perfil da sua equipe para oferecer soluções personalizadas, maximizando o custo-benefício.' },
    { t: 'Suporte de ponta a ponta', d: 'Do momento da cotação ao pós-venda, acompanhamos cada etapa do processo para garantir sua tranquilidade.' },
    { t: 'Gestão e manutenção', d: 'Ajudamos na inclusão e exclusão de vidas, reajustes e otimizações contínuas do contrato.' }
  ];

  const detalhes = {
    'Seguro Saúde': {
      manchete: 'Planos de Saúde PME: soluções inteligentes para pequenas e médias empresas',
      subtitulo: 'Benefícios acessíveis e flexíveis para cuidar da sua saúde e da sua equipe.',
      blocos: [
        { titulo: 'O que são planos de saúde PME?', paragrafos: [
          'O plano de saúde PME é uma modalidade de assistência médica empresarial criada para pequenas e médias empresas, a partir de 01 vida, oferecendo aos colaboradores e seus dependentes acesso facilitado a uma ampla rede de médicos, clínicas, hospitais e laboratórios.',
          'Mais do que um benefício, o plano PME representa um investimento inteligente no bem-estar e na produtividade da equipe, combinando custo-benefício atrativo, flexibilidade de coberturas e condições diferenciadas de contratação, como redução de carências e suporte especializado na gestão do plano.',
          'Na Sofipe, somos especialistas em planos de saúde para PMEs e autônomos. Oferecemos consultoria personalizada, com análise detalhada do perfil da sua equipe para indicar as opções mais vantajosas, sempre com transparência e suporte próximo.'
        ] }
      ],
      destaquesTitulo: 'Principais características',
      destaques: [
        { t: 'Elegibilidade', d: 'Empresas com CNPJ ativo e pelo menos 01 vida.' },
        { t: 'Custo-benefício', d: 'Mensalidades mais acessíveis que os planos individuais.' },
        { t: 'Rede credenciada ampla', d: 'Clínicas, hospitais e laboratórios renomados.' },
        { t: 'Carência reduzida', d: 'Opções de redução ou isenção de carência.' },
        { t: 'Flexibilidade', d: 'Coberturas que se adaptam ao porte e ao perfil da equipe.' },
        { t: 'Gestão facilitada', d: 'Atendimento dedicado para alterações, inclusão ou exclusão de vidas.' }
      ],
      passosTitulo: 'Atendimento completo para a sua tranquilidade',
      passos: PASSOS_ATENDIMENTO,
      site: 'https://sofipe.com.br/seguro-saude/'
    },

    'Seguro de Vida': {
      manchete: 'Proteção completa para a sua equipe, segurança para o seu negócio',
      subtitulo: 'O Seguro de Vida Empresarial é a solução ideal para cuidar do bem-estar e da segurança dos seus colaboradores.',
      blocos: [
        { titulo: 'Mais do que um seguro: um investimento na segurança e no bem-estar da sua equipe', paragrafos: [
          'O Seguro de Vida Empresarial é a solução ideal para empresas que entendem que cuidar dos colaboradores é cuidar do próprio negócio.',
          'Ele garante proteção financeira em momentos inesperados, oferecendo tranquilidade para o colaborador e segurança para a empresa, seja em casos de acidentes, doenças graves ou situações de invalidez.',
          'Com planos flexíveis e personalizados, o seguro se adapta ao tamanho da sua equipe e às necessidades do seu negócio, transformando a proteção em um verdadeiro diferencial competitivo.'
        ] }
      ],
      destaquesTitulo: 'Principais benefícios',
      destaques: [
        { t: 'Cobertura ampla', d: 'Cobertura para falecimento, invalidez e doenças graves.' },
        { t: 'Assistência funeral 24h', d: 'Suporte de assistência funeral disponível 24 horas.' },
        { t: 'Acidentes', d: 'Cobertura de acidentes de trabalho e fora dele.' },
        { t: 'Benefícios para familiares', d: 'Inclusão de benefícios para familiares.' },
        { t: 'Planos personalizados', d: 'Planos ajustados conforme o porte da empresa.' }
      ],
      passosTitulo: 'Por que escolher o Seguro de Vida Empresarial com a Sofipe?',
      passosIntro: 'Na Sofipe, não vendemos apenas seguros. Oferecemos uma experiência completa, com consultoria personalizada e suporte de ponta a ponta, para garantir que você encontre a solução ideal para o seu negócio.',
      passos: PASSOS_VIDA,
      site: 'https://sofipe.com.br/seguro-vida/'
    },

    'Responsabilidade Civil': {
      manchete: 'Proteção sob medida para o seu negócio',
      subtitulo: 'Com o Seguro de Responsabilidade Civil, você garante segurança e tranquilidade para sua empresa em qualquer situação.',
      blocos: [
        { titulo: 'Por que contar com um Seguro de Responsabilidade Civil', paragrafos: [
          'O Seguro de Responsabilidade Civil Empresarial é a solução que protege o seu patrimônio contra prejuízos financeiros causados a terceiros, sejam eles clientes, parceiros ou fornecedores.',
          'Na Sofipe, oferecemos um seguro completo, que cobre situações de imprevistos no exercício da sua atividade, garantindo que você tenha suporte financeiro e jurídico para seguir com tranquilidade.'
        ] }
      ],
      situacoesTitulo: 'Quando o Seguro de Responsabilidade Civil faz a diferença',
      situacoes: [
        { t: 'Clínicas e consultórios', d: 'Cobertura em casos de falhas profissionais que geram processos.' },
        { t: 'Empresas de serviços', d: 'Proteção contra danos a equipamentos ou bens de clientes.' },
        { t: 'Eventos corporativos', d: 'Garantia para imprevistos durante a realização de eventos.' }
      ],
      destaquesTitulo: 'Principais características',
      destaques: [
        { t: 'Cobertura completa', d: 'Protege contra danos materiais, corporais e morais causados a terceiros.' },
        { t: 'Proteção jurídica', d: 'Suporte para despesas legais e honorários advocatícios.' },
        { t: 'Personalização do plano', d: 'Soluções adaptadas ao tamanho e ao segmento da sua empresa.' },
        { t: 'Credibilidade no mercado', d: 'Demonstra segurança e responsabilidade aos seus clientes e parceiros.' },
        { t: 'Custo-benefício', d: 'Investimento acessível em comparação aos riscos que a sua empresa pode enfrentar.' }
      ],
      passosTitulo: 'Atendimento completo para a sua tranquilidade',
      passos: PASSOS_ATENDIMENTO,
      site: 'https://sofipe.com.br/seguro-rc/'
    },

    'Seguro Residencial': {
      manchete: 'Proteção completa para o seu imóvel',
      subtitulo: 'Tranquilidade para o seu lar contra incêndio, roubo e outros imprevistos.',
      blocos: [
        { titulo: 'Como funciona o Seguro Residencial', paragrafos: [
          'O Seguro Residencial protege seu imóvel contra incêndio, roubo, furto, danos elétricos e outros imprevistos, cobrindo tanto a estrutura quanto os bens dentro dela.',
          'Também pode incluir assistências como chaveiro, encanador e eletricista 24h.'
        ] }
      ],
      destaquesTitulo: 'Principais coberturas',
      destaques: [
        { t: 'Incêndio e roubo', d: 'Proteção contra incêndio, roubo e furto.' },
        { t: 'Danos elétricos', d: 'Cobertura para danos elétricos.' },
        { t: 'Estrutura e bens', d: 'Cobre a estrutura do imóvel e os bens dentro dela.' },
        { t: 'Assistência 24h', d: 'Pode incluir chaveiro, encanador e eletricista 24h.' }
      ],
      passosTitulo: 'Como a Sofipe cuida da sua contratação',
      passos: PASSOS_VIDA,
      site: null
    }
  };

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6"/></svg>';

  function criar(tag, classe, conteudo){
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (conteudo) e.textContent = conteudo;
    return e;
  }

  const painel = document.getElementById('painel');
  const titulo = document.getElementById('painel-titulo');
  const texto = document.getElementById('painel-texto');
  if (!painel) return;

  let atual = null;
  let interesseSelecionado = null;

  function fecharPainel(){
    painel.setAttribute('aria-hidden', 'true');
    painel.classList.remove('painel-detalhe');
    atual = null;
  }
  window.SofipeFecharPainel = fecharPainel;

  function montarConteudo(dado){
    texto.innerHTML = '';

    if (dado.tipo === 'leads'){
      if (window.SofipeLeads) window.SofipeLeads.montar(texto);
    } else if (dado.tipo === 'equipe'){
      if (window.SofipeEquipe) window.SofipeEquipe.montar(texto);
    } else if (dado.tipo === 'cadastro'){
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
    } else if (dado.tipo === 'contato'){
      montarContato(dado);
    } else if (dado.tipo === 'cotacoes'){
      const grade = document.createElement('div');
      grade.className = 'grade-cotacoes';

      dado.cartoes.forEach(c => {
        const cartao = document.createElement('div');
        cartao.className = 'cartao-cotacao';

        const capa = document.createElement('div');
        capa.className = 'cartao-cotacao-capa';
        capa.setAttribute('aria-hidden', 'true');
        capa.innerHTML = iconesCotacoes[c.titulo] || '';

        const corpo = document.createElement('div');
        corpo.className = 'cartao-cotacao-corpo';

        const h3 = document.createElement('h3');
        h3.textContent = c.titulo;

        const p = document.createElement('p');
        p.textContent = c.texto;

        corpo.append(h3, p);

        if (c.checklist && c.checklist.length){
          const lista = document.createElement('ul');
          lista.className = 'cartao-cotacao-lista';
          c.checklist.forEach(item => {
            const li = document.createElement('li');

            const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            check.setAttribute('class', 'check-icone');
            check.setAttribute('viewBox', '0 0 24 24');
            check.setAttribute('fill', 'none');
            check.setAttribute('stroke', 'currentColor');
            check.setAttribute('stroke-width', '2.4');
            check.setAttribute('stroke-linecap', 'round');
            check.setAttribute('stroke-linejoin', 'round');
            check.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M4 12.5l5 5L20 6');
            check.appendChild(path);

            const span = document.createElement('span');
            span.textContent = item;

            li.append(check, span);
            lista.appendChild(li);
          });
          corpo.appendChild(lista);
        }

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'obter';
        botao.textContent = 'Saiba Mais';
        botao.addEventListener('click', () => mostrarExplicacaoSeguro(c));
        corpo.appendChild(botao);

        cartao.append(capa, corpo);
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

  function mostrarExplicacaoSeguro(cartaoSeguro){
    titulo.textContent = cartaoSeguro.titulo;
    painel.classList.remove('painel-seguros');
    painel.classList.remove('painel-quem');
    painel.classList.remove('painel-contato');
    painel.classList.add('painel-detalhe');
    texto.innerHTML = '';

    const d = detalhes[cartaoSeguro.titulo];
    const pagina = criar('div', 'detalhe');

    if (d){
      pagina.appendChild(criar('p', 'detalhe-manchete', d.manchete));
      pagina.appendChild(criar('p', 'detalhe-subtitulo', d.subtitulo));

      d.blocos.forEach(b => {
        const bloco = criar('section', 'detalhe-bloco');
        bloco.appendChild(criar('h3', '', b.titulo));
        b.paragrafos.forEach(t => bloco.appendChild(criar('p', '', t)));
        pagina.appendChild(bloco);
      });

      if (d.situacoes){
        const sec = criar('section', 'detalhe-bloco');
        sec.appendChild(criar('h3', '', d.situacoesTitulo));
        const grade = criar('div', 'detalhe-situacoes');
        d.situacoes.forEach(s => {
          const c = criar('div', 'detalhe-situacao');
          c.append(criar('strong', '', s.t), criar('span', '', s.d));
          grade.appendChild(c);
        });
        sec.appendChild(grade);
        pagina.appendChild(sec);
      }

      const secDest = criar('section', 'detalhe-bloco');
      secDest.appendChild(criar('h3', '', d.destaquesTitulo));
      const gradeDest = criar('div', 'detalhe-destaques');
      d.destaques.forEach(x => {
        const c = criar('div', 'detalhe-destaque');
        const ic = criar('span', 'detalhe-check');
        ic.innerHTML = CHECK_SVG;
        const corpo = criar('div');
        corpo.append(criar('strong', '', x.t), criar('span', '', x.d));
        c.append(ic, corpo);
        gradeDest.appendChild(c);
      });
      secDest.appendChild(gradeDest);
      pagina.appendChild(secDest);

      const secPassos = criar('section', 'detalhe-bloco');
      secPassos.appendChild(criar('h3', '', d.passosTitulo));
      if (d.passosIntro) secPassos.appendChild(criar('p', '', d.passosIntro));
      const lista = criar('ol', 'detalhe-passos');
      d.passos.forEach((s, i) => {
        const li = criar('li');
        li.append(criar('span', 'detalhe-passo-num', String(i + 1)), criar('strong', '', s.t), criar('span', '', s.d));
        lista.appendChild(li);
      });
      secPassos.appendChild(lista);
      pagina.appendChild(secPassos);
    } else {
      pagina.appendChild(criar('p', 'explicacao-seguro', cartaoSeguro.explicacao || cartaoSeguro.texto));
    }

    const cta = criar('div', 'detalhe-cta');
    cta.appendChild(criar('h3', '', 'Quer saber quanto custa para o seu perfil?'));
    cta.appendChild(criar('p', '', 'Faça seu cadastro e um especialista da Sofipe entra em contato com as melhores opções. Se preferir, fale agora: telefone (11) 3740-2037 ou WhatsApp (11) 97089-1940.'));

    const acoes = criar('div', 'explicacao-acoes');

    const voltar = document.createElement('button');
    voltar.type = 'button';
    voltar.className = 'explicacao-voltar';
    voltar.textContent = 'Ver outros seguros';
    voltar.addEventListener('click', () => {
      const dadoSeguros = textos.seguros;
      titulo.textContent = dadoSeguros.titulo;
      painel.classList.remove('painel-detalhe');
      painel.classList.add('painel-seguros');
      montarConteudo(dadoSeguros);
      atual = 'seguros';
      painel.scrollIntoView({ behavior: 'auto', block: 'start' });
    });

    const continuar = document.createElement('button');
    continuar.type = 'button';
    continuar.className = 'explicacao-continuar';
    continuar.textContent = 'Fazer cadastro';
    continuar.addEventListener('click', () => {
      interesseSelecionado = cartaoSeguro.titulo;
      const dadoCadastro = textos.cadastro;
      titulo.textContent = dadoCadastro.titulo;
      painel.classList.remove('painel-detalhe');
      montarConteudo(dadoCadastro);
      atual = 'cadastro';
      painel.scrollIntoView({ behavior: 'auto', block: 'start' });   // formulário aparece do começo
    });

    acoes.append(continuar, voltar);

    if (d && d.site){
      const site = criar('a', 'explicacao-voltar detalhe-site', 'Ver no site oficial');
      site.href = d.site;
      site.target = '_blank';
      site.rel = 'noopener';
      acoes.appendChild(site);
    }

    cta.appendChild(acoes);
    pagina.appendChild(cta);
    texto.appendChild(pagina);

    painel.setAttribute('aria-hidden', 'false');
    painel.focus();
    atual = 'explicacao-seguro';
  }

  /* ---------------- painel "Entre em contato" ---------------- */
  function montarContato(dado){
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const ASSUNTOS = ['Seguro Saúde', 'Seguro de Vida', 'Responsabilidade Civil', 'Seguro Residencial', 'Outro'];

    const intro = document.createElement('p');
    intro.className = 'contato-intro';
    intro.textContent = dado.subtitulo;
    texto.appendChild(intro);

    const corpo = document.createElement('div');
    corpo.className = 'contato-corpo';

    /* --- coluna da esquerda: canais, redes e atalhos --- */
    const esquerda = document.createElement('div');
    esquerda.className = 'contato-esquerda';

    const canais = document.createElement('div');
    canais.className = 'contato-canais';
    dado.canais.forEach(c => {
      const a = document.createElement('a');
      a.className = 'contato-card';
      a.href = c.href;
      if (c.externo){ a.target = '_blank'; a.rel = 'noopener'; }
      a.innerHTML = `<span class="quem-icone">${iconesContato[c.icone] || ''}</span>`;
      const h3 = document.createElement('h3');
      h3.textContent = c.titulo;
      const p = document.createElement('p');
      p.textContent = c.texto;
      const acao = document.createElement('span');
      acao.className = 'contato-acao';
      acao.textContent = c.acao;
      a.append(h3, p, acao);
      canais.appendChild(a);
    });

    const redesBloco = document.createElement('div');
    redesBloco.className = 'contato-redes-bloco';
    const redesTitulo = document.createElement('p');
    redesTitulo.className = 'contato-redes-titulo';
    redesTitulo.textContent = 'Nos siga nas redes sociais';
    const redes = document.createElement('div');
    redes.className = 'contato-redes';
    dado.redes.forEach(r => {
      const a = document.createElement('a');
      a.href = r.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-label', r.nome + ' da Sofipe');
      a.innerHTML = iconesContato[r.icone] || '';
      redes.appendChild(a);
    });
    redesBloco.append(redesTitulo, redes);

    const atalhos = document.createElement('div');
    atalhos.className = 'contato-atalhos';
    const btnSofia = document.createElement('button');
    btnSofia.type = 'button';
    btnSofia.className = 'contato-botao';
    btnSofia.textContent = 'Falar com a Sofia';
    btnSofia.addEventListener('click', () => {
      const chat = document.getElementById('sofia');
      const abrirChat = document.getElementById('abrir-sofia');
      if (chat && chat.hidden && abrirChat) abrirChat.click();
    });
    const linkCotacao = document.createElement('a');
    linkCotacao.className = 'contato-botao contato-botao-claro';
    linkCotacao.href = '#painel';
    linkCotacao.dataset.secao = 'cadastro';
    linkCotacao.textContent = 'Pedir uma cotação';
    atalhos.append(btnSofia, linkCotacao);

    esquerda.append(canais, redesBloco, atalhos);

    /* --- coluna da direita: formulário de mensagem --- */
    const direita = document.createElement('div');
    direita.className = 'contato-form-wrap';
    const formTitulo = document.createElement('h3');
    formTitulo.className = 'contato-form-titulo';
    formTitulo.textContent = 'Envie uma mensagem';
    const formSub = document.createElement('p');
    formSub.className = 'contato-form-sub';
    formSub.textContent = 'Conte o que você precisa e nossa equipe retorna no mesmo dia útil.';

    const form = document.createElement('form');
    form.className = 'form-cadastro form-contato';
    form.noValidate = true;

    const aviso = document.createElement('p');
    aviso.className = 'aviso-cadastro';
    aviso.setAttribute('role', 'status');

    function criarCampo({ id, label, tipo, autocomplete, opcoes, maxLength }){
      const wrap = document.createElement('div');
      wrap.className = 'campo-cadastro';

      const rotulo = document.createElement('label');
      rotulo.className = 'oculto';
      rotulo.setAttribute('for', id);
      rotulo.textContent = label;

      let input;
      if (tipo === 'select'){
        input = document.createElement('select');
        const vazia = document.createElement('option');
        vazia.value = '';
        vazia.textContent = label;
        vazia.disabled = true;
        vazia.selected = true;
        input.appendChild(vazia);
        opcoes.forEach(o => {
          const op = document.createElement('option');
          op.value = o;
          op.textContent = o;
          input.appendChild(op);
        });
      } else if (tipo === 'textarea'){
        input = document.createElement('textarea');
        input.rows = 4;
        input.placeholder = label;
        if (maxLength) input.maxLength = maxLength;
      } else {
        input = document.createElement('input');
        input.type = tipo;
        input.placeholder = label;
        input.autocomplete = autocomplete || 'off';
      }
      input.id = id;
      input.setAttribute('aria-describedby', id + '-erro');

      const erro = document.createElement('span');
      erro.className = 'erro-cadastro';
      erro.id = id + '-erro';
      erro.setAttribute('role', 'status');

      input.addEventListener(tipo === 'select' ? 'change' : 'input', () => { erro.textContent = ''; aviso.textContent = ''; });

      wrap.append(rotulo, input, erro);
      form.appendChild(wrap);
      return { input, erro };
    }

    const fNome = criarCampo({ id: 'ct-nome', label: 'Nome', tipo: 'text', autocomplete: 'name' });
    const fEmail = criarCampo({ id: 'ct-email', label: 'E-mail', tipo: 'email', autocomplete: 'email' });
    const fTel = criarCampo({ id: 'ct-telefone', label: 'WhatsApp (com DDD)', tipo: 'tel', autocomplete: 'tel' });
    const fAssunto = criarCampo({ id: 'ct-assunto', label: 'Assunto', tipo: 'select', opcoes: ASSUNTOS });
    const fMsg = criarCampo({ id: 'ct-mensagem', label: 'Sua mensagem', tipo: 'textarea', maxLength: 500 });

    // consentimento LGPD (igual ao do cadastro)
    const wrapLgpd = document.createElement('div');
    wrapLgpd.className = 'campo-cadastro';
    const labelLgpd = document.createElement('label');
    labelLgpd.className = 'campo-lgpd';
    const inputLgpd = document.createElement('input');
    inputLgpd.type = 'checkbox';
    inputLgpd.id = 'ct-lgpd';
    inputLgpd.setAttribute('aria-describedby', 'ct-lgpd-erro');
    const textoLgpd = document.createElement('span');
    textoLgpd.textContent = 'Li e aceito a Política de Privacidade e o tratamento dos meus dados conforme a LGPD.';
    const erroLgpd = document.createElement('span');
    erroLgpd.className = 'erro-cadastro';
    erroLgpd.id = 'ct-lgpd-erro';
    erroLgpd.setAttribute('role', 'status');
    inputLgpd.addEventListener('change', () => { erroLgpd.textContent = ''; aviso.textContent = ''; });
    labelLgpd.append(inputLgpd, textoLgpd);
    wrapLgpd.append(labelLgpd, erroLgpd);
    form.appendChild(wrapLgpd);

    const botao = document.createElement('button');
    botao.type = 'submit';
    botao.className = 'enviar-cadastro';
    botao.textContent = 'Enviar mensagem';
    form.append(botao, aviso);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      aviso.textContent = '';
      let primeiro = null;
      const falha = (campo, msg) => { campo.erro.textContent = msg; if (!primeiro) primeiro = campo.input; };

      const nome = fNome.input.value.trim();
      const email = fEmail.input.value.trim();
      const tel = fTel.input.value.trim();
      const digitos = tel.replace(/\D/g, '');
      const mensagem = fMsg.input.value.trim();

      if (nome.length < 2) falha(fNome, 'Informe seu nome.');
      if (email && !EMAIL_RE.test(email)) falha(fEmail, 'Informe um e-mail válido.');
      if (tel && digitos.length < 10) falha(fTel, 'Informe o WhatsApp com DDD.');
      if (!email && !tel) falha(fEmail, 'Informe um e-mail ou WhatsApp para retornarmos.');
      if (!fAssunto.input.value) falha(fAssunto, 'Selecione o assunto.');
      if (mensagem.length < 5) falha(fMsg, 'Escreva sua mensagem.');
      if (!inputLgpd.checked){ erroLgpd.textContent = 'É necessário aceitar para enviar.'; if (!primeiro) primeiro = inputLgpd; }
      if (primeiro){ primeiro.focus(); return; }

      botao.disabled = true;
      botao.textContent = 'Enviando…';
      try {
        // grava a mensagem como lead (função pública "criar_lead_publico"); o texto vai em dados_extras.mensagem
        await SofipeSupabase.criarLead({
          nome,
          email,
          telefone: tel,
          interesse_principal: fAssunto.input.value,
          dados_extras: { origem: 'site-contato', mensagem, aceite_lgpd: true }
        });
        form.reset();
        aviso.textContent = 'Mensagem recebida! Nossa equipe vai entrar em contato em breve.';
      } catch (erro) {
        aviso.textContent = 'Não foi possível enviar agora. Tente novamente em instantes ou fale com a gente pelo WhatsApp.';
      } finally {
        botao.disabled = false;
        botao.textContent = 'Enviar mensagem';
      }
    });

    direita.append(formTitulo, formSub, form);
    corpo.append(esquerda, direita);
    texto.appendChild(corpo);
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
      { id: 'cad-interesse', label: 'Interesse principal', tipo: 'select', autocomplete: 'off',
        opcoes: ['Seguro Saúde', 'Seguro de Vida', 'Responsabilidade Civil', 'Seguro Residencial', 'Outro'] },
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

    // máscara do WhatsApp: (11) 91234-5678
    telefone.addEventListener('input', () => {
      const d = telefone.value.replace(/\D/g, '').slice(0, 11);
      let f = d;
      if (d.length > 10) f = d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
      else if (d.length > 6) f = d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
      else if (d.length > 2) f = d.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
      else if (d.length) f = '(' + d;
      telefone.value = f;
    });
    if (interesseSelecionado){
      interesse.value = interesseSelecionado;
      interesseSelecionado = null;
    }
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
      if (document.body.classList.contains('modo-equipe')){ e.preventDefault(); return; }  // logado: painel fica aberto
      fecharPainel();
      return;
    }

    const link = e.target.closest('[data-secao]');
    if (!link) return;
    e.preventDefault();

    const chave = link.dataset.secao;

    if (atual === chave){               // clicar de novo fecha (exceto logado: a tela nunca fica vazia)
      if (!document.body.classList.contains('modo-equipe')) fecharPainel();
      return;
    }

    const dado = textos[chave];
    if (!dado) return;

    titulo.textContent = dado.titulo;
    painel.classList.toggle('painel-seguros', dado.tipo === 'cotacoes');
    painel.classList.toggle('painel-quem', dado.tipo === 'quem');
    painel.classList.toggle('painel-contato', dado.tipo === 'contato');
    painel.classList.remove('painel-detalhe');
    painel.classList.toggle('painel-leads', dado.tipo === 'leads' || dado.tipo === 'equipe');
    montarConteudo(dado);

    painel.setAttribute('aria-hidden', 'false');
    painel.focus();
    atual = chave;
  });
})();

/* ---------------- aba de leads: gestor vê todos, vendedor vê só os seus ---------------- */
(function abaLeads(){
  const painel = document.getElementById('painel');
  const tituloPainel = document.getElementById('painel-titulo');
  const atalho = document.getElementById('atalho-leads');
  if (!painel) return;

  const ORIGENS = { 'site-cadastro': 'Cadastro no site', 'newsletter': 'Newsletter', 'chat_site': 'Chat da Sofia', 'site-contato': 'Fale conosco' };
  const POR_PAGINA = 25;
  const DIA = 864e5;
  let sessao = { usuario: null, perfil: null };
  let timer = null;

  const ehGestor = () => !!(sessao.perfil && ['admin', 'gestor'].includes(sessao.perfil.perfil));

  // o login (script acima) avisa quando alguém entra ou sai
  document.addEventListener('sofipe:login', e => {
    sessao = e.detail || sessao;
    if (atalho) atalho.hidden = false;
  });
  document.addEventListener('sofipe:logout', () => {
    sessao = { usuario: null, perfil: null };
    if (atalho) atalho.hidden = true;
    clearInterval(timer);
  });

  /* ---------- utilidades ---------- */
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const rotuloOrigem = o => (o ? (ORIGENS[o] || o) : 'Não informada');
  const dataBR = iso => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  };
  function linkWhats(tel){
    let d = String(tel || '').replace(/\D/g, '');
    if (d.length < 10) return null;
    if (d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d;
  }
  function mensagemErro(err){
    const msg = (err && err.message) || '';
    if ((err && err.code === 'PGRST202') || /could not find the function|does not exist/i.test(msg))
      return 'A aba de leads ainda não foi ativada no banco. Rode o arquivo supabase-leads-equipe.sql no SQL Editor do Supabase.';
    if (err && err.code === '42501') return 'Seu usuário não tem permissão para esta ação.';
    return 'Não foi possível carregar os leads agora. Tente atualizar.';
  }

  function normalizar(linha){
    const l = linha.lead || linha;
    const extras = l.dados_extras && typeof l.dados_extras === 'object' ? l.dados_extras : {};
    return {
      id: l.id,
      nome: l.nome || 'Sem nome',
      empresa: l.empresa || '',
      cargo: l.cargo || '',
      email: l.email || '',
      telefone: l.telefone || '',
      cpf_cnpj: l.cpf_cnpj || '',
      interesse: l.interesse_principal || '',
      extras,
      origem: extras.origem || '',
      responsavel_id: l.responsavel_id || null,
      responsavel_nome: l.responsavel_nome || '',
      criado: l.created_at || l.criado_em || null
    };
  }

  /* ---------- exportar CSV (abre direto no Excel em pt-BR) ---------- */
  function csvCelula(v){
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // evita fórmula maliciosa na planilha
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportarCsv(lista){
    const cab = ['Nome', 'Empresa', 'Cargo', 'E-mail', 'Telefone', 'CPF/CNPJ', 'Interesse', 'Origem', 'Responsável', 'Recebido em'];
    const linhas = [cab].concat(lista.map(l => [l.nome, l.empresa, l.cargo, l.email, l.telefone, l.cpf_cnpj, l.interesse, rotuloOrigem(l.origem), l.responsavel_nome, dataBR(l.criado)]));
    const csv = '\ufeff' + linhas.map(r => r.map(csvCelula).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads-sofipe-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- montagem da aba ---------- */
  async function montar(raiz){
    clearInterval(timer);
    const app = el('div', 'leads-app');
    raiz.appendChild(app);

    if (!sessao.usuario){
      try { sessao = await SofipeSupabase.sessaoAtual(); } catch (e) { /* segue sem sessão */ }
    }
    if (!sessao.usuario){
      app.appendChild(el('p', 'leads-vazio', 'Entre com a sua conta da equipe para ver os leads.'));
      return;
    }

    const gestor = ehGestor();
    tituloPainel.textContent = gestor ? 'Leads da equipe' : 'Meus leads';

    let leads = [];
    let equipe = [];
    let conhecidos = null;
    let destacar = new Set();
    let visiveis = POR_PAGINA;
    const filtro = { busca: '', origem: '', resp: '' };

    /* esqueleto */
    const resumo = el('div', 'leads-resumo');

    const barra = el('div', 'leads-barra');
    const rotBusca = el('label', 'leads-busca');
    rotBusca.appendChild(el('span', 'oculto', 'Buscar leads'));
    const inBusca = el('input');
    inBusca.type = 'search';
    inBusca.placeholder = 'Buscar por nome, empresa, e-mail ou telefone';
    rotBusca.appendChild(inBusca);

    const selOrigem = el('select', 'leads-select');
    selOrigem.setAttribute('aria-label', 'Filtrar por origem');
    const selResp = el('select', 'leads-select');
    selResp.setAttribute('aria-label', 'Filtrar por responsável');

    const btnAtualizar = el('button', 'leads-btn', 'Atualizar');
    btnAtualizar.type = 'button';
    const btnCsv = el('button', 'leads-btn', 'Exportar CSV');
    btnCsv.type = 'button';

    barra.append(rotBusca, selOrigem);
    if (gestor) barra.appendChild(selResp);
    barra.append(btnAtualizar, btnCsv);

    const carga = el('div', 'leads-carga');
    const aviso = el('p', 'leads-aviso');
    aviso.setAttribute('role', 'status');
    const wrap = el('div', 'leads-tabela-wrap');
    const maisBtn = el('button', 'leads-btn leads-mais', 'Mostrar mais');
    maisBtn.type = 'button';
    maisBtn.hidden = true;

    app.append(resumo, barra);
    if (gestor) app.appendChild(carga);
    app.append(aviso, wrap, maisBtn);

    /* ---------- filtros ---------- */
    function filtrados(){
      const q = semAcento(filtro.busca);
      const qDig = filtro.busca.replace(/\D/g, '');
      return leads.filter(l => {
        if (filtro.origem && (l.origem || '_') !== filtro.origem) return false;
        if (filtro.resp && l.responsavel_id !== filtro.resp) return false;
        if (!q) return true;
        const texto = semAcento([l.nome, l.empresa, l.email, l.interesse].join(' '));
        return texto.includes(q) || (qDig.length >= 3 && l.telefone.replace(/\D/g, '').includes(qDig));
      });
    }

    function preencherSelect(sel, padrao, itens, atual){
      sel.innerHTML = '';
      const o0 = el('option', null, padrao);
      o0.value = '';
      sel.appendChild(o0);
      itens.forEach(([valor, rotulo]) => {
        const o = el('option', null, rotulo);
        o.value = valor;
        sel.appendChild(o);
      });
      sel.value = itens.some(([v]) => v === atual) ? atual : '';
    }

    /* ---------- desenho ---------- */
    function kpi(valor, rotulo, variante){
      const c = el('div', 'leads-kpi ' + variante);
      c.append(el('strong', null, String(valor)), el('span', null, rotulo));
      return c;
    }

    function render(){
      const agora = new Date();
      const hoje = leads.filter(l => l.criado && new Date(l.criado).toDateString() === agora.toDateString()).length;
      const semana = leads.filter(l => l.criado && agora - new Date(l.criado) < 7 * DIA).length;
      resumo.innerHTML = '';
      resumo.append(
        kpi(leads.length, gestor ? 'Total de leads' : 'Meus leads', 'kpi-amarelo'),
        kpi(hoje, 'Chegaram hoje', 'kpi-petroleo'),
        kpi(semana, 'Últimos 7 dias', 'kpi-escuro')
      );
      if (gestor) resumo.appendChild(kpi(equipe.filter(m => m.perfil === 'vendedor').length, 'Vendedores na equipe', 'kpi-escuro'));

      // origens e responsáveis presentes na lista
      const origens = [...new Set(leads.map(l => l.origem || '_'))].map(o => [o, o === '_' ? 'Não informada' : rotuloOrigem(o)]);
      preencherSelect(selOrigem, 'Todas as origens', origens, filtro.origem);
      filtro.origem = selOrigem.value;
      if (gestor){
        const resp = new Map();
        leads.forEach(l => { if (l.responsavel_id) resp.set(l.responsavel_id, l.responsavel_nome || 'Sem nome'); });
        preencherSelect(selResp, 'Todos os responsáveis', [...resp.entries()], filtro.resp);
        filtro.resp = selResp.value;

        carga.innerHTML = '';
        const contagem = new Map();
        leads.forEach(l => contagem.set(l.responsavel_id, (contagem.get(l.responsavel_id) || 0) + 1));
        [...contagem.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, n]) => {
          const chip = el('button', 'leads-chip' + (filtro.resp === id ? ' ativo' : ''), (resp.get(id) || 'Sem responsável') + ' · ' + n);
          chip.type = 'button';
          chip.addEventListener('click', () => {
            filtro.resp = filtro.resp === id ? '' : (id || '');
            selResp.value = filtro.resp;
            visiveis = POR_PAGINA;
            render();
          });
          carga.appendChild(chip);
        });
      }

      const lista = filtrados();
      wrap.innerHTML = '';
      if (!lista.length){
        wrap.appendChild(el('p', 'leads-vazio', leads.length
          ? 'Nenhum lead encontrado com esses filtros.'
          : (gestor ? 'Nenhum lead cadastrado ainda.' : 'Você ainda não recebeu leads. Assim que um novo cadastro chegar, ele aparece aqui.')));
        maisBtn.hidden = true;
        return;
      }

      const tabela = el('table', 'leads-tabela');
      const cab = ['Lead', 'Contato', 'Interesse', 'Origem'].concat(gestor ? ['Responsável'] : [], ['Recebido em']);
      const trh = el('tr');
      cab.forEach(t => { const th = el('th', null, t); th.scope = 'col'; trh.appendChild(th); });
      const thead = el('thead');
      thead.appendChild(trh);
      const tbody = el('tbody');

      lista.slice(0, visiveis).forEach(l => {
        const tr = el('tr', destacar.has(l.id) ? 'leads-destaque' : '');
        tr.addEventListener('click', e => { if (!e.target.closest('a, button')) abrirDetalhe(l); });
        const celula = (rotulo, ...nos) => { const td = el('td'); td.dataset.label = rotulo; td.append(...nos); tr.appendChild(td); return td; };

        const nomeBtn = el('button', 'leads-nome', l.nome);
        nomeBtn.type = 'button';
        nomeBtn.addEventListener('click', () => abrirDetalhe(l));
        const tdNome = celula('Lead', nomeBtn);
        if (l.criado && new Date() - new Date(l.criado) < DIA) tdNome.appendChild(el('span', 'leads-selo', 'Novo'));
        if (l.empresa) tdNome.appendChild(el('span', 'leads-sub', l.empresa));

        celula('Contato', el('span', null, l.telefone || '—'), ...(l.email ? [el('span', 'leads-sub', l.email)] : []));
        celula('Interesse', document.createTextNode(l.interesse || '—'));
        celula('Origem', document.createTextNode(rotuloOrigem(l.origem)));
        if (gestor) celula('Responsável', document.createTextNode(l.responsavel_nome || '—'));
        celula('Recebido em', document.createTextNode(dataBR(l.criado)));
        tbody.appendChild(tr);
      });

      tabela.append(thead, tbody);
      wrap.appendChild(tabela);
      maisBtn.hidden = lista.length <= visiveis;
      maisBtn.textContent = 'Mostrar mais (' + (lista.length - visiveis) + ')';
    }

    /* ---------- detalhe do lead ---------- */
    function abrirDetalhe(l){
      const dlg = el('dialog', 'leads-detalhe');
      dlg.setAttribute('aria-labelledby', 'leads-detalhe-titulo');
      const corpo = el('div', 'leads-detalhe-corpo');

      const topo = el('div', 'leads-detalhe-topo');
      const h3 = el('h3', null, l.nome);
      h3.id = 'leads-detalhe-titulo';
      const fechar = el('button', 'leads-fechar', '×');
      fechar.type = 'button';
      fechar.setAttribute('aria-label', 'Fechar');
      fechar.addEventListener('click', () => dlg.close());
      topo.append(h3, fechar);

      const ficha = el('dl', 'leads-ficha');
      const extras = l.extras || {};
      const linhas = [
        ['Empresa', l.empresa], ['Cargo', l.cargo], ['E-mail', l.email], ['WhatsApp', l.telefone],
        ['CPF ou CNPJ', l.cpf_cnpj], ['Interesse', l.interesse],
        ['Possui CNPJ ou MEI', extras.possui_cnpj_mei],
        ['Origem', rotuloOrigem(l.origem)], ['Recebido em', dataBR(l.criado)],
        ['Responsável', l.responsavel_nome],
        ['Distribuição', extras.atribuicao === 'automatica' ? 'Automática' : ''],
        ['Aceite LGPD', extras.aceite_lgpd ? 'Sim' : '']
      ];
      Object.keys(extras).filter(k => !['origem', 'possui_cnpj_mei', 'atribuicao', 'aceite_lgpd'].includes(k) && ['string', 'number'].includes(typeof extras[k]))
        .forEach(k => linhas.push([k.replace(/_/g, ' '), extras[k]]));
      linhas.filter(([, v]) => v).forEach(([r, v]) => ficha.append(el('dt', null, r), el('dd', null, String(v))));

      const acoes = el('div', 'leads-acoes');
      const zap = linkWhats(l.telefone);
      const add = (txt, href, principal, externo) => {
        const a = el('a', 'leads-acao' + (principal ? ' principal' : ''), txt);
        a.href = href;
        if (externo){ a.target = '_blank'; a.rel = 'noopener'; }
        acoes.appendChild(a);
      };
      if (zap) add('Chamar no WhatsApp', zap, true, true);
      if (l.telefone) add('Ligar', 'tel:' + l.telefone.replace(/[^\d+]/g, ''), false, false);
      if (l.email) add('Enviar e-mail', 'mailto:' + l.email, false, false);

      corpo.append(topo, ficha, acoes);

      if (gestor){
        const bloco = el('div', 'leads-reatribuir');
        const rot = el('label', null, 'Reatribuir para');
        rot.setAttribute('for', 'leads-resp-sel');
        const sel = el('select', 'leads-select');
        sel.id = 'leads-resp-sel';
        equipe.forEach(m => {
          const o = el('option', null, m.nome + ' (' + m.perfil + ') · ' + m.total_leads + ' leads');
          o.value = m.id;
          sel.appendChild(o);
        });
        if (l.responsavel_id) sel.value = l.responsavel_id;
        const salvar = el('button', 'leads-btn primario', 'Reatribuir');
        salvar.type = 'button';
        const msg = el('p', 'leads-aviso');
        msg.setAttribute('role', 'status');

        salvar.addEventListener('click', async () => {
          if (!sel.value || sel.value === l.responsavel_id){ msg.textContent = 'Escolha outro responsável.'; return; }
          salvar.disabled = true;
          msg.textContent = 'Salvando…';
          try {
            await SofipeSupabase.reatribuirLead(l.id, sel.value);
            const m = equipe.find(x => x.id === sel.value);
            l.responsavel_id = sel.value;
            l.responsavel_nome = m ? m.nome : '';
            msg.textContent = 'Lead reatribuído para ' + l.responsavel_nome + '.';
            carregarEquipe().then(render);
            render();
          } catch (err) {
            msg.textContent = 'Não foi possível reatribuir agora.';
          } finally {
            salvar.disabled = false;
          }
        });

        if (equipe.length){
          bloco.append(rot, sel, salvar, msg);
          corpo.appendChild(bloco);
        }
      }

      dlg.appendChild(corpo);
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => dlg.remove());
      app.appendChild(dlg);
      dlg.showModal();
    }

    /* ---------- dados ---------- */
    async function carregarEquipe(){
      if (!gestor) return;
      try { equipe = await SofipeSupabase.listarEquipe(); } catch (e) { equipe = []; }
    }

    async function carregar(silencioso){
      if (!silencioso) aviso.textContent = 'Carregando leads…';
      btnAtualizar.disabled = true;
      try {
        leads = (await SofipeSupabase.listarLeadsEquipe()).map(normalizar);
        destacar = new Set();
        aviso.textContent = '';
        if (conhecidos){
          const chegaram = leads.filter(l => !conhecidos.has(l.id));
          destacar = new Set(chegaram.map(l => l.id));
          if (chegaram.length) aviso.textContent = chegaram.length === 1 ? '1 novo lead chegou.' : chegaram.length + ' novos leads chegaram.';
        }
        conhecidos = new Set(leads.map(l => l.id));
        render();
      } catch (err) {
        aviso.textContent = mensagemErro(err);
      } finally {
        btnAtualizar.disabled = false;
      }
    }

    /* ---------- eventos ---------- */
    inBusca.addEventListener('input', () => { filtro.busca = inBusca.value; visiveis = POR_PAGINA; render(); });
    selOrigem.addEventListener('change', () => { filtro.origem = selOrigem.value; visiveis = POR_PAGINA; render(); });
    selResp.addEventListener('change', () => { filtro.resp = selResp.value; visiveis = POR_PAGINA; render(); });
    maisBtn.addEventListener('click', () => { visiveis += POR_PAGINA; render(); });
    btnAtualizar.addEventListener('click', () => { carregarEquipe(); carregar(false); });
    btnCsv.addEventListener('click', () => {
      const lista = filtrados();
      if (!lista.length){ aviso.textContent = 'Não há leads para exportar com esses filtros.'; return; }
      exportarCsv(lista);
    });

    await carregarEquipe();
    await carregar(false);

    // atualiza sozinho a cada minuto enquanto a aba estiver aberta
    timer = setInterval(() => {
      if (!app.isConnected){ clearInterval(timer); return; }
      if (painel.getAttribute('aria-hidden') === 'false' && !document.hidden) carregar(true);
    }, 60000);
  }

  window.SofipeLeads = { montar };
})();

/* ---------------- aba de equipe: gestores cadastram e gerenciam operadores ---------------- */
(function abaEquipe(){
  const atalho = document.getElementById('atalho-equipe');
  const tituloPainel = document.getElementById('painel-titulo');
  let sessao = { usuario: null, perfil: null };

  const papel = () => (sessao.perfil && sessao.perfil.perfil) || '';
  const ehGestor = () => ['admin', 'gestor'].includes(papel());
  const ROTULOS = { admin: 'Administrador', gestor: 'Gestor', vendedor: 'Vendedor' };

  document.addEventListener('sofipe:login', e => {
    sessao = e.detail || sessao;
    if (atalho) atalho.hidden = !ehGestor();
  });
  document.addEventListener('sofipe:logout', () => {
    sessao = { usuario: null, perfil: null };
    if (atalho) atalho.hidden = true;
  });

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const dataBR = iso => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca entrou';
  };

  async function montar(raiz){
    const app = el('div', 'leads-app');
    raiz.appendChild(app);
    tituloPainel.textContent = 'Equipe';

    if (!sessao.usuario){
      try { sessao = await SofipeSupabase.sessaoAtual(); } catch (e) { /* segue */ }
    }
    if (!ehGestor()){
      app.appendChild(el('p', 'leads-vazio', 'Apenas gestores têm acesso à gestão da equipe.'));
      return;
    }
    const souAdmin = papel() === 'admin';

    /* ---------- formulário de novo operador ---------- */
    const bloco = el('form', 'equipe-form');
    bloco.noValidate = true;
    bloco.setAttribute('aria-label', 'Cadastrar novo operador');
    bloco.appendChild(el('h3', null, 'Cadastrar novo operador'));

    const campo = (id, rotulo, tipo, placeholder, auto) => {
      const w = el('div', 'equipe-campo');
      const l = el('label', 'oculto', rotulo);
      l.setAttribute('for', id);
      const i = el('input');
      i.id = id; i.type = tipo; i.placeholder = placeholder; i.autocomplete = auto || 'off';
      w.append(l, i);
      return { w, i };
    };
    const fNome = campo('eq-nome', 'Nome do operador', 'text', 'Nome completo', 'off');
    const fEmail = campo('eq-email', 'E-mail do operador', 'email', 'E-mail de acesso', 'off');
    const fSenha = campo('eq-senha', 'Senha inicial (opcional)', 'text', 'Senha inicial (vazio = gerar automática)', 'new-password');
    fSenha.i.maxLength = 64;

    const wPerfil = el('div', 'equipe-campo');
    const lPerfil = el('label', 'oculto', 'Perfil');
    lPerfil.setAttribute('for', 'eq-perfil');
    const sPerfil = el('select', 'leads-select');
    sPerfil.id = 'eq-perfil';
    [['vendedor', 'Vendedor']].concat(souAdmin ? [['gestor', 'Gestor'], ['admin', 'Administrador']] : []).forEach(([v, t]) => {
      const o = el('option', null, t); o.value = v; sPerfil.appendChild(o);
    });
    wPerfil.append(lPerfil, sPerfil);

    const enviar = el('button', 'leads-btn primario', 'Cadastrar operador');
    enviar.type = 'submit';
    const aviso = el('p', 'leads-aviso');
    aviso.setAttribute('role', 'status');
    const cred = el('div', 'equipe-cred');
    cred.hidden = true;

    bloco.append(fNome.w, fEmail.w, wPerfil, fSenha.w, enviar, aviso, cred);

    /* ---------- lista ---------- */
    const listaWrap = el('div', 'leads-tabela-wrap');
    const avisoLista = el('p', 'leads-aviso');
    avisoLista.setAttribute('role', 'status');
    app.append(bloco, avisoLista, listaWrap);

    function mostrarCredenciais(titulo, email, senha){
      cred.hidden = false;
      cred.innerHTML = '';
      const info = el('div');
      info.append(el('strong', null, titulo));
      const dl = el('dl', 'leads-ficha');
      if (email) dl.append(el('dt', null, 'Login'), el('dd', null, email));
      dl.append(el('dt', null, 'Senha'), el('dd', 'equipe-senha', senha));
      info.appendChild(dl);
      info.appendChild(el('p', 'leads-sub', 'Anote agora e repasse ao operador por um canal seguro. Por segurança a senha não fica salva e não poderá ser vista de novo. Se for perdida, use "Redefinir senha".'));
      const copiar = el('button', 'leads-btn', 'Copiar senha');
      copiar.type = 'button';
      copiar.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(senha); copiar.textContent = 'Copiado!'; }
        catch (e) { copiar.textContent = 'Selecione e copie manualmente'; }
      });
      const ok = el('button', 'leads-btn', 'Já anotei');
      ok.type = 'button';
      ok.addEventListener('click', () => { cred.hidden = true; cred.innerHTML = ''; });
      const linha = el('div', 'leads-acoes');
      linha.append(copiar, ok);
      cred.append(info, linha);
      cred.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function desenhar(equipe){
      listaWrap.innerHTML = '';
      if (!equipe.length){
        listaWrap.appendChild(el('p', 'leads-vazio', 'Nenhum operador cadastrado ainda.'));
        return;
      }
      const tabela = el('table', 'leads-tabela equipe-tabela');
      const trh = el('tr');
      ['Nome', 'E-mail', 'Perfil', 'Status', 'Último acesso', 'Ações'].forEach(t => {
        const th = el('th', null, t); th.scope = 'col'; trh.appendChild(th);
      });
      const thead = el('thead'); thead.appendChild(trh);
      const tbody = el('tbody');

      equipe.forEach(m => {
        const tr = el('tr');
        tr.style.cursor = 'default';
        const td = (rotulo, ...nos) => { const c = el('td'); c.dataset.label = rotulo; c.append(...nos); tr.appendChild(c); return c; };
        td('Nome', el('strong', null, m.nome || 'Sem nome'));
        td('E-mail', document.createTextNode(m.email || '—'));
        td('Perfil', document.createTextNode(ROTULOS[m.perfil] || m.perfil));
        td('Status', el('span', 'equipe-status ' + (m.ativo ? 'on' : 'off'), m.ativo ? 'Ativo' : 'Inativo'));
        td('Último acesso', document.createTextNode(dataBR(m.ultimo_acesso)));

        const acoes = td('Ações');
        if (m.pode_gerir){
          const reset = el('button', 'leads-btn', 'Redefinir senha');
          reset.type = 'button';
          reset.addEventListener('click', async () => {
            if (!confirm('Gerar uma nova senha para ' + m.nome + '? A senha atual deixa de valer.')) return;
            reset.disabled = true;
            try {
              const r = await SofipeSupabase.gerirEquipe({ action: 'redefinir_senha', id: m.id });
              mostrarCredenciais('Nova senha de ' + m.nome, m.email, r.senha);
            } catch (err) { avisoLista.textContent = err.message; }
            finally { reset.disabled = false; }
          });

          const status = el('button', 'leads-btn', m.ativo ? 'Desativar' : 'Reativar');
          status.type = 'button';
          status.addEventListener('click', async () => {
            if (m.ativo && !confirm('Desativar ' + m.nome + '? Ele perde o acesso ao site imediatamente. Os leads dele continuam salvos e podem ser reatribuídos.')) return;
            status.disabled = true;
            try {
              await SofipeSupabase.gerirEquipe({ action: 'alterar_status', id: m.id, ativo: !m.ativo });
              await carregar();
            } catch (err) { avisoLista.textContent = err.message; status.disabled = false; }
          });
          const grupo = el('div', 'equipe-acoes');
          grupo.append(reset, status);
          acoes.appendChild(grupo);
        } else {
          acoes.appendChild(document.createTextNode('—'));
        }
        tbody.appendChild(tr);
      });
      tabela.append(thead, tbody);
      listaWrap.appendChild(tabela);
    }

    async function carregar(){
      avisoLista.textContent = 'Carregando equipe…';
      try {
        const r = await SofipeSupabase.gerirEquipe({ action: 'listar' });
        avisoLista.textContent = '';
        desenhar(r.equipe || []);
      } catch (err) {
        avisoLista.textContent = err.message;
      }
    }

    /* ---------- cadastro ---------- */
    bloco.addEventListener('submit', async e => {
      e.preventDefault();
      const nome = fNome.i.value.trim();
      const email = fEmail.i.value.trim();
      const senha = fSenha.i.value;
      if (nome.length < 2){ aviso.textContent = 'Informe o nome do operador.'; fNome.i.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ aviso.textContent = 'Informe um e-mail válido.'; fEmail.i.focus(); return; }
      if (senha && senha.length < 8){ aviso.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; fSenha.i.focus(); return; }

      enviar.disabled = true;
      aviso.textContent = 'Cadastrando…';
      try {
        const r = await SofipeSupabase.gerirEquipe({ action: 'criar', nome, email, perfil: sPerfil.value, senha: senha || undefined });
        bloco.reset();
        aviso.textContent = 'Operador cadastrado! Ele já pode entrar e passa a entrar no rodízio de leads se for vendedor.';
        mostrarCredenciais('Acesso de ' + nome, r.email, r.senha);
        carregar();
      } catch (err) {
        aviso.textContent = err.message;
      } finally {
        enviar.disabled = false;
      }
    });

    carregar();
  }

  window.SofipeEquipe = { montar };
})();

/* ---------------- chatbot Sofia (Gemini via Edge Function; palavras-chave como reserva) ---------------- */
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
  const padrao = 'Não tenho certeza de que entendi. Posso ajudar com planos de saúde, outros seguros, cotação ou contato. Escolha uma opção abaixo ou fale com a nossa equipe: (11) 3740-2037.';

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

  // histórico da conversa (role/content), guardado na sessão do navegador
  const CHAVE_HIST = 'sofipe_hist_sofia';
  let historico = [];
  try { historico = JSON.parse(sessionStorage.getItem(CHAVE_HIST) || '[]'); } catch (e) { historico = []; }
  function salvarHistorico(){
    try { sessionStorage.setItem(CHAVE_HIST, JSON.stringify(historico.slice(-30))); } catch (e) { /* ignora */ }
  }

  // reserva: se o Gemini falhar (função fora do ar, sem internet), usa as regras por palavras-chave
  function respostaPorRegras(texto){
    const q = normalizar(texto);
    const regra = regras.find(r => r.re.test(q));
    return { texto: regra ? regra.t : padrao, botoes: regra && regra.botoes };
  }

  async function responder(texto){
    const digitando = balao('bot digitando', '•••');
    const sessionId = SofipeSupabase.obterSessaoId();

    // garante um lead para esta conversa e registra a mensagem do visitante
    // (tabela "interacoes_agente"); se isso falhar, o chat continua normalmente
    SofipeSupabase.obterOuCriarLeadChat().then(leadId => {
      if (leadId) SofipeSupabase.registrarInteracao({ lead_id: leadId, mensagem: texto, remetente: 'lead', sessao_id: sessionId });
    }).catch(() => {});

    historico.push({ role: 'user', content: texto });
    salvarHistorico();

    let resposta, botoes;
    try {
      const r = await SofipeSupabase.conversarSofia(historico.slice(-30), sessionId);
      resposta = r.resposta;
    } catch (erro) {
      console.warn('Gemini indisponível, usando respostas padrão:', erro && erro.message);
      const reserva = respostaPorRegras(texto);
      resposta = reserva.texto;
      botoes = reserva.botoes;
    }

    historico.push({ role: 'assistant', content: resposta });
    salvarHistorico();

    digitando.remove();
    const el = balao('bot', resposta);
    criarBotoes(el, botoes);
    rolar();

    SofipeSupabase.obterOuCriarLeadChat().then(leadId => {
      if (leadId) SofipeSupabase.registrarInteracao({ lead_id: leadId, mensagem: resposta, remetente: 'agente_ia', sessao_id: sessionId });
    }).catch(() => {});
  }

  let aguardando = false;
  function enviar(texto){
    texto = texto.trim();
    if (!texto) return;
    if (aguardando) return;
    aguardando = true;
    balao('eu', texto);
    responder(texto).finally(() => { aguardando = false; });
  }

  function abrirChat(){
    janela.hidden = false;
    abrir.hidden = true;                 // o botão some enquanto o chat está aberto
    abrir.setAttribute('aria-expanded', 'true');
    if (!msgs.children.length){
      if (historico.length){
        historico.forEach(m => balao(m.role === 'user' ? 'eu' : 'bot', m.content));
      } else {
        balao('bot', 'Olá! Eu sou a Sofia, assistente virtual da Sofipe. Como posso te ajudar hoje?');
      }
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
