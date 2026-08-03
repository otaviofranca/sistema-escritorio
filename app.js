// =====================================================================
// SISTEMA DE AGENDA DO CONSULTÓRIO — FRONTEND
// =====================================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

let sessao = null;
let profissionais = [];
let pacientes = [];
let confirmarComConflito = false;
let ultimoRelatorio = null;
let mesCalendario = new Date();

// ---------- API ----------
async function api(action, payload = {}) {
  const resposta = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  if (!resposta.ok) throw new Error('Falha de conexão com o servidor.');
  return resposta.json();
}

// ---------- Sessão ----------
function salvarSessao(dados) { sessao = dados; localStorage.setItem('sessaoConsultorio', JSON.stringify(dados)); }
function carregarSessaoSalva() {
  const bruto = localStorage.getItem('sessaoConsultorio');
  if (bruto) sessao = JSON.parse(bruto);
  return sessao;
}
function encerrarSessao() { localStorage.removeItem('sessaoConsultorio'); location.reload(); }

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto || '';
  return div.innerHTML;
}
function hoje() { return new Date().toISOString().slice(0, 10); }

// ---------- Inicialização ----------
document.addEventListener('DOMContentLoaded', () => {
  if (typeof API_URL === 'undefined' || API_URL.includes('COLE_AQUI')) {
    alert('Configuração pendente: defina API_URL no arquivo config.js');
    return;
  }

  document.getElementById('form-login').addEventListener('submit', tratarLogin);
  document.getElementById('btn-sair').addEventListener('click', (e) => { e.preventDefault(); encerrarSessao(); });

  // Navegação por abas
  document.getElementById('btn-aba-agenda').addEventListener('click', (e) => { e.preventDefault(); mostrarAba('agenda'); });
  document.getElementById('btn-aba-pacientes').addEventListener('click', (e) => { e.preventDefault(); mostrarAba('pacientes'); carregarListaPacientes(); });
  document.getElementById('btn-aba-relatorios').addEventListener('click', (e) => { e.preventDefault(); mostrarAba('relatorios'); });

  // Agenda
  document.getElementById('btn-nova-consulta').addEventListener('click', () => abrirModal());
  document.getElementById('btn-cancelar-modal').addEventListener('click', fecharModal);
  document.getElementById('form-consulta').addEventListener('submit', salvarConsulta);
  document.getElementById('filtro-profissional').addEventListener('change', carregarConsultas);
  document.getElementById('filtro-data').addEventListener('change', () => { atualizarTituloDia(); renderizarMiniCalendario(); carregarConsultas(); });
  document.getElementById('busca-paciente').addEventListener('input', debounce(buscarPorPaciente, 350));
  document.getElementById('consulta-paciente').addEventListener('input', debounce(sugerirPacientes, 250));

  // Mini calendário e navegação de dia
  document.getElementById('btn-hoje').addEventListener('click', () => irParaData(hoje()));
  document.getElementById('btn-dia-anterior').addEventListener('click', () => mudarDia(-1));
  document.getElementById('btn-dia-proximo').addEventListener('click', () => mudarDia(1));
  document.getElementById('btn-mes-anterior').addEventListener('click', () => { mesCalendario.setMonth(mesCalendario.getMonth() - 1); renderizarMiniCalendario(); });
  document.getElementById('btn-mes-proximo').addEventListener('click', () => { mesCalendario.setMonth(mesCalendario.getMonth() + 1); renderizarMiniCalendario(); });

  ['consulta-profissional', 'consulta-data', 'consulta-hora-inicio', 'consulta-hora-fim'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => { confirmarComConflito = false; esconderAvisoConflito(); });
  });

  // Pacientes
  document.getElementById('btn-novo-paciente').addEventListener('click', () => abrirModalPaciente());
  document.getElementById('btn-cancelar-paciente').addEventListener('click', () => document.getElementById('overlay-paciente').classList.add('oculto'));
  document.getElementById('form-paciente').addEventListener('submit', salvarPaciente);
  document.getElementById('busca-paciente-cadastro').addEventListener('input', debounce(carregarListaPacientes, 300));

  // Relatórios
  document.getElementById('btn-gerar-relatorio').addEventListener('click', gerarRelatorio);
  document.getElementById('btn-exportar-excel').addEventListener('click', exportarExcel);
  document.getElementById('btn-exportar-pdf').addEventListener('click', exportarPdf);

  // Admin
  document.getElementById('btn-admin').addEventListener('click', (e) => { e.preventDefault(); abrirAdmin(); });
  document.getElementById('btn-fechar-admin').addEventListener('click', () => document.getElementById('overlay-admin').classList.add('oculto'));
  document.getElementById('form-novo-profissional').addEventListener('submit', cadastrarProfissional);

  // Notificações
  document.getElementById('btn-notificacoes').addEventListener('click', (e) => { e.preventDefault(); abrirNotificacoes(); });
  document.getElementById('btn-fechar-notificacoes').addEventListener('click', () => document.getElementById('overlay-notificacoes').classList.add('oculto'));

  document.getElementById('filtro-data').value = hoje();
  document.getElementById('rel-data-inicio').value = primeiroDiaDoMes();
  document.getElementById('rel-data-fim').value = hoje();
  atualizarTituloDia();

  if (carregarSessaoSalva()) iniciarApp();
});

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function primeiroDiaDoMes() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// ---------- Login ----------
async function tratarLogin(e) {
  e.preventDefault();
  const usuario = document.getElementById('login-usuario').value.trim();
  const senha = document.getElementById('login-senha').value;
  const erroBox = document.getElementById('erro-login');
  erroBox.style.display = 'none';

  try {
    const r = await api('login', { usuario, senha });
    if (!r.success) { erroBox.textContent = r.error || 'Não foi possível entrar.'; erroBox.style.display = 'block'; return; }
    salvarSessao(r.profissional);
    iniciarApp();
  } catch (err) {
    erroBox.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
    erroBox.style.display = 'block';
  }
}

