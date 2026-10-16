// 알림: AI 가 사용자에게 물었는데 사용자가 답하지 않고 다른 일을 시켜 넘어간 질문을
// 입력창 위에 남긴다. 직접 적는 메모는 핀보드 mod 몫이고, 여기는 알림만 다룬다.
//
// 턴이 끝날 때 AI 답변이 결정·확인을 부탁하며 끝났는지 보고, 그렇다면 질문을 걸어 둔다.
// 다음 프롬프트가 그 답이 아니면 띠에 올린다. 프롬프트 원문은 남기지 않는다.
//
// 저장 위치는 $.store 이고 키는 세션이 처음 뜬 작업 디렉터리로 만든다. 그래서 폴더마다 따로 남고,
// 같은 폴더에서 다시 띄운 세션은 전에 쌓인 것을 그대로 본다.

const PANE = 'noti'
const MAX_QUESTION = 1
// 띠에 뜬 질문은 답하지 않은 채 이만큼 입력을 보내면 내린다.
const STALE_PROMPTS = 3
// 작업 중 소식은 도구를 쓸 때마다 짓지 않고 이만큼 띄운다. 모델 호출이 턴마다 수십 번 쌓이지 않게 한다.
const LIVE_INTERVAL_MS = 45000
const LIVE_CLIP = 4000
const LIVE_USER_TURNS = 6
const LIVE_MAX_TOKENS = 120
const TEXT_LIMIT = 400
// 띠는 한 줄이라 넘치면 잘린다. 모델이 프롬프트의 길이·끝맺음을 자주 어겨서 받은 뒤에 다시 잰다.
const BAND_CHARS = 40
const BAND_RULE = `${BAND_CHARS}자 이내 한국어 한 문장으로 쓰고, '~했어요', '~해 주세요' 처럼 해요체 서술어로 끝낸다. '~완료', '~필요' 처럼 명사로 끝내지 않고, '~했다', '~합니다', '~입니까' 같은 다나까 말투도 쓰지 않는다.`
const NAME_RULE = '파일명·플러그인명 같은 영문 식별자는 옮겨 적지 말고 한국어로 풀어 쓴다. 다만 세션·프로젝트 이름은 번역하지 않고 영문 그대로 쓴다.'
const NO_QUESTION_RULE = '\'~할까요?\' 처럼 묻는 꼴로 쓰지 않는다.'
// '필요'·'중요' 는 '요' 로 끝나도 명사다.
const SENTENCE_END = /(?<![필중])요[.!?]?$/

// 아래 모드 표시 줄(auto mode on 등)과 왼쪽을 맞춘다.
const INDENT = 2

// 새 질문이 올라오면 밝은 칸이 문장을 한 번 훑고 멈춘다. 계속 돌리면 띠가 쉬지 않고 다시 그려진다.
const SHIMMER_MS = 2500
const SHIMMER_WIDTH = 3
const SHIMMER_MIN_FRAME_MS = 30
// 턴이 도는 동안에는 띠에 떠 있는 문장을 이 간격으로 다시 훑어, 아직 일하는 중임을 보인다.
const TURN_SWEEP_GAP_MS = 4000
const SWEEP_ANY = '*'
// 턴이 도는 동안 줄 머리의 ⎿ 대신 돌린다. ⎿ 처럼 한 칸짜리여야 핀보드 띠와 글자 위치가 맞는다.
const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPIN_MS = 120
// pinboard 띠의 LEAD_GAP·ICON_SEP 과 같아야 두 띠의 글자 위치가 맞는다.
const LEAD_GAP = '  '
const ICON_SEP = ' : '
// 알림 갈래별 얼굴. 모두 두 칸짜리여야 핀보드 띠와 글자 위치가 맞는다.
const ICONS = {
  decision: '🤔', // 고르거나 사용자만 아는 사실을 묻는 질문
  request: '🙏', // 해 보거나 확인해 달라는 부탁
  missed: '😅', // 시켰는데 AI 가 넘어간 요청
  check: '🤔', // 사용자가 정하거나 직접 봐야 할 것
  work: '👀', // 지금 하는 일
  next: '💡', // 권하는 다음 단계
  finished: '😊', // 시킨 일을 다 끝냄
}
const FACES_KEY = 'noti:faces'
// 핀보드가 끝났는지 묻는 문장. 같은 얼굴이 두 줄로 겹치지 않게 이 띠 한 줄로 합쳐 그린다.
const PIN_ASK = { plugin: 'pinboard', key: 'ask' }
const HOST_STATE = { plugin: 'noti', key: 'hostsAsk' }
const NOTICE_KINDS = ['missed', 'check', 'work', 'next', 'finished']
const noticeKind = (kind, fallback) => (NOTICE_KINDS.includes(kind) ? kind : fallback)
const itemKind = (item) => item.kind || (item.notice ? 'check' : item.decision ? 'decision' : 'request')
const bandIcon = (item) => (ICONS[itemKind(item)] || ICONS.decision) + ICON_SEP
// 팁 줄과 같은 머리 글자. 반짝임에서는 뺀다.
const BAND_LEAD = '⎿' + LEAD_GAP

// 질문을 뽑을 때 모델에 넘기는 길이. 질문은 답변 끝에 오므로 답변은 뒤쪽을 자른다.
const PROMPT_CLIP = 1500
const ANSWER_CLIP = 3000
// 답했는지 가를 때 같이 넘기는 AI 답변 끝부분. 선택지와 물은 문장이 들어갈 만큼만 남긴다.
const ASKED_CLIP = 800

// 승인·호응만 하는 짧은 말. 질문이 걸려 있을 때 이것으로 답하면 모델 없이 답한 것으로 본다.
const SKIP_WORDS = ['ㅇㅇ', 'ㄱㄱ', '응', '네', '그래', '좋아', '계속', '진행', 'ok', 'okay', 'yes', 'y', 'go']

// <cross-session-message …>, <task-notification> 처럼 태그로 시작하는 입력
const WRAPPED_INPUT = /^<[a-z][a-z-]*[\s>]/
// 그중 다른 세션이 보낸 편지. 세션이 편지 일을 먼저 하므로 걸려 있던 질문이 묻힌다.
const LETTER_INPUT = /^<cross-session-message[\s>]/