async function iniciarApp() {
  document.getElementById('tela-login').classList.add('oculto');
  document.getElementById('app').classList.remove('oculto');
  document.getElementById('nome-usuario-logado').textContent = sessao.nome;
  document.getElementById('perfil-usuario-logado').textContent = sessao.perfil === 'secretaria' ? 'Secretária' : (sessao.especialidade || 'Profissional');

  if (sessao.perfil === 'secretaria') {
    document.getElementById('btn-admin').classList.remove('oculto');
    document.getElementById('btn-notificacoes').classList.remove('oculto');
    atualizarContadorNotificacoes();
  }

  await carregarProfissionais();
  await carregarPacientes();
  configurarFiltroPorPerfil();
  atualizarTituloDia();
  renderizarMiniCalendario();
  await carregarConsultas();
  mostrarAba('agenda');
}

// ---------- Mini calendário e navegação de data ----------
function irParaData(dataISO) {
  document.getElementById('filtro-data').value = dataISO;
  mesCalendario = new Date(dataISO + 'T00:00:00');
  atualizarTituloDia();
  renderizarMiniCalendario();
  carregarConsultas();
}

function mudarDia(delta) {
  const atual = new Date(document.getElementById('filtro-data').value + 'T00:00:00');
  atual.setDate(atual.getDate() + delta);
  irParaData(atual.toISOString().slice(0, 10));
}

function atualizarTituloDia() {
  const dataISO = document.getElementById('filtro-data').value;
  const d = new Date(dataISO + 'T00:00:00');
  const formatado = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('titulo-dia').textContent = formatado.charAt(0).toUpperCase() + formatado.slice(1);
}

function renderizarMiniCalendario() {
  const titulo = mesCalendario.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  document.getElementById('mini-calendario-titulo').textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);

  const ano = mesCalendario.getFullYear();
  const mes = mesCalendario.getMonth();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const dataSelecionada = document.getElementById('filtro-data').value;

  const grade = document.getElementById('mini-calendario-grade');
  grade.innerHTML = '';

  // Dias do fim do mês anterior (preenchimento)
  const diasMesAnterior = new Date(ano, mes, 0).getDate();
  for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
    grade.appendChild(criarCelulaMiniCalendario(diasMesAnterior - i, true, null));
  }
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const iso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    grade.appendChild(criarCelulaMiniCalendario(dia, false, iso, iso === dataSelecionada));
  }
}

function criarCelulaMiniCalendario(numero, foraDoMes, iso, selecionado) {
  const el = document.createElement('div');
  el.className = 'dia-mini' + (foraDoMes ? ' fora-do-mes' : '') + (selecionado ? ' dia-selecionado' : '');
  el.textContent = numero;
  if (iso && !foraDoMes) el.addEventListener('click', () => irParaData(iso));
  return el;
}

// ---------- Navegação por abas ----------
function mostrarAba(nome) {
  ['agenda', 'pacientes', 'relatorios'].forEach(a => {
    document.getElementById('secao-' + a).classList.toggle('oculto', a !== nome);
    document.getElementById('btn-aba-' + a).classList.toggle('aba-ativa', a === nome);
  });
}

// ---------- Profissionais / Pacientes (listas de apoio) ----------
async function carregarProfissionais() {
  const r = await api('listProfissionais');
  profissionais = r.success ? r.profissionais : [];

  const selectFiltro = document.getElementById('filtro-profissional');
  const selectModal = document.getElementById('consulta-profissional');
  const selectRel = document.getElementById('rel-profissional');
  [selectFiltro, selectModal, selectRel].forEach(s => s.innerHTML = '');

  profissionais.forEach(p => {
    selectFiltro.appendChild(new Option(p.nome, p.id));
    selectModal.appendChild(new Option(p.nome, p.id));
    selectRel.appendChild(new Option(p.nome, p.id));
  });
}

async function carregarPacientes() {
  const r = await api('listPacientes');
  pacientes = r.success ? r.pacientes : [];
}

function configurarFiltroPorPerfil() {
  const selectFiltro = document.getElementById('filtro-profissional');
  const selectModal = document.getElementById('consulta-profissional');
  const selectRel = document.getElementById('rel-profissional');

  if (sessao.perfil !== 'secretaria') {
    selectFiltro.value = sessao.id; selectFiltro.disabled = true;
    selectModal.value = sessao.id; selectModal.disabled = true;
    selectRel.value = sessao.id; selectRel.disabled = true;
  } else {
    selectFiltro.insertBefore(new Option('Todos os profissionais', ''), selectFiltro.firstChild);
    selectFiltro.value = '';
    selectRel.insertBefore(new Option('Todos os profissionais', ''), selectRel.firstChild);
    selectRel.value = '';
  }
}

function nomeProfissional(id) {
  const p = profissionais.find(p => String(p.id) === String(id));
  return p ? p.nome : '—';
}

// ---------- Agenda: grade de horários ----------
const HORA_INICIO_GRADE = '07:00';
const HORA_FIM_GRADE = '19:00';
const INTERVALO_MINUTOS = 30;

function gerarSlots() {
  const slots = [];
  let [h, m] = HORA_INICIO_GRADE.split(':').map(Number);
  const [hFim, mFim] = HORA_FIM_GRADE.split(':').map(Number);
  while (h < hFim || (h === hFim && m < mFim)) {
    slots.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    m += INTERVALO_MINUTOS;
    if (m >= 60) { m -= 60; h++; }
  }
  return slots;
}

function proximoSlot(horaSlot) {
  let [h, m] = horaSlot.split(':').map(Number);
  m += INTERVALO_MINUTOS;
  if (m >= 60) { m -= 60; h++; }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

async function carregarConsultas() {
  const profissionalId = document.getElementById('filtro-profissional').value;
  const data = document.getElementById('filtro-data').value;
  const grade = document.getElementById('grade-horarios');
  grade.innerHTML = '<p class="vazio">Carregando...</p>';

  const r = await api('listConsultas', { profissionalId: profissionalId || undefined, data });
  if (!r.success) { grade.innerHTML = '<p class="vazio">Não foi possível carregar a agenda.</p>'; return; }

  const consultas = r.consultas.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  renderizarGradeDia(consultas);
  mostrarAlertaProximaConsulta(consultas, data);
}

function renderizarGradeDia(consultas) {
  const container = document.getElementById('grade-horarios');
  container.innerHTML = '';
  const slots = gerarSlots();
  const mostrarNomeProfissional = sessao.perfil === 'secretaria' && !document.getElementById('filtro-profissional').value;

  slots.forEach(slot => {
    const proximo = proximoSlot(slot);
    const consultasDoSlot = consultas.filter(c => c.status !== 'cancelado' && c.horaInicio >= slot && c.horaInicio < proximo);
    const canceladasDoSlot = consultas.filter(c => c.status === 'cancelado' && c.horaInicio >= slot && c.horaInicio < proximo);

    const linha = document.createElement('div');
    linha.className = 'linha-horario';

    const rotulo = document.createElement('div');
    rotulo.className = 'rotulo-horario';
    rotulo.textContent = slot;
    linha.appendChild(rotulo);

    const conteudo = document.createElement('div');
    conteudo.className = 'conteudo-horario';

    const todasDoSlot = [...consultasDoSlot, ...canceladasDoSlot];
    if (todasDoSlot.length === 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-vazio';
      btn.innerHTML = '+ Adicionar agendamento';
      btn.addEventListener('click', () => abrirModal(null, slot));
      conteudo.appendChild(btn);
    } else {
      const coluna = document.createElement('div');
      coluna.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%';
      todasDoSlot.forEach(c => coluna.appendChild(criarLinhaConsulta(c, mostrarNomeProfissional)));
      conteudo.appendChild(coluna);
    }

    linha.appendChild(conteudo);
    container.appendChild(linha);
  });
}

function renderizarListaBusca(consultas) {
  const container = document.getElementById('grade-horarios');
  container.innerHTML = '';
  if (consultas.length === 0) { container.innerHTML = '<p class="vazio">Nenhuma consulta encontrada.</p>'; return; }

  consultas.forEach(c => {
    const linha = document.createElement('div');
    linha.className = 'linha-horario';
    const rotulo = document.createElement('div');
    rotulo.className = 'rotulo-horario';
    rotulo.textContent = c.data.split('-').reverse().join('/');
    linha.appendChild(rotulo);

    const conteudo = document.createElement('div');
    conteudo.className = 'conteudo-horario';
    conteudo.appendChild(criarLinhaConsulta(c, sessao.perfil === 'secretaria'));
    linha.appendChild(conteudo);
    container.appendChild(linha);
  });
}

function mostrarAlertaProximaConsulta(consultas, dataFiltro) {
  const box = document.getElementById('alerta-proxima');
  if (dataFiltro !== hoje()) { box.classList.add('oculto'); return; }

  const agora = new Date();
  const horaAtual = agora.toTimeString().slice(0, 5);
  const proxima = consultas
    .filter(c => c.status !== 'cancelado' && c.horaInicio >= horaAtual)
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))[0];

  if (proxima) {
    box.textContent = `⏰ Próxima consulta: ${proxima.horaInicio} — ${proxima.paciente}${sessao.perfil === 'secretaria' ? ' (' + nomeProfissional(proxima.profissionalId) + ')' : ''}`;
    box.classList.remove('oculto');
  } else {
    box.classList.add('oculto');
  }
}