const KEY_PREFIX = 'noti:'
// 옛 키. 처음 읽을 때 새 키로 옮기고 지운다.
const LEGACY_PREFIX = 'missed:'
const GLOBAL_KEY = KEY_PREFIX + 'global'

// 모델 판정. 턴을 기다리게 하지 않도록 DEFER_MS 뒤에 돌린다.
const MODEL = 'haiku'
const MODEL_TIMEOUT_MS = 20000
// 대상 두 줄을 먼저 적게 하므로 판정 한 단어보다 넉넉히 둔다.
const JUDGE_MAX_TOKENS = 120
const HOLD_MAX_TOKENS = 160
const RESOLVED_MAX_TOKENS = 30
const RECENT_CLOSED = 5
const TRACE_KEEP = 20
const DEFER_MS = 50

// 모듈이 다시 로드되면 초기화되므로 session.start 에서 $.store 값을 다시 읽는다.
let storeKey = GLOBAL_KEY
let questions = []
let enabled = true
// 숨겨도 기록은 계속한다. 숨길 때 떠 있던 핀 물음은 이미 본 것이라, 새 핀 물음만 띠를 다시 연다.
let hidden = false
let hiddenAsk = ''
// 걸어 둔 질문. { labels: 띠에 쓸 한 문장 요약, asked: AI 답변 끝부분 }
let pendingQuestion = null
// 내려간 질문 문구. 같은 결정을 다시 물어도 띠에 되살리지 않는다.
let closed = []
let trace = []
let liveAt = 0
let liveRunning = false
// 턴이 도는 동안의 소식은 저장하지 않고 띠에만 띄운다. 답을 기다리는 질문보다 앞에 나오고 턴이 끝나면 걷는다.
let turnRunning = false
let liveItem = null
let liveTimer = 0
let liveAgain = false
let seq = 0
// 이번 턴을 연 프롬프트. 다른 세션 편지로 시작한 턴은 보지 않는다.
let lastPrompt = ''
let lastPromptWrapped = false
// /clear 마다 올린다. 판정은 뒤에서 늦게 끝나므로 출발할 때의 값과 다르면 이전 대화 것이라 버린다.
let epoch = 0
// 사용자가 마지막으로 입력한 뒤 다른 세션 편지가 왔는지.
let letterArrived = false
// 반짝이는 중인 질문과 밝은 칸의 끝 위치. 저장하지 않는다.
let shimmer = null
// 띠에 마지막으로 그린 글자 수. 턴 중 훑기가 문장 끝까지 가는 데 쓴다.
let shownLength = 0
let spinFrame = 0

async function keyFromCwd($) {
  try {
    const cwd = await $.session.cwd()
    const path = typeof cwd === 'string' ? cwd : cwd && cwd.path
    if (path) return KEY_PREFIX + path
  } catch (error) {}
  return GLOBAL_KEY
}

// cwd 는 셸이 지금 가 있는 폴더라 cd 뒤 다시 로드되면 키가 바뀐다. 세션이 처음 정한 키를 세션 id 로 기억한다.
async function sessionMemoKey($) {
  try {
    const id = await $.session.id()
    return id ? 'start:' + id : null
  } catch (error) {
    return null
  }
}

async function resolveStoreKey($) {
  const memo = await sessionMemoKey($)
  if (memo) {
    const saved = await $.store.get(memo)
    if (typeof saved === 'string') {
      if (!saved.startsWith(LEGACY_PREFIX)) return saved
      const key = KEY_PREFIX + saved.slice(LEGACY_PREFIX.length)
      await $.store.set(memo, key)
      return key
    }
  }
  const key = await keyFromCwd($)
  if (memo) await $.store.set(memo, key)
  return key
}

async function readMigrated($, key) {
  const saved = await $.store.get(key)
  if (saved !== undefined && saved !== null) return saved
  const legacyKey = LEGACY_PREFIX + key.slice(KEY_PREFIX.length)
  const legacy = await $.store.get(legacyKey)
  if (legacy === undefined || legacy === null) return saved
  await $.store.set(key, legacy)
  await $.store.delete(legacyKey)
  return legacy
}

async function loadBoard($) {
  storeKey = await resolveStoreKey($)
  const saved = await readMigrated($, storeKey)
  const board = saved && typeof saved === 'object' ? saved : {}
  // 판정 중에 꺼졌으면 판정은 다시 오지 않으므로 숨긴 표시를 풀고 읽는다.
  questions = Array.isArray(board.questions)
    ? board.questions.filter((item) => item && typeof item.text === 'string').slice(-MAX_QUESTION).map(withoutJudging)
    : []
  enabled = board.enabled !== false
  hidden = board.hidden === true
  hiddenAsk = typeof board.hiddenAsk === 'string' ? board.hiddenAsk : ''
  const held = board.pendingQuestion
  pendingQuestion = loadHeld(held)
  closed = Array.isArray(board.closed) ? board.closed.filter((t) => typeof t === 'string').slice(-RECENT_CLOSED) : []
  trace = Array.isArray(board.trace) ? board.trace.slice(-TRACE_KEEP) : []
  // 띠는 읽기 전에 이미 한 번 그려졌으므로 다시 그리게 한다.
  refresh($)
}

async function saveBoard($) {
  await $.store.set(storeKey, { questions, enabled, hidden, hiddenAsk, pendingQuestion, closed, trace })
}

// 판정이 어디서 멈췄는지 나중에 가릴 수 있게 단계와 결과만 남긴다. 문구는 남기지 않는다.
async function note($, step, result) {
  trace = [...trace, { at: new Date().toISOString(), step, result }].slice(-TRACE_KEEP)
  await saveBoard($)
}

function refresh($) {
  $.ui.invalidate('ui.render')
}

async function commit($) {
  await saveBoard($)
  refresh($)
}