function criarLinhaConsulta(c, mostrarNomeProfissional) {
  const div = document.createElement('div');
  div.className = 'slot-consulta status-' + c.status;
  div.innerHTML = `
    <span class="horario-slot">${c.horaInicio}–${c.horaFim}</span>
    <span class="paciente-slot">${escapeHtml(c.paciente)}${mostrarNomeProfissional ? ' · ' + escapeHtml(nomeProfissional(c.profissionalId)) : ''}</span>
    ${c.observacoes ? `<span class="obs-slot">${escapeHtml(c.observacoes)}</span>` : ''}
    <span class="tag-status">${rotuloStatus(c.status)}</span>
    <span class="acoes-slot">
      <button type="button" class="btn-texto btn-editar">Editar</button>
      ${c.status !== 'cancelado' ? '<button type="button" class="btn-texto btn-desmarcar" style="color:#A64B3B">Desmarcar</button>' : ''}
    </span>
  `;
  div.querySelector('.btn-editar').addEventListener('click', (e) => { e.stopPropagation(); abrirModal(c); });
  const btnDesmarcar = div.querySelector('.btn-desmarcar');
  if (btnDesmarcar) btnDesmarcar.addEventListener('click', (e) => { e.stopPropagation(); desmarcarConsulta(c.id); });
  return div;
}

function rotuloStatus(status) {
  return { agendado: 'Agendado', confirmado: 'Confirmado', realizado: 'Realizado', cancelado: 'Cancelado', falta: 'Falta' }[status] || status;
}

async function desmarcarConsulta(id) {
  if (!confirm('Desmarcar esta consulta?')) return;
  const r = await api('cancelarConsulta', { id, alteradoPor: sessao.nome, solicitantePerfil: sessao.perfil });
  if (r.success) carregarConsultas();
  else alert('Não foi possível desmarcar: ' + r.error);
}

async function buscarPorPaciente() {
  const termo = document.getElementById('busca-paciente').value.trim();
  if (!termo) { carregarConsultas(); return; }
  const r = await api('buscarConsultas', { termo });
  if (r.success) renderizarListaBusca(r.consultas.sort((a, b) => (b.data + b.horaInicio).localeCompare(a.data + a.horaInicio)));
}

// ---------- Modal de consulta ----------
function abrirModal(consulta, horaSugerida) {
  confirmarComConflito = false;
  esconderAvisoConflito();
  const form = document.getElementById('form-consulta');
  form.reset();
  document.getElementById('area-historico-consulta').innerHTML = '';

  document.getElementById('titulo-modal').textContent = consulta ? 'Editar consulta' : 'Nova consulta';
  document.getElementById('consulta-id').value = consulta ? consulta.id : '';
  document.getElementById('consulta-paciente-id').value = consulta ? (consulta.pacienteId || '') : '';
  document.getElementById('consulta-paciente').value = consulta ? consulta.paciente : '';
  document.getElementById('consulta-data').value = consulta ? consulta.data : document.getElementById('filtro-data').value;
  document.getElementById('consulta-hora-inicio').value = consulta ? consulta.horaInicio : (horaSugerida || '');
  document.getElementById('consulta-hora-fim').value = consulta ? consulta.horaFim : (horaSugerida ? proximoSlot(horaSugerida) : '');
  document.getElementById('consulta-status').value = consulta ? consulta.status : 'agendado';
  document.getElementById('consulta-valor').value = consulta ? (consulta.valor || '') : '';
  document.getElementById('consulta-pagamento').value = consulta ? (consulta.statusPagamento || 'pendente') : 'pendente';
  document.getElementById('consulta-forma-pagamento').value = consulta ? (consulta.formaPagamento || '') : '';
  document.getElementById('consulta-obs').value = consulta ? (consulta.observacoes || '') : '';

  const selectModal = document.getElementById('consulta-profissional');
  if (sessao.perfil !== 'secretaria') selectModal.value = sessao.id;
  else selectModal.value = consulta ? consulta.profissionalId : document.getElementById('filtro-profissional').value;

  if (consulta) carregarHistoricoConsulta(consulta.id);

  document.getElementById('overlay-modal').classList.remove('oculto');
}
function fecharModal() { document.getElementById('overlay-modal').classList.add('oculto'); }

async function carregarHistoricoConsulta(consultaId) {
  const r = await api('listLogConsulta', { consultaId });
  if (!r.success || r.log.length === 0) return;
  const area = document.getElementById('area-historico-consulta');
  area.innerHTML = `<details style="margin-bottom:16px"><summary style="cursor:pointer;color:var(--azul-medio);font-size:0.88rem">Histórico de alterações (${r.log.length})</summary>
    <div style="font-size:0.82rem;color:var(--texto-suave);margin-top:8px">
      ${r.log.map(l => `<div style="padding:4px 0;border-bottom:1px solid var(--borda)">${escapeHtml(l.acao)} por ${escapeHtml(l.usuario)} — ${new Date(l.dataHora).toLocaleString('pt-BR')}${l.detalhes ? ' — ' + escapeHtml(l.detalhes) : ''}</div>`).join('')}
    </div></details>`;
}

// Autocomplete de paciente no formulário de consulta
function sugerirPacientes() {
  const termo = document.getElementById('consulta-paciente').value.trim().toLowerCase();
  const box = document.getElementById('sugestoes-paciente');
  if (!termo) { box.classList.add('oculto'); return; }

  const encontrados = pacientes.filter(p => p.nome.toLowerCase().includes(termo)).slice(0, 6);
  if (encontrados.length === 0) { box.classList.add('oculto'); return; }

  box.innerHTML = '';
  encontrados.forEach(p => {
    const item = document.createElement('div');
    item.textContent = p.nome + (p.telefone ? ' · ' + p.telefone : '');
    item.addEventListener('click', () => {
      document.getElementById('consulta-paciente').value = p.nome;
      document.getElementById('consulta-paciente-id').value = p.id;
      box.classList.add('oculto');
    });
    box.appendChild(item);
  });
  box.classList.remove('oculto');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#sugestoes-paciente') && e.target.id !== 'consulta-paciente') {
    document.getElementById('sugestoes-paciente')?.classList.add('oculto');
  }
});

function mostrarAvisoConflito(msg) { const box = document.getElementById('aviso-conflito'); box.textContent = msg; box.style.display = 'block'; }
function esconderAvisoConflito() { document.getElementById('aviso-conflito').style.display = 'none'; }

async function salvarConsulta(e) {
  e.preventDefault();

  // Se o nome digitado não bate mais com o paciente selecionado, trata como paciente novo.
  const nomeDigitado = document.getElementById('consulta-paciente').value.trim();
  const pacienteSelecionado = pacientes.find(p => String(p.id) === document.getElementById('consulta-paciente-id').value);
  const pacienteId = (pacienteSelecionado && pacienteSelecionado.nome === nomeDigitado) ? pacienteSelecionado.id : '';

  const dados = {
    id: document.getElementById('consulta-id').value || undefined,
    profissionalId: document.getElementById('consulta-profissional').value,
    pacienteId: pacienteId || undefined,
    paciente: nomeDigitado,
    data: document.getElementById('consulta-data').value,
    horaInicio: document.getElementById('consulta-hora-inicio').value,
    horaFim: document.getElementById('consulta-hora-fim').value,
    status: document.getElementById('consulta-status').value,
    valor: document.getElementById('consulta-valor').value,
    statusPagamento: document.getElementById('consulta-pagamento').value,
    formaPagamento: document.getElementById('consulta-forma-pagamento').value,
    observacoes: document.getElementById('consulta-obs').value.trim()
  };

  if (dados.horaFim <= dados.horaInicio) { alert('O horário de fim precisa ser depois do horário de início.'); return; }

  if (!confirmarComConflito) {
    const c = await api('checarConflito', { profissionalId: dados.profissionalId, data: dados.data, horaInicio: dados.horaInicio, horaFim: dados.horaFim, ignorarId: dados.id });
    if (c.success && c.temConflito) {
      const detalhes = c.conflitos.map(x => `${x.paciente} (${x.horaInicio}–${x.horaFim})`).join(', ');
      mostrarAvisoConflito(`⚠ Este horário já está ocupado com: ${detalhes}. Clique em "Salvar" novamente para confirmar mesmo assim.`);
      confirmarComConflito = true;
      return;
    }
  }

  const acao = dados.id ? 'atualizarConsulta' : 'criarConsulta';
  const r = await api(acao, { ...dados, criadoPor: sessao.nome });

  if (r.success) {
    fecharModal();
    carregarConsultas();
    carregarPacientes();
  } else {
    alert('Não foi possível salvar: ' + r.error);
  }
}