function shorten(text, limit) {
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

function withoutJudging({ judging, ...item }) {
  return item
}

function isAck(body) {
  return SKIP_WORDS.includes(body.toLowerCase())
}

async function readPinAsk($) {
  const { value = '' } = await $.state.get(PIN_ASK).catch(() => ({}))
  return value
}

// Text 에는 취소선 속성이 없어서 글자마다 결합 문자를 붙여 그린다. 화면(Pane)에서만 쓴다.
function strike(text) {
  return Array.from(text)
    .map((ch) => ch + '̶')
    .join('')
}

async function toggleItem($, id) {
  questions = questions.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
  await commit($)
}

async function removeItem($, id) {
  const gone = questions.find((item) => item.id === id)
  // 소식은 턴마다 새로 지으므로 되풀이 막기 대상이 아니다.
  if (gone && !gone.notice) closed = [...closed, gone.text].slice(-RECENT_CLOSED)
  questions = questions.filter((item) => item.id !== id)
  await commit($)
}

async function clearAll($) {
  epoch += 1
  questions = []
  pendingQuestion = null
  await commit($)
}

async function toggleEnabled($) {
  enabled = !enabled
  if (!enabled) pendingQuestion = null
  await saveBoard($)
  $.ui.toast(enabled ? '알림을 남깁니다.' : '알림 기록을 껐습니다.')
  refresh($)
}

// seq 는 다시 로드되면 0 부터라 시각을 섞어야 저장된 id 와 겹치지 않는다.
function newId() {
  seq += 1
  return 'q' + Date.now().toString(36) + '-' + seq
}

function normalize(text) {
  return text.toLowerCase().replace(/[\s\p{P}]/gu, '')
}

function sameQuestion(a, b) {
  const x = normalize(a)
  const y = normalize(b)
  return Boolean(x && y) && (x.includes(y) || y.includes(x))
}

function cleanLabels(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((label) => typeof label === 'string' && label.trim())
    .map((label) => shorten(label.trim(), TEXT_LIMIT))
}

// 길이나 끝맺음이 띠 규칙을 어기면 한 번 고쳐 쓰게 한다. 실패하면 받은 문장을 그대로 낸다.
async function fitBand($, text) {
  if (!text || (Array.from(text).length <= BAND_CHARS && SENTENCE_END.test(text))) return text
  try {
    const result = await $.model.complete({
      model: MODEL,
      system: '입력창 위 띠에 띄울 문장을 고친다. 뜻은 그대로 두고 ' + BAND_RULE + ' 고친 문장만 답한다.',
      prompt: text,
      maxTokens: LIVE_MAX_TOKENS,
      timeoutMs: MODEL_TIMEOUT_MS,
    })
    return (result.isAnswered && cleanLabels([result.text.replace(/^["'\s]+|["'\s]+$/g, '')])[0]) || text
  } catch (error) {
    return text
  }
}

// 한 줄짜리 label 로 저장된 옛 형태도 읽는다.
function loadHeld(held) {
  if (!held || typeof held !== 'object') return null
  const labels = cleanLabels(held.labels || [held.label])
  return labels.length > 0 ? { labels, asked: String(held.asked || '') } : null
}

// 알림을 붙인다. 같은 질문이 남아 있으면 그것을 빼고 새로 붙이며, 오래된 것부터 밀어낸다.
// 판정 모델은 남아 있는 질문 문구를 그대로 다시 내므로, 넘긴 횟수를 이어받지 않으면 끝내 내려가지 않는다.
async function pushQuestions($, labels, asked, decision) {
  const texts = cleanLabels(labels)
    .filter((text, i, all) => all.findIndex((t) => sameQuestion(t, text)) === i)
    .filter((text) => !closed.some((c) => sameQuestion(c, text)))
  if (texts.length === 0) {
    await note($, 'push', 'closed-before')
    return
  }
  const shownBefore = (text) => questions.find((q) => !q.done && sameQuestion(q.text, text))
  const items = texts.slice(-MAX_QUESTION).map((text) => {
    const old = shownBefore(text)
    return {
      id: newId(), text, asked, done: false,
      ...(decision ? { decision: true } : {}),
      ...(old && old.skipped ? { skipped: old.skipped } : {}),
    }
  })
  const repeated = Boolean(shownBefore(items[items.length - 1].text))
  const rest = questions.filter((q) => q.done || !texts.some((text) => sameQuestion(q.text, text)))
  questions = [...rest.slice(-(MAX_QUESTION - items.length)), ...items].slice(-MAX_QUESTION)
  await commit($)
  if (repeated) return
  startShimmer($, items[items.length - 1])
}

// 띠가 비지 않게 턴마다 소식 한 줄을 갈아 끼운다. 답을 기다리는 질문이 떠 있으면 그것을 가리지 않는다.
async function showNotice($, text, asked, kind) {
  if (!text || questions.some((q) => !q.done && !q.notice)) return
  const old = questions.find((q) => q.notice && !q.done)
  if (old && sameQuestion(old.text, text)) return
  const item = { id: newId(), text, asked, done: false, notice: true, kind: noticeKind(kind, 'check') }
  questions = [...questions.filter((q) => !q.notice), item].slice(-MAX_QUESTION)
  await commit($)
  startShimmer($, item)
}

function blockText(block) {
  if (typeof block === 'string') return block
  if (!block || typeof block !== 'object') return ''
  if (block.type === 'text') return block.text || ''
  if (block.type === 'tool_use') return '[도구 ' + block.name + '] ' + shorten(JSON.stringify(block.input || {}), 160)
  if (block.type === 'tool_result') {
    const body = Array.isArray(block.content) ? block.content.map(blockText).join(' ') : String(block.content || '')
    return '[결과] ' + shorten(body, 160)
  }
  return ''
}

function messageText(message) {
  const content = message && message.content
  return Array.isArray(content) ? content.map(blockText).filter(Boolean).join('\n') : blockText(content)
}

// 사용자가 직접 친 말만 고른다. 도구 결과와 태그로 감싼 편지·알림은 뺀다.
function isUserWords(message) {
  if (!message || message.role !== 'user') return false
  const content = message.content
  const text = typeof content === 'string' ? content
    : Array.isArray(content) && content.every((b) => b && b.type === 'text') ? content.map((b) => b.text).join('\n') : ''
  return Boolean(text.trim()) && !WRAPPED_INPUT.test(text.trim()) && !text.trim().startsWith('<')
}

// 대화 흐름을 보고 지금 사용자에게 건넬 한 줄을 짓는다. 턴이 도는 중에도 부른다.
async function liveNotice($) {
  // 앞 판정이 도는 중이면 끝난 뒤 한 번 더 짓는다. 턴 끝 소식이 작업 중 소식에 덮이지 않게 한다.
  if (liveRunning) {
    liveAgain = true
    return
  }
  liveRunning = true
  const started = epoch
  // 턴 중에는 AI 가 아직 사용자에게 아무것도 부탁하지 않았다. AI 가 하는 일을 부탁으로 옮겨 적지 않게 ②를 뺀다.
  const midTurn = turnRunning
  try {
    const messages = await $.session.messages({ as: 'api' })
    if (!Array.isArray(messages) || messages.length === 0) return
    const userWords = messages.filter(isUserWords).slice(-LIVE_USER_TURNS)
      .map((m) => '- ' + shorten(messageText(m), PROMPT_CLIP))
    const flow = messages.map((m) => (m.role === 'user' ? '사용자: ' : 'AI: ') + messageText(m)).join('\n').slice(-LIVE_CLIP)
    const result = await $.model.complete({
      model: MODEL,
      system:
        '너는 AI 코딩 도우미 옆에서 사용자를 돕는 비서다. 대화를 보고 입력창 위 띠에 띄울 한 줄을 짓는다. JSON 한 줄로만 답한다. 형식은 {"notice":"","kind":""} 이다. ' +
        'kind 는 아래 ①이면 missed, ②면 check, ③이면 work, ④면 next 다. 다만 ③이 시킨 일을 다 끝냈다고 알리는 말이면 finished 다. ' +
        '고르는 차례는 이렇다. ① 사용자가 시켰는데 AI 가 아직 손대지 않았거나 답하지 않고 넘어간 요청 ② 사용자가 정하거나 직접 봐야 할 것 ' +
        '③ 지금 AI 가 무엇을 하고 있는지와 사용자가 알아 두면 좋을 점 ④ 권하는 다음 단계. 앞의 것이 있으면 그것을 쓴다. ' +
        BAND_RULE + ' 띠만 보고 이해되게 쓴다. 추천이 있으면 앞에 싣는다. 이미 끝낸 일을 다시 알리지 않는다. ' +
        NAME_RULE + ' ' + NO_QUESTION_RULE +
        (midTurn
          ? ' 지금은 AI 가 일하는 중이다. ②는 고르지 않는다. AI 가 읽거나 확인하거나 고치는 일은 ③이고, \'~하고 있어요\' 처럼 진행형으로 쓴다. \'~해 주세요\' 로 쓰지 않는다.'
          : ''),
      prompt:
        '지금 띠에 있는 말:\n' + (questions.filter((q) => !q.done).map((q) => q.text).join('\n') || '(없음)') +
        '\n\n사용자가 최근에 한 말(오래된 것부터):\n' + (userWords.join('\n') || '(없음)') +
        '\n\n최근 대화 흐름(끝부분):\n' + flow,
      maxTokens: LIVE_MAX_TOKENS,
      timeoutMs: MODEL_TIMEOUT_MS,
    })
    if (!result.isAnswered || started !== epoch) return
    const parsed = parseJson(result.text) || {}
    if (midTurn && parsed.kind === 'check') return
    const text = await fitBand($, cleanLabels([parsed.notice])[0])
    await note($, 'live', text ? 'notice' : 'empty')
    if (turnRunning) showLive($, text, parsed.kind)
    else await showNotice($, text, '', parsed.kind)
  } catch (error) {
    await note($, 'live', 'error')
  } finally {
    liveRunning = false
    if (liveAgain) {
      liveAgain = false
      $.clock.after(DEFER_MS, () => liveNotice($))
    }
  }
}

function showLive($, text, kind) {
  if (!text || (liveItem && sameQuestion(liveItem.text, text))) return
  liveItem = { id: newId(), text, done: false, notice: true, kind: noticeKind(kind, 'work') }
  refresh($)
  startShimmer($, liveItem)
}

// 도구를 부르지 않고 오래 생각하는 동안에도 소식이 바뀌도록 간격마다 다시 짓는다.
function startTurn($) {
  turnRunning = true
  const mine = ++liveTimer
  const tick = () => {
    if (!turnRunning || mine !== liveTimer) return
    scheduleLive($)
    $.clock.after(LIVE_INTERVAL_MS, tick)
  }
  $.clock.after(LIVE_INTERVAL_MS, tick)
  const spin = () => {
    if (!turnRunning || mine !== liveTimer) return
    spinFrame = (spinFrame + 1) % SPIN_FRAMES.length
    refresh($)
    $.clock.after(SPIN_MS, spin)
  }
  $.clock.after(SPIN_MS, spin)
  $.clock.after(TURN_SWEEP_GAP_MS, () => sweepTurn($, mine, 0))
}

// 새 질문의 반짝임이 돌고 있으면 그것을 먼저 끝내고 다음 간격에 훑는다.
function sweepTurn($, mine, pos) {
  if (!turnRunning || mine !== liveTimer) return
  const frames = shownLength + SHIMMER_WIDTH
  if ((shimmer && shimmer.id !== SWEEP_ANY) || pos > frames) {
    if (shimmer && shimmer.id === SWEEP_ANY) {
      shimmer = null
      refresh($)
    }
    $.clock.after(TURN_SWEEP_GAP_MS, () => sweepTurn($, mine, 0))
    return
  }
  shimmer = { id: SWEEP_ANY, pos }
  refresh($)
  const frameMs = Math.max(SHIMMER_MIN_FRAME_MS, Math.round(SHIMMER_MS / frames))
  $.clock.after(frameMs, () => sweepTurn($, mine, pos + 1))
}

function endTurn($) {
  turnRunning = false
  liveTimer += 1
  if (shimmer && shimmer.id === SWEEP_ANY) shimmer = null
  liveItem = null
  refresh($)
}

function scheduleLive($) {
  const now = Date.now()
  if (liveRunning || now - liveAt < LIVE_INTERVAL_MS) return
  liveAt = now
  $.clock.after(DEFER_MS, () => liveNotice($))
}

// 갈래별 얼굴이 실제로 떴는지 폴더와 상관없이 센다. 문장은 남기지 않는다.
async function countFace($, item) {
  const kind = itemKind(item)
  const saved = (await readMigrated($, FACES_KEY)) || {}
  const prev = saved[kind] || { count: 0 }
  await $.store.set(FACES_KEY, { ...saved, [kind]: { count: prev.count + 1, last: new Date().toISOString() } })
}

function facesReport(saved) {
  return Object.keys(ICONS)
    .map((kind) => ICONS[kind] + ' ' + kind + ' ' + ((saved[kind] && saved[kind].count) || 0))
    .join(' · ')
}

function startShimmer($, item) {
  countFace($, item).catch(() => {})
  const frames = Array.from(bandIcon(item) + item.text).length + SHIMMER_WIDTH
  const frameMs = Math.max(SHIMMER_MIN_FRAME_MS, Math.round(SHIMMER_MS / frames))
  const tick = (pos) => {
    // 그사이 체크했거나 다른 질문에 밀려났으면 멈춘다.
    const alive = (liveItem && liveItem.id === item.id) || questions.some((q) => q.id === item.id && !q.done)
    if (pos > frames || !alive) {
      shimmer = null
      refresh($)
      return
    }
    shimmer = { id: item.id, pos }
    refresh($)
    $.clock.after(frameMs, () => tick(pos + 1))
  }
  tick(0)
}

function openLabels() {
  return questions.filter((q) => !q.done && !q.notice).map((q) => q.text)
}

function parseJson(text) {
  const found = String(text || '').match(/\{[\s\S]*\}/)
  if (!found) return null
  try {
    return JSON.parse(found[0])
  } catch (error) {
    return null
  }
}

// 답변이 사용자에게 묻고 끝났으면 그 질문을 걸어 둔다. 바로 띠에 올리지 않고,
// 사용자가 답하지 않고 다른 일을 시키면 그때 올린다.
async function holdQuestion($, prompt, answer) {
  const started = epoch
  const result = await $.model.complete({
    model: MODEL,
    system:
      'AI 코딩 도우미의 한 턴을 보고 JSON 한 줄로만 답한다. 형식은 {"questions":[],"decision":false} 이다. ' +
      'decision 은 사용자가 선택지를 고르거나 사용자만 아는 사실을 알려 줘야 하면 true, 무언가를 해 보거나 확인해 달라는 부탁이면 false 다. ' +
      'AI 답변이 사용자에게 결정·확인·조작을 부탁하며 끝났을 때만 그 내용을 적고, 아니면 빈 배열로 둔다. ' +
      'AI 가 스스로 하겠다는 예고·다짐(\'결과가 오면 이어서 확인하겠다\', \'없으면 ~를 권하겠다\')은 사용자가 할 일이 아니므로 빈 배열로 둔다. ' +
      '결정이 여럿이면 가장 중요한 하나만, 그 결정을 사용자에게 부드럽게 건네는 문장으로 적는다. ' + BAND_RULE + ' ' +
      '이 문장은 답변을 다시 읽지 않고 띠만 보고 이해해야 한다. 무엇을 정하거나 확인하는지 구체적으로 적고, ' +
      'AI 가 답변에서 권한 쪽이 있으면 그 추천을 앞에 싣고, 없으면 선택지를 그대로 넣는다. ' +
      '예) "시험용 판은 지우는 게 좋을 것 같아요. 지워도 될지 알려 주세요", "팀 링크까지 갱신할지, 개발 주소로만 볼지 정해 주세요". ' +
      '확인을 부탁했으면 무엇을 보고 무엇을 알려 주면 되는지까지 적는다. "~를 확인해 주세요" 로만 끝내지 않는다. ' +
      'AI 가 자기가 할 일을 해도 될지 물은 것이면 \'~할지 알려 주세요\', \'~해도 될지 정해 주세요\' 로 쓴다. ' +
      '\'~를 넣어 주세요\' 처럼 사용자가 직접 할 일로 읽히게 쓰지 않는다. ' +
      NO_QUESTION_RULE + ' 어미는 \'~해 보면 어때요\', \'~하면 좋겠어요\', \'~부터 정해 주세요\', ' +
      '\'~하는 게 좋을 것 같아요\' 처럼 내용에 맞게 골라 쓰고, 한 어미만 되풀이하지 않는다. ' +
      NAME_RULE + ' ' +
      '이미 남아 있는 질문과 같은 결정이면 표현이 달라도 그 문구를 글자 그대로 쓴다. ' +
      '이미 내려간 질문과 같은 결정이면 표현이 달라도 그 문구를 글자 그대로 쓴다. 같은 질문이 띠에 되살아나지 않게 하려는 것이다. ' +
      '다음에 무엇을 할지, 더 필요한 것이 있는지처럼 정할 대상 없이 열어 둔 질문도 넣지 않는다. ' +
      'AI 가 제안한 일을 이미 직접 하고 있거나 결과를 확인하는 중이라 사용자는 기다리기만 하면 되는 경우도 넣지 않는다. 사용자가 고를 선택지나 사실 확인처럼 실제 결정이 걸린 질문만 적는다.',
    prompt:
      '이미 남아 있는 질문:\n' + (openLabels().join('\n') || '(없음)') +
      '\n\n이미 내려간 질문:\n' + (closed.join('\n') || '(없음)') +
      '\n\n사용자 요청:\n' + shorten(prompt, PROMPT_CLIP) +
      '\n\nAI 답변(끝부분):\n' + answer.slice(-ANSWER_CLIP),
    maxTokens: HOLD_MAX_TOKENS,
    timeoutMs: MODEL_TIMEOUT_MS,
  })
  if (!result.isAnswered || started !== epoch) {
    await note($, 'hold', result.isAnswered ? 'stale' : 'no-model-answer')
    return
  }
  const parsed = parseJson(result.text)
  if (!parsed) {
    await note($, 'hold', 'bad-json')
    return
  }
  const labels = await Promise.all(cleanLabels(parsed.questions).map((label) => fitBand($, label)))
  await note($, 'hold', labels.length > 0 ? (parsed.decision === true ? 'decision' : 'request') : 'none')
  const held = labels.length > 0
    ? { labels, asked: answer.slice(-ASKED_CLIP), decision: parsed.decision === true }
    : null  // 판정이 끝나기 전에 편지가 왔으면 사용자가 답할 틈 없이 묻히므로 바로 올린다.
  if (held && letterArrived) {
    await releaseHeld($, held)
    return
  }
  pendingQuestion = held
  await saveBoard($)
}

async function releaseHeld($, held) {
  pendingQuestion = null
  await saveBoard($)
  await pushQuestions($, held.labels, held.asked, held.decision)
}

// 편지가 오면 세션이 그 일을 먼저 하므로, 답을 기다리던 질문은 바로 띠에 올린다.
async function buryByLetter($) {
  letterArrived = true
  if (pendingQuestion) await releaseHeld($, pendingQuestion)
}

// 사용자의 말이 AI 가 물은 것에 답했는지 가린다. true·false, 판정을 못 했거나 /clear 로 낡았으면 null.
// 요약만 넘기면 '두 번째 걸로' 같은 답이 무엇을 가리키는지 몰라 놓친 것으로 잘못 보므로,
// AI 가 실제로 물은 끝부분을 같이 넘긴다. 낱말만 겹쳐도 답으로 보므로 대상을 먼저 적게 한다.
async function judgeAnswered($, asked, body) {
  const started = epoch
  let result
  try {
    result = await $.model.complete({
      model: MODEL,
      system:
        'AI 가 사용자에게 무언가를 물었고, 사용자가 그 뒤에 말을 했다. 그 말이 AI 의 질문에 답하거나 ' +
        '고르거나 미루겠다고 한 것이면 answered 를 true 로, 질문을 건드리지 않고 다른 일만 시켰으면 false 로 한다. ' +
        '선택지 번호·이름만 말한 것도 답이다. 선택지를 고르지 않고 다른 방안을 내거나, 되묻거나, 반대한 것도 같은 결정을 두고 한 말이므로 답이다. ' +
        'AI 가 제안에 넣은 숫자·범위·대상을 다른 값으로 바꾸자고 한 것도 그 제안에 대한 답이다. ' +
        'AI 가 제안한 방향은 그대로 두고 이어서 세부만 고쳐 달라고 한 것도 그 제안을 받아들인 것이므로 답이다. ' +
        '먼저 AI 가 정해 달라고 한 대상과, 사용자의 말이 무엇을 하라는지를 각각 짧게 적는다. ' +
        '둘이 같은 결정일 때만 답이다. 같은 낱말이 나와도 다른 기능·다른 물건에 대한 요청이면 false 다. ' +
        '같은 결정인지 애매할 때만 true 로 한다. ' +
        'JSON 한 줄로만 답한다. 형식은 {"asked":"…","said":"…","answered":true} 이다.',
      prompt: 'AI 가 물은 것(답변 끝부분):\n' + asked + '\n\n사용자가 한 말:\n' + shorten(body, PROMPT_CLIP),
      maxTokens: JUDGE_MAX_TOKENS,
      timeoutMs: MODEL_TIMEOUT_MS,
    })
  } catch (error) {
    return null
  }
  if (!result.isAnswered || started !== epoch) return null
  const parsed = parseJson(result.text)
  return parsed && typeof parsed.answered === 'boolean' ? parsed.answered : null
}

async function checkAnswered($, question, prompt) {
  const body = prompt.trim()
  if (isAck(body)) return
  const answered = await judgeAnswered($, question.asked, body)
  await note($, 'judge', String(answered))
  if (answered === false) await pushQuestions($, question.labels, question.asked, question.decision)
}

// 띠에 올라 있는 질문에 뒤늦게 답하면 내린다. 짧은 호응은 직전 답변에 한 말로 보고 넘어간다.
// 답이 됐으면 내리고, 결정 내용이 바뀌었으면 문구만 고치고, 상관없으면 둔다.
async function checkShown($, item, prompt) {
  try {
    await judgeShown($, item, prompt)
  } finally {
    if (questions.some((q) => q.id === item.id && q.judging)) {
      questions = questions.map((q) => (q.id === item.id ? withoutJudging(q) : q))
      await commit($)
    }
  }
}

async function judgeShown($, item, prompt) {
  const body = prompt.trim()
  if (isAck(body)) return
  const started = epoch
  let result
  try {
    result = await $.model.complete({
      model: MODEL,
      system:
        '띠에 사용자에게 남긴 알림 한 줄이 있고, 사용자가 새로 말을 했다. JSON 한 줄로만 답한다. 형식은 {"action":"keep","text":""} 이다. ' +
        '그 말이 알림의 결정에 답했거나 더 정할 필요가 없게 만들었으면 remove 다. ' +
        '결정은 아직 남았는데 범위·선택지·사정이 바뀌어 알림 문구가 맞지 않게 됐으면 update 로 하고, text 에 바뀐 내용을 담은 문장을 적는다. ' + BAND_RULE + ' ' +
        '알림과 상관없는 말이면 keep 이다. 같은 낱말만 겹치고 다른 대상을 말한 것도 keep 이다. 애매하면 keep 이다.',
      prompt: '알림:\n' + item.text + '\n\nAI 가 물은 것(답변 끝부분):\n' + item.asked + '\n\n사용자가 한 말:\n' + shorten(body, PROMPT_CLIP),
      maxTokens: JUDGE_MAX_TOKENS,
      timeoutMs: MODEL_TIMEOUT_MS,
    })
  } catch (error) {
    return
  }
  if (!result.isAnswered || started !== epoch) return
  const parsed = parseJson(result.text) || {}
  await note($, 'shown', String(parsed.action))
  if (parsed.action === 'remove') {
    await removeItem($, item.id)
    return
  }
  const text = parsed.action === 'update' && (await fitBand($, cleanLabels([parsed.text])[0]))
  if (!text || !questions.some((q) => q.id === item.id)) return
  questions = questions.map((q) => (q.id === item.id ? { ...withoutJudging(q), text } : q))
  await commit($)
  startShimmer($, { ...item, text })
}

// 띠에 올라 있는 질문이 이번 턴에서 풀렸으면 내린다. 다른 경로로 정해졌거나 더 정할 필요가 없어진 경우다.
async function checkResolved($, item, prompt, answer) {
  const started = epoch
  const result = await $.model.complete({
    model: MODEL,
    system:
      'AI 코딩 도우미가 전에 사용자에게 남긴 질문과, 그 뒤에 끝난 한 턴을 보고 JSON 한 줄로만 답한다. 형식은 {"resolved":true} 이다. ' +
      '이번 턴에서 그 질문이 정해졌거나, 이미 그대로 진행됐거나, 더 정할 필요가 없어졌다고 드러나면 true 다. ' +
      '질문에 적힌 값과 다른 값으로 같은 일을 이미 했어도 그 질문은 정해진 것이므로 true 다. ' +
      'AI 가 이번 답변에서 그 제안을 스스로 거둬들였거나 필요 없다고 밝혔으면 사용자가 정할 것이 없어졌으므로 true 다. ' +
      '그 질문과 상관없는 일을 했거나 애매하면 false 로 한다.',
    prompt:
      '남은 질문:\n' + item.text +
      '\n\n사용자 요청:\n' + (shorten(prompt, PROMPT_CLIP) || '(다른 세션 편지 등으로 시작한 턴)') +
      '\n\nAI 답변(끝부분):\n' + answer.slice(-ANSWER_CLIP),
    maxTokens: RESOLVED_MAX_TOKENS,
    timeoutMs: MODEL_TIMEOUT_MS,
  })
  if (!result.isAnswered || started !== epoch) return
  const parsed = parseJson(result.text)
  await note($, 'resolved', String(parsed ? parsed.resolved : 'bad-json'))
  if (parsed && parsed.resolved === true) await removeItem($, item.id)
}

function openPane($) {
  return $.ui.open({ id: PANE, title: '알림', focus: true, closeOnEscape: true })
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.state.set(HOST_STATE, true).catch(() => {})
    await loadBoard($)
    try {
      await $.command.register({
        name: 'noti',
        description: '알림 보기',
        argumentHint: '[on | off | hide | show | clear | faces]',
      })
    } catch (error) {
      $.ui.log('명령을 등록하지 못했습니다. ' + error.message)
    }
    return next(e)
  })

  // /clear·/resume·/branch 뒤에는 session.start 가 다시 실행되지 않아서 여기서 다시 읽는다.
  // 질문은 대화에 매인 것이라 /clear 하면 비운다. 끄고 켠 상태는 남긴다.
  on('classic.SessionStart', { source: ['startup', 'clear', 'resume', 'fork'] }, async ($, e, next) => {
    await loadBoard($)
    // 새로 연 세션은 지난 대화의 질문을 이어받지 않는다. 다시 불러오기(session.start)에서는 비우지 않는다.
    if (e.source === 'clear' || e.source === 'startup') await clearAll($)
    return next(e)
  })

  // 세션이 완전히 끝나면 기억해 둔 키를 지운다. /clear·/resume 은 같은 판을 이어 쓰므로 남긴다.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') epoch += 1
    if (e.reason !== 'clear' && e.reason !== 'resume') {
      const memo = await sessionMemoKey($)
      if (memo) await $.store.delete(memo)
    }
    return next(e)
  })

  // 프롬프트 원문은 남기지 않는다. 이번 턴의 질문을 뽑을 때 쓰도록 들고만 있고,
  // 걸어 둔 질문이 있으면 이 말이 그 답인지 본다.
  // 체크한 질문은 다음 입력 때 지운다. 그 전까지는 ↺ 로 되돌릴 수 있다.
  on('prompt.submit', async ($, e, next) => {
    if (questions.some((q) => q.done)) {
      questions = questions.filter((q) => !q.done)
      await commit($)
    }
    const text = String(e.text || '').trim()
    if (text.startsWith('/')) return next(e)
    if (enabled) startTurn($)
    const fromPlugin = next.origin && next.origin.plugin && next.origin.plugin !== 'engine'
    // 다른 세션이 보낸 편지나 작업 알림처럼 태그로 감싸 들어온 입력은 사용자가 시킨 일이 아니다.
    lastPromptWrapped = Boolean(fromPlugin) || WRAPPED_INPUT.test(text)
    if (lastPromptWrapped) {
      if (enabled && LETTER_INPUT.test(text)) await buryByLetter($)
      return next(e)
    }
    letterArrived = false
    lastPrompt = text
    // 소식은 지난 턴 것이라 입력하면 바로 내리고, 첫 도구 호출 때 이번 턴 소식을 새로 짓는다.
    if (questions.some((q) => q.notice)) {
      questions = questions.filter((q) => !q.notice)
      await commit($)
    }
    liveAt = 0
    const shown = questions.find((q) => !q.done)
    if (enabled && shown) {
      // 확인 부탁은 손대지 않으면 내려가야 하므로 넘긴 입력을 센다. 결정 질문은 답하거나 풀릴 때만 내린다.
      const skipped = shown.decision ? 0 : (shown.skipped || 0) + 1
      if (skipped >= STALE_PROMPTS) {
        await removeItem($, shown.id)
      } else if (shown.asked) {
        // 답일 수 있는 말이 들어오면 판정이 끝날 때까지 띠에서 숨긴다. 답이 아니면 판정 뒤 다시 보인다.
        questions = questions.map((q) => (q.id === shown.id ? { ...q, skipped, judging: true } : q))
        await commit($)
        $.clock.after(DEFER_MS, () => checkShown($, shown, text))
      } else {
        questions = questions.map((q) => (q.id === shown.id ? { ...q, skipped } : q))
        await saveBoard($)
      }
    }
    if (enabled && pendingQuestion) {
      const question = pendingQuestion
      pendingQuestion = null
      await saveBoard($)
      $.clock.after(DEFER_MS, () => checkAnswered($, question, text))
    }
    return next(e)
  })

  // 턴이 끝나면 AI 가 묻고 끝났는지 본다. 서브에이전트·중단된 턴·편지로 연 턴은 뺀다.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) endTurn($)
    if (enabled && !e.agentId && !e.isAborted && !lastPromptWrapped && lastPrompt && e.answer) {
      const prompt = lastPrompt
      const answer = e.answer
      $.clock.after(DEFER_MS, () => holdQuestion($, prompt, answer))
    }
    // 편지로 연 턴에서도 질문이 풀릴 수 있으므로 같이 본다. 소식은 이번 턴 판정이 갈아 끼운다.
    const shown = questions.find((q) => !q.done && !q.notice)
    if (enabled && shown && !e.agentId && !e.isAborted && e.answer) {
      const prompt = lastPromptWrapped ? '' : lastPrompt
      const answer = e.answer
      $.clock.after(DEFER_MS, () => checkResolved($, shown, prompt, answer))
    }
    // 턴 끝에는 간격과 상관없이 새로 짓는다. 다음 입력 전까지 띠가 이 소식을 들고 있다.
    if (enabled && !e.agentId && !e.isAborted) {
      liveAt = Date.now()
      $.clock.after(DEFER_MS, () => liveNotice($))
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (enabled && !e.agentId) scheduleLive($)
    return next(e)
  })

  on('command.run', { command: 'noti' }, async ($, e) => {
    const args = String(e.args || '').trim()
    if (args === 'on' || args === 'off') {
      if ((args === 'on') !== enabled) await toggleEnabled($)
      return {}
    }
    if (args === 'clear') {
      await clearAll($)
      return { text: '알림을 비웠습니다.' }
    }
    if (args === 'hide' || args === 'show') {
      hidden = args === 'hide'
      hiddenAsk = hidden ? await readPinAsk($) : ''
      await commit($)
      return { text: hidden ? '알림 띠를 숨겼습니다. 새 핀 물음이 생기면 다시 보입니다.' : '알림 띠를 다시 보입니다.' }
    }
    if (args === 'faces') return { text: facesReport((await readMigrated($, FACES_KEY)) || {}) }
    await openPane($)
    return {}
  })

  // 입력창 위 띠. 버튼 없이 글자만 흐리게 한 줄 그린다. 체크는 /noti 화면에서 한다.
  //   ⎿  🤔 : 제목 후보 중에서 골라 주세요
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const own = questions.filter((q) => !q.done && !q.judging).pop()
    const pinAsk = await readPinAsk($)
    // 차례: 핀이 끝났는지 묻는 말, 이번 턴 소식, 답을 기다리는 질문, 지난 턴 소식.
    // 사용자가 직접 꽂은 일의 끝맺음을 가장 먼저 챙긴다.
    if (hidden && (!pinAsk || pinAsk === hiddenAsk)) return next(e)
    const item = (pinAsk && { id: 'pin-ask', text: pinAsk, kind: 'check' })
      || (turnRunning && liveItem) || own
    // 턴이 도는 동안에도 보여서, 답할 일이 남았다는 것을 작업을 기다리며 알 수 있게 한다.
    if (!item) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // 다른 mod(핀보드 등)가 같은 띠에 그린 것을 지우지 않도록 그 결과를 같이 담는다.
    const theirs = await next(e)

    const lead = turnRunning ? SPIN_FRAMES[spinFrame] + LEAD_GAP : BAND_LEAD
    const chars = Array.from(bandIcon(item) + item.text)
    shownLength = chars.length
    let parts = [Text({ dimColor: true, children: [chars.join('')] })]
    if (shimmer && (shimmer.id === item.id || shimmer.id === SWEEP_ANY)) {
      const end = Math.min(shimmer.pos, chars.length)
      const start = Math.max(0, shimmer.pos - SHIMMER_WIDTH)
      parts = [
        Text({ dimColor: true, children: [chars.slice(0, start).join('')] }),
        Text({ bold: true, children: [chars.slice(start, end).join('')] }),
        Text({ dimColor: true, children: [chars.slice(end).join('')] }),
      ]
    }

    const line = Box({
      flexDirection: 'row',
      columnGap: 1,
      paddingLeft: INDENT,
      children: [Text({ wrap: 'truncate-end', children: [Text({ dimColor: true, children: [lead] }), ...parts] })],
    })

    return Box({
      flexDirection: 'column',
      children: [...(theirs ? [theirs] : []), line],
    })
  })

  // 알림 화면. 자른 글을 전부 보여 주고 체크·삭제와 기록 끄기를 한다.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)

    const row = (item, i) =>
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({
            key: 'check-' + item.id,
            label: item.done ? '[v]' : '[ ]',
            plain: true,
            dimColor: item.done,
            onPress: () => toggleItem($, item.id),
          }),
          Text(
            item.done
              ? { dimColor: true, wrap: 'truncate-end', children: [i + 1 + '. ' + strike(item.text)] }
              : { wrap: 'truncate-end', children: [i + 1 + '. ' + item.text] },
          ),
          Button({
            key: 'drop-' + item.id,
            label: 'x',
            plain: true,
            dimColor: true,
            onPress: () => removeItem($, item.id),
          }),
        ],
      })

    const body =
      questions.length > 0
        ? questions.map(row)
        : [Text({ dimColor: true, children: ['알림이 없습니다.'] })]

    return Box({
      flexDirection: 'column',
      children: [
        ...body,
        Text({ children: [' '] }),
        Button({
          key: 'toggle-auto',
          label: enabled ? '알림 기록 켜짐' : '알림 기록 꺼짐',
          hotkey: 'a',
          plain: true,
          dimColor: !enabled,
          onPress: () => toggleEnabled($),
        }),
      ],
    })
  })
}