// ---------- Pacientes ----------
async function carregarListaPacientes() {
  await carregarPacientes();
  const termo = document.getElementById('busca-paciente-cadastro').value.trim().toLowerCase();
  const lista = termo ? pacientes.filter(p => p.nome.toLowerCase().includes(termo)) : pacientes;
  const container = document.getElementById('lista-pacientes');

  if (lista.length === 0) { container.innerHTML = '<p class="vazio">Nenhum paciente cadastrado ainda.</p>'; return; }

  container.innerHTML = '';
  lista.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(p => {
    const div = document.createElement('div');
    div.className = 'card-consulta';
    div.innerHTML = `
      <div class="detalhes">
        <div class="paciente">${escapeHtml(p.nome)}</div>
        <div class="obs">${escapeHtml(p.telefone || '')} ${p.email ? '· ' + escapeHtml(p.email) : ''}</div>
      </div>
      <div class="acoes"><button class="btn-texto btn-abrir-paciente">Ver / editar</button></div>
    `;
    div.querySelector('.btn-abrir-paciente').addEventListener('click', () => abrirModalPaciente(p));
    container.appendChild(div);
  });
}

async function abrirModalPaciente(paciente) {
  const form = document.getElementById('form-paciente');
  form.reset();
  document.getElementById('titulo-modal-paciente').textContent = paciente ? 'Editar paciente' : 'Novo paciente';
  document.getElementById('paciente-id').value = paciente ? paciente.id : '';
  document.getElementById('paciente-nome').value = paciente ? paciente.nome : '';
  document.getElementById('paciente-telefone').value = paciente ? (paciente.telefone || '') : '';
  document.getElementById('paciente-email').value = paciente ? (paciente.email || '') : '';
  document.getElementById('paciente-obs').value = paciente ? (paciente.observacoes || '') : '';
  document.getElementById('area-historico-paciente').innerHTML = '';

  document.getElementById('overlay-paciente').classList.remove('oculto');

  if (paciente) {
    const r = await api('historicoPaciente', { pacienteId: paciente.id });
    if (r.success) {
      const area = document.getElementById('area-historico-paciente');
      if (r.consultas.length === 0) {
        area.innerHTML = '<p class="obs">Nenhuma consulta registrada para este paciente ainda.</p>';
      } else {
        area.innerHTML = `<h3 style="font-size:0.95rem">Histórico de consultas</h3>
          <div style="max-height:220px;overflow-y:auto;margin-bottom:16px">
          ${r.consultas.map(c => `<div style="padding:8px 0;border-bottom:1px solid var(--borda);font-size:0.86rem">
              <strong>${c.data} ${c.horaInicio}</strong> — ${nomeProfissional(c.profissionalId)} — ${rotuloStatus(c.status)}
              ${c.valor ? ' — R$ ' + Number(c.valor).toFixed(2) + ' (' + (c.statusPagamento === 'pago' ? 'pago' : 'pendente') + ')' : ''}
              ${c.observacoes ? '<div class="obs">' + escapeHtml(c.observacoes) + '</div>' : ''}
            </div>`).join('')}
          </div>`;
      }
    }
  }
}

async function salvarPaciente(e) {
  e.preventDefault();
  const id = document.getElementById('paciente-id').value;
  const dados = {
    id: id || undefined,
    nome: document.getElementById('paciente-nome').value.trim(),
    telefone: document.getElementById('paciente-telefone').value.trim(),
    email: document.getElementById('paciente-email').value.trim(),
    observacoes: document.getElementById('paciente-obs').value.trim()
  };
  const r = await api(id ? 'atualizarPaciente' : 'criarPaciente', dados);
  if (r.success) {
    document.getElementById('overlay-paciente').classList.add('oculto');
    carregarListaPacientes();
  } else {
    alert('Não foi possível salvar: ' + r.error);
  }
}

// ---------- Relatórios ----------
async function gerarRelatorio() {
  const profissionalId = document.getElementById('rel-profissional').value;
  const dataInicio = document.getElementById('rel-data-inicio').value;
  const dataFim = document.getElementById('rel-data-fim').value;

  const container = document.getElementById('conteudo-relatorio');
  container.innerHTML = '<p class="vazio">Gerando relatório...</p>';

  const r = await api('relatorio', { profissionalId: profissionalId || undefined, dataInicio, dataFim });
  if (!r.success) { container.innerHTML = '<p class="vazio">Não foi possível gerar o relatório.</p>'; return; }

  ultimoRelatorio = { ...r, profissionalId, dataInicio, dataFim };
  renderizarRelatorio(r);
}

function renderizarRelatorio(r) {
  const container = document.getElementById('conteudo-relatorio');
  const nomesDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const linhasStatus = Object.entries(r.porStatus).map(([status, qtd]) => `<tr><td>${rotuloStatus(status)}</td><td>${qtd}</td></tr>`).join('');
  const linhasProfissional = Object.entries(r.porProfissional).map(([id, qtd]) => `<tr><td>${escapeHtml(nomeProfissional(id))}</td><td>${qtd}</td></tr>`).join('');
  const linhasDia = r.porDiaSemana.map((qtd, i) => `<tr><td>${nomesDias[i]}</td><td>${qtd}</td></tr>`).join('');
  const linhasHora = Object.entries(r.porHora).sort((a, b) => a[0].localeCompare(b[0])).map(([hora, qtd]) => `<tr><td>${hora}h</td><td>${qtd}</td></tr>`).join('');

  container.innerHTML = `
    <div class="grade-relatorio">
      <div class="cartao-metrica"><div class="numero">${r.total}</div><div class="rotulo">Total de consultas no período</div></div>
      <div class="cartao-metrica"><div class="numero">${r.taxaFaltaCancelamento}%</div><div class="rotulo">Taxa de falta/cancelamento</div></div>
      <div class="cartao-metrica"><div class="numero">R$ ${r.financeiro.totalPago.toFixed(2)}</div><div class="rotulo">Total recebido (pago)</div></div>
      <div class="cartao-metrica"><div class="numero">R$ ${r.financeiro.totalPendente.toFixed(2)}</div><div class="rotulo">Total pendente</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <h3 style="font-size:0.95rem">Por status</h3>
        <table class="tabela-relatorio"><thead><tr><th>Status</th><th>Qtd.</th></tr></thead><tbody>${linhasStatus || '<tr><td colspan=2>—</td></tr>'}</tbody></table>
      </div>
      <div>
        <h3 style="font-size:0.95rem">Por profissional</h3>
        <table class="tabela-relatorio"><thead><tr><th>Profissional</th><th>Qtd.</th></tr></thead><tbody>${linhasProfissional || '<tr><td colspan=2>—</td></tr>'}</tbody></table>
      </div>
      <div>
        <h3 style="font-size:0.95rem">Dias mais procurados</h3>
        <table class="tabela-relatorio"><thead><tr><th>Dia</th><th>Qtd.</th></tr></thead><tbody>${linhasDia}</tbody></table>
      </div>
      <div>
        <h3 style="font-size:0.95rem">Horários mais procurados</h3>
        <table class="tabela-relatorio"><thead><tr><th>Hora</th><th>Qtd.</th></tr></thead><tbody>${linhasHora || '<tr><td colspan=2>—</td></tr>'}</tbody></table>
      </div>
    </div>
  `;
}

function exportarExcel() {
  if (!ultimoRelatorio) { alert('Gere o relatório antes de exportar.'); return; }
  const r = ultimoRelatorio;
  const nomesDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const wb = XLSX.utils.book_new();

  const resumo = [
    ['Relatório de atendimentos'],
    ['Período', `${r.dataInicio} a ${r.dataFim}`],
    ['Profissional', r.profissionalId ? nomeProfissional(r.profissionalId) : 'Todos'],
    [],
    ['Total de consultas', r.total],
    ['Taxa de falta/cancelamento', r.taxaFaltaCancelamento + '%'],
    ['Total recebido', r.financeiro.totalPago],
    ['Total pendente', r.financeiro.totalPendente]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo');

  const status = [['Status', 'Quantidade'], ...Object.entries(r.porStatus)];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(status), 'Por status');

  const porProf = [['Profissional', 'Quantidade'], ...Object.entries(r.porProfissional).map(([id, q]) => [nomeProfissional(id), q])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porProf), 'Por profissional');

  const porDia = [['Dia da semana', 'Quantidade'], ...r.porDiaSemana.map((q, i) => [nomesDias[i], q])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porDia), 'Por dia da semana');

  const porHora = [['Hora', 'Quantidade'], ...Object.entries(r.porHora)];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porHora), 'Por horário');

  XLSX.writeFile(wb, `relatorio-consultorio-${r.dataInicio}-a-${r.dataFim}.xlsx`);
}

function exportarPdf() {
  if (!ultimoRelatorio) { alert('Gere o relatório antes de exportar.'); return; }
  const conteudo = document.getElementById('conteudo-relatorio').innerHTML;
  const r = ultimoRelatorio;
  document.getElementById('area-impressao').innerHTML = `
    <h2>Relatório de atendimentos</h2>
    <p>Período: ${r.dataInicio} a ${r.dataFim} — Profissional: ${r.profissionalId ? nomeProfissional(r.profissionalId) : 'Todos'}</p>
    ${conteudo}
  `;
  window.print();
}

// ---------- Administração de profissionais ----------
async function abrirAdmin() { document.getElementById('overlay-admin').classList.remove('oculto'); await carregarListaAdmin(); }

async function carregarListaAdmin() {
  const container = document.getElementById('lista-admin-profissionais');
  container.innerHTML = '<p class="vazio">Carregando...</p>';
  const r = await api('listTodosProfissionaisAdmin', { solicitanteId: sessao.id });
  if (!r.success) { container.innerHTML = `<p class="vazio">${escapeHtml(r.error || 'Erro ao carregar.')}</p>`; return; }

  container.innerHTML = '';
  r.profissionais.forEach(p => {
    const linha = document.createElement('div');
    linha.className = 'card-consulta';
    linha.style.borderLeftColor = p.ativo ? '#2F6F5E' : '#A64B3B';
    linha.innerHTML = `
      <div class="detalhes">
        <div class="paciente">${escapeHtml(p.nome)} <span class="tag-status" style="background:${p.perfil === 'secretaria' ? '#2F6F5E' : '#E8A94C'};color:${p.perfil === 'secretaria' ? '#fff' : '#5C3E0A'}">${p.perfil === 'secretaria' ? 'Secretária' : 'Profissional'}</span></div>
        <div class="obs">Usuário: ${escapeHtml(p.usuario)} ${p.especialidade ? '· ' + escapeHtml(p.especialidade) : ''} ${!p.ativo ? '· INATIVO' : ''}</div>
      </div>
      <div class="acoes">
        <button class="btn-texto btn-redefinir">Redefinir senha</button>
        <button class="btn-texto btn-alternar" style="${p.ativo ? 'color:#A64B3B' : 'color:#1F4E41'}">${p.ativo ? 'Desativar' : 'Ativar'}</button>
      </div>
    `;
    linha.querySelector('.btn-redefinir').addEventListener('click', () => redefinirSenha(p.id, p.nome));
    linha.querySelector('.btn-alternar').addEventListener('click', () => alternarAtivo(p.id, !p.ativo));
    container.appendChild(linha);
  });
}

async function cadastrarProfissional(e) {
  e.preventDefault();
  const dados = {
    solicitanteId: sessao.id,
    nome: document.getElementById('novo-nome').value.trim(),
    usuario: document.getElementById('novo-usuario').value.trim(),
    senha: document.getElementById('novo-senha').value,
    perfil: document.getElementById('novo-perfil').value,
    especialidade: document.getElementById('novo-especialidade').value.trim()
  };
  const r = await api('criarProfissional', dados);
  if (r.success) {
    document.getElementById('form-novo-profissional').reset();
    await carregarListaAdmin();
    await carregarProfissionais();
  } else {
    alert('Não foi possível cadastrar: ' + r.error);
  }
}

async function alternarAtivo(id, novoValor) {
  const r = await api('alternarAtivoProfissional', { solicitanteId: sessao.id, id, ativo: novoValor });
  if (r.success) { await carregarListaAdmin(); await carregarProfissionais(); }
  else alert('Não foi possível alterar: ' + r.error);
}

async function redefinirSenha(id, nome) {
  const novaSenha = prompt(`Nova senha para ${nome}:`);
  if (!novaSenha) return;
  const r = await api('redefinirSenhaProfissional', { solicitanteId: sessao.id, id, novaSenha });
  if (r.success) alert('Senha redefinida com sucesso.');
  else alert('Não foi possível redefinir: ' + r.error);
}

// ---------- Notificações (só secretária) ----------
async function atualizarContadorNotificacoes() {
  if (sessao.perfil !== 'secretaria') return;
  const r = await api('listNotificacoes', { perfil: 'secretaria' });
  if (!r.success) return;
  const naoLidas = r.notificacoes.filter(n => !n.lida).length;
  const contador = document.getElementById('contador-notificacoes');
  if (naoLidas > 0) { contador.textContent = naoLidas; contador.classList.remove('oculto'); }
  else contador.classList.add('oculto');
}

async function abrirNotificacoes() {
  document.getElementById('overlay-notificacoes').classList.remove('oculto');
  const r = await api('listNotificacoes', { perfil: 'secretaria' });
  const container = document.getElementById('lista-notificacoes');
  if (!r.success || r.notificacoes.length === 0) { container.innerHTML = '<p class="vazio">Nenhuma notificação.</p>'; return; }

  container.innerHTML = '';
  r.notificacoes.forEach(n => {
    const div = document.createElement('div');
    div.className = 'card-consulta';
    div.style.borderLeftColor = n.lida ? '#DCE3D8' : '#A64B3B';
    div.innerHTML = `<div class="detalhes"><div class="paciente" style="font-weight:${n.lida ? '400' : '700'}">${escapeHtml(n.mensagem)}</div><div class="obs">${new Date(n.criadoEm).toLocaleString('pt-BR')}</div></div>`;
    if (!n.lida) {
      const btn = document.createElement('button');
      btn.className = 'btn-texto'; btn.textContent = 'Marcar como lida';
      btn.addEventListener('click', async () => { await api('marcarNotificacaoLida', { id: n.id }); abrirNotificacoes(); atualizarContadorNotificacoes(); });
      div.appendChild(btn);
    }
    container.appendChild(div);
  });
}
