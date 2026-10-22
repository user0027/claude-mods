// 핀보드: 작업 중에 남길 메모를 입력창 위에 고정한다.
//
// 띠에는 /pin 으로 직접 적은 메모만 나온다. 앞에 ! 를 붙이면 중요 표시가 되고, 끝낸 것은 체크한다.
// AI 가 물었는데 답하지 않고 넘어간 질문은 noti mod 몫이다.
// 판은 세션이 처음 뜬 작업 디렉터리별로 $.store 에 남는다.

const PANE = 'pinboard'
// noti 띠의 LEAD_GAP·ICON_SEP 과 같아야 두 띠의 글자 위치가 맞는다.
const LEAD_GAP = '  '
const ICON_SEP = ' : '
const BAND_LEAD = '⎿' + LEAD_GAP
// /pin 번호를 한 자리로 칠 수 있는 만큼만 둔다.
const MAX_MEMO = 4
const TEXT_LIMIT = 400
const MEMO_PREVIEW = 40
// noti 의 FEEDBACK_URL 과 같은 저장소다. 본문을 길게 채우면 링크가 줄을 넘어가 눌리지 않는다.
const FEEDBACK_URL = 'https://github.com/user0027/claude-mods/issues/new'

const KEY_PREFIX = 'pins:'
const GLOBAL_KEY = KEY_PREFIX + 'global'

// noti 띠의 INDENT 와 같은 값이어야 두 띠의 왼쪽이 맞는다.
const INDENT = 2

// 턴이 끝날 때 끝난 메모를 가리는 모델. 판정은 뒤에서 돌려 턴을 기다리게 하지 않는다.
const MODEL = 'haiku'
const MODEL_TIMEOUT_MS = 20000
const DEFER_MS = 50
const PROMPT_CLIP = 1500
const ANSWER_CLIP = 3000
// 다른 세션 편지·작업 알림처럼 태그로 감싸 들어온 입력
const WRAPPED_INPUT = /^<[a-z][a-z-]*[\s>]/

const PIN_ICON = '📌'
// 알림 mod 띠와 같은 모양으로 묻는다.
const ASK_ICON = '🤔'
const ASK_STATE = { plugin: 'pinboard', key: 'ask' }
// 알림 띠 mod 가 떠 있으면 묻는 줄을 그쪽 한 줄에 맡겨 같은 얼굴이 두 줄로 겹치지 않게 한다.
const HOST_STATE = { plugin: 'noti', key: 'hostsAsk' }
// 알림 mod 의 BAND_CHARS·BAND_RULE 과 같아야 한 띠에서 길이·말투가 맞는다.
const ASK_CHARS = 40
const ASK_RULE = `${ASK_CHARS}자 이내 한국어 한 문장으로 쓰고, '~했어요', '~해 주세요' 처럼 해요체 서술어로 끝낸다. '~완료', '~필요' 처럼 명사로 끝내지 않고, '~했다', '~합니다', '~입니까' 같은 다나까 말투도 쓰지 않는다.`
// 묻는 말이 '~했어요?' 꼴이면 아직 안 한 일까지 한 것처럼 읽힌다. 남은 단계 이야기만 하면 모델이 문장을 비우므로 비우지 말라고 같이 적는다.
const ASK_FORM = '묻는 문장은 비우지 않는다. 문장에는 실제로 끝난 일만 적고, 답변에서 아직 안 했거나 해도 될지 물은 단계(커밋·배포 등)는 한 것처럼 적지 않는다. \'~했어요?\' 처럼 끝맺지 않고 \'~끝난 걸로 볼지 알려 주세요\' 처럼 끝맺는다.'
// 그래도 끝난 번호만 주고 문장을 비울 때가 있어 대신 띄운다.
const FALLBACK_ASK = '끝난 것 같은 메모가 있어요. 끝난 걸로 볼지 알려 주세요.'
// 끝난 번호와 함께 물을 문장까지 받으므로 넉넉히 둔다.
const AUTO_CHECK_MAX_TOKENS = 160
const COMMIT_LIMIT = 30
const GIT_TIMEOUT_MS = 5000
const COLOR_IMPORTANT = 'red'
const COLOR_PANE_IMPORTANT = 'yellow'

// 모듈이 다시 로드되면 초기화되므로 session.start 에서 $.store 값을 다시 읽는다.
let storeKey = GLOBAL_KEY
let memos = []
// AI 가 끝난 것 같다고 본 메모 id. 체크는 사용자가 됐다고 답할 때만 한다.
let proposed = []
let askText = ''
// 커밋으로 끝났는지 마지막으로 본 시각(ms). '부족하다' 고 답한 메모를 같은 커밋으로 다시 묻지 않게 한다.
let scannedAt = 0
let seq = 0
// 이번 턴을 연 입력. 원문은 저장하지 않는다.
let lastPrompt = ''

function hasMemos(board) {
  const list = Array.isArray(board) ? board : board && board.memos
  return Array.isArray(list) && list.length > 0
}

// 하위 폴더에서 연 세션도 위쪽 폴더에 꽂아 둔 핀을 이어 쓰도록, 핀이 있는 가장 가까운 폴더 판을 고른다.
async function keyFromCwd($) {
  try {
    const cwd = await $.session.cwd()
    const path = typeof cwd === 'string' ? cwd : cwd && cwd.path
    if (!path) return GLOBAL_KEY
    const parts = path.split(/[\\/]/)
    const sep = path.includes('\\') ? '\\' : '/'
    for (let n = parts.length; n > 1; n--) {
      const key = KEY_PREFIX + parts.slice(0, n).join(sep)
      if (hasMemos(await $.store.get(key))) return key
    }
    return KEY_PREFIX + path
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
    // 빈 판을 기억하고 있으면 다시 찾는다. 그사이 위쪽 폴더에 핀이 생겼을 수 있다.
    if (typeof saved === 'string' && hasMemos(await $.store.get(saved))) return saved
  }
  const key = await keyFromCwd($)
  if (memo) await $.store.set(memo, key)
  return key
}

function sanitize(list) {
  if (!Array.isArray(list)) return []
  let kept = list.filter((item) => item && typeof item.text === 'string')
  // 한도를 줄여도 남은 메모보다 끝낸 메모가 먼저 빠지게 한다.
  while (kept.length > MAX_MEMO) kept = withoutOldest(kept)
  return kept
}

// 끝낸 것 중 가장 오래된 것, 없으면 가장 오래된 것을 뺀다.
function evictIndex(list) {
  const doneAt = list.findIndex((item) => item.done)
  return doneAt >= 0 ? doneAt : 0
}

function withoutOldest(list) {
  const out = evictIndex(list)
  return list.filter((_, i) => i !== out)
}

async function loadBoard($) {
  storeKey = await resolveStoreKey($)
  const saved = await $.store.get(storeKey)
  const board = saved && typeof saved === 'object' ? saved : {}
  // 배열만 저장된 옛 형태도 읽는다.
  memos = Array.isArray(saved) ? sanitize(saved) : sanitize(board.memos)
  proposed = Array.isArray(board.proposed) ? board.proposed.filter((id) => typeof id === 'string') : []
  askText = typeof board.askText === 'string' ? board.askText : ''
  scannedAt = Number(board.scannedAt) || 0
  await publishAsk($)
  // 띠는 읽기 전에 이미 한 번 그려졌으므로 다시 그리게 한다.
  refresh($)
}

function refresh($) {
  $.ui.invalidate('ui.render')
}

async function commit($) {
  proposed = proposed.filter((id) => memos.some((item) => item.id === id && !item.done))
  if (proposed.length === 0) askText = ''
  await $.store.set(storeKey, { memos, proposed, askText, scannedAt })
  await publishAsk($)
  refresh($)
}

// 알림 띠가 이 문장을 자기 줄로 합쳐 그리도록 내놓는다.
async function publishAsk($) {
  const text = proposed.length > 0 && askText ? askText : ''
  await $.state.set(ASK_STATE, text).catch(() => {})
}

function shorten(text, limit) {
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

// Text 에 취소선 속성이 없어 결합 문자를 붙인다. ANSI 취소선은 호스트가 띠를 통째로 버린다.
function strike(text) {
  return Array.from(text)
    .map((ch) => ch + '̶')
    .join('')
}

// seq 는 다시 로드되면 0 부터라 시각을 섞어야 저장된 id 와 겹치지 않는다.
function newId() {
  seq += 1
  return 'm' + Date.now().toString(36) + '-' + seq
}

function makeMemo(input) {
  let text = String(input || '').trim()
  let important = false
  while (text.startsWith('!')) {
    important = true
    text = text.slice(1).trim()
  }
  if (!text) return null
  return { id: newId(), text: shorten(text, TEXT_LIMIT), important, done: false }
}

async function addMemo($, input) {
  const memo = makeMemo(input)
  if (!memo) {
    $.ui.toast('고정할 메모를 같이 적어 주세요.')
    return
  }
  if (memos.length >= MAX_MEMO) {
    $.ui.toast('밀려난 메모: ' + shorten(memos[evictIndex(memos)].text, MEMO_PREVIEW))
    memos = withoutOldest(memos)
  }
  memos = [...memos, memo]
  await commit($)
}

async function toggleItem($, id) {
  memos = memos.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
  await commit($)
}

async function removeItem($, id) {
  memos = memos.filter((item) => item.id !== id)
  await commit($)
}

async function clearDone($) {
  const left = memos.filter((item) => !item.done)
  if (left.length === memos.length) {
    $.ui.toast('끝낸 것이 없습니다.')
    return
  }
  memos = left
  await commit($)
}

function openPane($) {
  return $.ui.open({ id: PANE, title: '핀보드', focus: true, closeOnEscape: true })
}

// 번호는 띠에 보이는 순서와 맞춘다. 띠는 끝낸 메모를 감추므로 남은 것을 앞에, 끝낸 것을 뒤에 센다.
function numbered() {
  return [...memos.filter((item) => !item.done), ...memos.filter((item) => item.done)]
}

// /pin 2: 두 번째 메모를 완료로 바꾼다. 이미 끝낸 것이면 그대로 둔다.
async function feedbackText($) {
  const version = await $.session.version().then((v) => v.version).catch(() => '')
  const query = 'title=' + encodeURIComponent('[' + PANE + '] ') + '&body=' + encodeURIComponent('Claude Code ' + version)
  return '아래 링크에서 GitHub 이슈로 의견을 남겨 주세요.\n' + FEEDBACK_URL + '?' + query
}

async function markDone($, number) {
  const item = numbered()[number - 1]
  if (!item) return { text: '그 번호가 핀보드에 없습니다.' }
  if (item.done) return { text: '✅ 이미 끝낸 메모입니다. ' + shorten(item.text, MEMO_PREVIEW) }
  await toggleItem($, item.id)
  return { text: '✅ 끝냈습니다. ' + shorten(item.text, MEMO_PREVIEW) }
}

// 문구를 바꾸면 그 메모를 두고 하던 물음은 맞지 않게 되므로 거둔다.
async function editMemo($, number, input) {
  const item = numbered()[number - 1]
  if (!item) return { text: '그 번호가 핀보드에 없습니다.' }
  const memo = makeMemo(input)
  if (!memo) return { text: '바꿀 문구를 같이 적어 주세요. 예) /pin edit 2 새 문구' }
  memos = memos.map((m) => (m.id === item.id ? { ...m, text: memo.text, important: memo.important } : m))
  proposed = proposed.filter((id) => id !== item.id)
  await commit($)
  return { text: '✏️ 문구를 고쳤습니다. ' + shorten(memo.text, MEMO_PREVIEW) }
}

async function unpin($, args) {
  if (args === 'done') {
    await clearDone($)
    return {}
  }
  if (args === 'all') {
    if (memos.length === 0) return { text: '핀보드가 비어 있습니다.' }
    const count = memos.length
    memos = []
    await commit($)
    return { text: '핀보드를 비웠습니다. ' + count + '개를 지웠습니다.' }
  }
  const index = Number.parseInt(args, 10) - 1
  if (Number.isNaN(index)) return { text: '지울 번호를 적어 주세요. 예) /unpin 2' }
  const item = numbered()[index]
  if (!item) return { text: '그 번호가 핀보드에 없습니다.' }
  await removeItem($, item.id)
  return { text: '핀보드에서 지웠습니다. ' + shorten(item.text, MEMO_PREVIEW) }
}

// 일반 화면에서는 띠에 마우스 클릭이 들어오지 않으므로 누르는 버튼을 두지 않는다.
// 숫자키를 단 Button 은 번호를 늘 그리므로 띠에는 글자만 두고, 체크는 /pin 번호나 /pins 화면에서 한다.
//   ⎿  📌 : ★ 배포 전에 .env 키 확인
//   ⎿  📌 : 두 번째 메모
function renderBand($, ui, theirs, hosted) {
  const { Box, Text } = ui
  const line = (children) => Box({ flexDirection: 'row', paddingLeft: INDENT, children })
  const lead = (icon) => [Text({ dimColor: true, children: [BAND_LEAD] }), Text({ children: [icon] }), Text({ dimColor: true, children: [ICON_SEP] })]

  // 한글에 결합 문자 취소선을 붙이면 깨져 보여서 띠에서는 흐리게만 그린다.
  const body = (item) => {
    if (item.important) return Text({ color: COLOR_IMPORTANT, wrap: 'truncate-end', children: ['★ ' + item.text] })
    return Text({ wrap: 'truncate-end', children: [item.text] })
  }

  // 줄마다 따로 읽히도록 모든 줄에 📌 를 붙인다.
  const row = (item) => line([...lead(PIN_ICON), body(item)])

  // 핀은 직접 고정한 메모라 다른 mod 띠보다 위에 둔다.
  const rows = memos.filter((item) => !item.done).map(row)
  const asking = memos.filter((item) => proposed.includes(item.id))
  const ask = asking.length > 0 && askText && !hosted
    ? [line([...lead(ASK_ICON), Text({ dimColor: true, wrap: 'truncate-end', children: [askText] })])]
    : []
  return Box({
    flexDirection: 'column',
    children: [...rows, ...ask, ...(theirs ? [theirs] : [])],
  })
}

function paneText(item, i) {
  const n = i + 1 + '. '
  if (item.done) return { dimColor: true, wrap: 'truncate-end', children: [n + strike(item.text)] }
  if (item.important) {
    return { color: COLOR_PANE_IMPORTANT, bold: true, wrap: 'truncate-end', children: [n + '! ' + item.text] }
  }
  return { wrap: 'truncate-end', children: [n + item.text] }
}

function renderPane($, ui) {
  const { Box, Text, Button, Input } = ui
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
        Text(paneText(item, i)),
        Button({ key: 'drop-' + item.id, label: 'x', plain: true, dimColor: true, onPress: () => removeItem($, item.id) }),
      ],
    })

  const body = memos.length > 0 ? numbered().map(row) : [Text({ dimColor: true, children: ['핀보드가 비어 있습니다.'] })]

  return Box({
    flexDirection: 'column',
    children: [
      Input({
        key: 'new-memo',
        label: '메모',
        placeholder: '메모를 적고 Enter. 앞에 ! 를 붙이면 중요 표시',
        value: '',
        submitLabel: '고정',
        autoFocus: true,
        onSubmit: (value) => addMemo($, value),
      }),
      Text({ children: [' '] }),
      ...body,
    ],
  })
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

// 이번 턴에서 끝난 것 같은 메모를 띠에서 묻는다. 체크는 사용자가 됐다고 답할 때만 한다.
async function autoCheck($, prompt, answer) {
  const open = memos.filter((item) => !item.done)
  if (open.length === 0) return
  const list = open.map((item, i) => i + 1 + '. ' + item.text).join('\n')
  const result = await $.model.complete({
    model: MODEL,
    system:
      'AI 코딩 도우미의 한 턴과 사용자가 고정해 둔 할 일 메모를 보고 JSON 한 줄로만 답한다. 형식은 {"done":[],"ask":""} 이다. ' +
      '이번 턴에서 실제로 끝났다고 답변에 드러난 메모의 번호만 done 에 넣는다. 시작만 했거나, 하겠다고만 했거나, 끝났는지 애매하면 넣지 않는다. ' +
      'AI 가 답변 끝에서 남은 단계를 해도 될지 물었으면 그 단계가 들어 있는 메모는 아직 끝나지 않은 것이다. ' +
      '사용자가 그 일을 끝냈다고 말한 것도 끝난 것으로 본다. ' +
      'done 이 비지 않았으면 ask 에 사용자에게 끝냈다고 봐도 될지 확인하는 문장을 적는다. ' + ASK_RULE + ' ' + ASK_FORM + ' ' +
      '무엇이 어떻게 됐는지 이번 턴 내용으로 구체적으로 적고, 남았을 수 있는 부분이 보이면 그것을 짚어 묻는다. ' +
      '메모 문구를 그대로 되풀이하지 않는다.',
    prompt:
      '메모:\n' + list +
      '\n\n사용자 요청:\n' + shorten(prompt, PROMPT_CLIP) +
      '\n\nAI 답변(끝부분):\n' + answer.slice(-ANSWER_CLIP),
    maxTokens: AUTO_CHECK_MAX_TOKENS,
    timeoutMs: MODEL_TIMEOUT_MS,
  })
  await proposeDone($, result, open)
}

async function proposeDone($, result, open) {
  if (!result.isAnswered) return false
  const parsed = parseJson(result.text)
  if (!parsed || !Array.isArray(parsed.done)) return false
  const ask = (typeof parsed.ask === 'string' ? parsed.ask.trim() : '') || FALLBACK_ASK
  // 판정 중에 메모가 바뀌었을 수 있으므로 번호가 아니라 id 로 고른다.
  const ids = parsed.done.map((n) => open[Number(n) - 1]).filter(Boolean).map((item) => item.id)
  const hits = ids.filter((id) => memos.some((item) => item.id === id && !item.done) && !proposed.includes(id))
  if (hits.length === 0) return false
  proposed = [...proposed, ...hits]
  askText = ask
  await commit($)
  return true
}

function pinnedAt(item) {
  const found = /^m([0-9a-z]+)-/.exec(item.id || '')
  return found ? parseInt(found[1], 36) : 0
}

function formatTime(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 일이 여러 턴·여러 세션에 걸쳐 끝나면 한 턴만 보는 autoCheck 가 놓친다. 판 폴더의 커밋으로 다시 본다.
async function commitCheck($) {
  if (!storeKey.startsWith(KEY_PREFIX) || storeKey === GLOBAL_KEY) return
  const dir = storeKey.slice(KEY_PREFIX.length)
  const open = memos.filter((item) => !item.done && !proposed.includes(item.id))
  const times = open.map(pinnedAt).filter(Boolean)
  if (times.length === 0) return
  const since = Math.max(Math.min(...times), scannedAt)
  const now = Date.now()
  let log
  try {
    log = await $.process.run(
      ['git', '-C', dir, 'log', '--no-merges', '-n', String(COMMIT_LIMIT), '--since=@' + Math.floor(since / 1000), '--format=%h %ad %s%n%b', '--date=format:%m-%d %H:%M'],
      { timeoutMs: GIT_TIMEOUT_MS },
    )
  } catch (error) {
    return
  }
  if (log.exitCode !== 0) return
  // 메모 문구와 다른 말로 끝낸 일은 본문에 '원하던 것은 ~였다' 처럼 이어지는 근거가 있어 본문까지 넘긴다.
  const commits = log.stdout
    .split('\n')
    .filter((line) => line.trim() && !/^Co-Authored-By:/i.test(line))
    .join('\n')
    .trim()
  scannedAt = now
  if (!commits) return commit($)
  const list = open.map((item, i) => i + 1 + '. ' + item.text + ' (꽂은 시각 ' + formatTime(pinnedAt(item)) + ')').join('\n')
  const result = await $.model.complete({
    model: MODEL,
    system:
      '사용자가 고정해 둔 할 일 메모와, 메모를 꽂은 뒤 그 폴더 저장소에 쌓인 커밋 목록을 보고 JSON 한 줄로만 답한다. 형식은 {"done":[],"ask":""} 이다. ' +
      '꽂은 시각 뒤의 커밋이 그 메모의 일을 해냈다고 볼 수 있는 메모 번호만 done 에 넣는다. 메모 문구와 커밋 제목의 낱말이 달라도 같은 일이면 넣는다. ' +
      '그 일을 되돌린 커밋이 뒤에 있고 다시 해낸 커밋이 없으면 넣지 않는다. 애매하면 넣지 않는다. ' +
      'done 이 비지 않았으면 ask 에 끝냈다고 봐도 될지 묻는 문장을 적는다. 근거가 된 커밋 해시 7자리를 문장 안에 넣는다. ' + ASK_RULE + ' ' + ASK_FORM,
    prompt: '메모:\n' + list + '\n\n커밋(최근 것부터):\n' + commits,
    maxTokens: AUTO_CHECK_MAX_TOKENS,
    timeoutMs: MODEL_TIMEOUT_MS,
  })
  if (!(await proposeDone($, result, open))) await commit($)
}

// 묻고 있는 메모에 사용자가 됐다고 답했으면 끝낸 것으로, 부족하다고 했으면 묻기를 거둔다. 상관없는 말이면 둔다.
async function checkConfirm($, prompt) {
  const asking = memos.filter((item) => proposed.includes(item.id))
  if (asking.length === 0) return
  const result = await $.model.complete({
    model: MODEL,
    system:
      'AI 가 사용자 메모 몇 개를 두고 끝냈다고 봐도 될지 물었다. 그 뒤 사용자의 말을 보고 JSON 한 줄로만 답한다. ' +
      '형식은 {"verdict":"done","text":""} 이다. 됐다·맞다·충분하다처럼 끝난 것을 인정하면 done, ' +
      '아직 부족하다·더 고칠 게 있다고 하면 more, 그 메모들과 상관없는 다른 일만 말했으면 none 이다. 애매하면 none 이다. ' +
      '아직 확인은 남았는데 사용자의 말로 사정이 바뀌어 물은 말이 맞지 않게 됐으면 update 로 하고, text 에 고친 문장을 적는다. ' + ASK_RULE + ' ' + ASK_FORM,
    prompt:
      '물은 말:\n' + askText +
      '\n\n물은 메모:\n' + asking.map((item) => '- ' + item.text).join('\n') +
      '\n\n사용자가 한 말:\n' + shorten(prompt, PROMPT_CLIP),
    maxTokens: AUTO_CHECK_MAX_TOKENS,
    timeoutMs: MODEL_TIMEOUT_MS,
  })
  if (!result.isAnswered) return
  const parsed = parseJson(result.text)
  const verdict = parsed && parsed.verdict
  if (verdict === 'update' && typeof parsed.text === 'string' && parsed.text.trim() && proposed.length > 0) {
    askText = shorten(parsed.text.trim(), TEXT_LIMIT)
    await commit($)
    return
  }
  if (verdict !== 'done' && verdict !== 'more') return
  const ids = asking.map((item) => item.id)
  if (verdict === 'done') memos = memos.map((item) => (ids.includes(item.id) ? { ...item, done: true } : item))
  proposed = proposed.filter((id) => !ids.includes(id))
  await commit($)
}

// 직접 추가한 마켓플레이스는 자동 업데이트가 기본으로 꺼져 있어, 새 버전이 나와도 설치한 사람이 알 길이 없다.
const UPDATE_KEY = KEY_PREFIX + 'updates'
const UPDATE_URL = 'https://raw.githubusercontent.com/user0027/claude-mods/main/pinboard/.claude-plugin/plugin.json'
const UPDATE_EVERY_MS = 24 * 60 * 60 * 1000
// 세션이 막 뜰 때 띄우면 첫 화면에 묻힌다.
const UPDATE_DELAY_MS = 3000
const UPDATE_TOAST_MS = 15000

function isNewer(remote, local) {
  const a = String(remote).split('.').map(Number)
  const b = String(local).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

async function checkUpdate($) {
  const saved = (await $.store.get(UPDATE_KEY)) || {}
  if (saved.enabled === false || Date.now() - (Number(saved.checkedAt) || 0) < UPDATE_EVERY_MS) return
  if (await $.env.get('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC')) return
  await $.store.set(UPDATE_KEY, { ...saved, checkedAt: Date.now() })
  try {
    const local = JSON.parse(await $.fs.read($.plugin.root + '/.claude-plugin/plugin.json')).version
    const response = await $.http.fetch(UPDATE_URL)
    if (!response.ok) return
    const remote = JSON.parse(response.text).version
    if (!isNewer(remote, local)) return
    $.ui.toast(
      `새 버전(${remote})이 나왔어요. 터미널에서 claude plugin update pinboard@claude-mods 로 받아 주세요.`,
      { timeoutMs: UPDATE_TOAST_MS },
    )
  } catch (error) {
    // 오프라인이거나 저장소를 못 읽으면 다음 날 다시 확인한다.
  }
}

async function setUpdateCheck($, on) {
  const saved = (await $.store.get(UPDATE_KEY)) || {}
  await $.store.set(UPDATE_KEY, { ...saved, enabled: on })
  return { text: on ? '새 버전이 나오면 알려 드릴게요.' : '새 버전 확인을 껐습니다.' }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await loadBoard($)
    $.clock.after(DEFER_MS, () => commitCheck($))
    $.clock.after(UPDATE_DELAY_MS, () => checkUpdate($))
    // 이름이 겹치면 register 가 던지고 뒤 줄이 실행되지 않으므로 묶어서 받는다.
    try {
      await $.command.register({
        name: 'pin',
        description: '메모를 입력창 위에 고정. 앞에 ! 를 붙이면 중요 표시',
        argumentHint: '[메모 | 끝낸 번호 | edit 번호 문구 | updates on | updates off | feedback]',
      })
      await $.command.register({ name: 'pins', description: '핀보드 열기' })
      await $.command.register({ name: 'unpin', description: '고정한 메모 삭제', argumentHint: '[번호 | done | all]' })
    } catch (error) {
      $.ui.log('명령을 등록하지 못했습니다. ' + error.message)
    }
    return next(e)
  })

  // /clear·/resume·/branch 뒤에는 session.start 가 다시 돌지 않는다.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await loadBoard($)
    $.clock.after(DEFER_MS, () => commitCheck($))
    return next(e)
  })

  // /clear·/resume 은 같은 판을 이어 쓰므로 기억한 키를 남긴다.
  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear' && e.reason !== 'resume') {
      const memo = await sessionMemoKey($)
      if (memo) await $.store.delete(memo)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const text = String(e.text || '').trim()
    if (!text.startsWith('/') && !WRAPPED_INPUT.test(text)) {
      lastPrompt = text
      if (proposed.length > 0) $.clock.after(DEFER_MS, () => checkConfirm($, text))
    }
    return next(e)
  })

  // 편지로 연 턴도 일을 끝낼 수 있으므로 같이 본다. 서브에이전트·중단된 턴은 뺀다.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && !e.isAborted && e.answer && memos.some((item) => !item.done)) {
      const prompt = lastPrompt
      const answer = e.answer
      $.clock.after(DEFER_MS, () => autoCheck($, prompt, answer))
    }
    return next(e)
  })

  on('command.run', { command: 'pin' }, async ($, e) => {
    const args = String(e.args || '').trim()
    if (args === 'feedback') return { text: await feedbackText($) }
    if (args === 'updates on' || args === 'updates off') return setUpdateCheck($, args === 'updates on')
    // 숫자만 적은 메모는 쓸 일이 없으므로 번호로 읽는다.
    const done = args.match(/^(?:done\s+)?(\d+)$/)
    if (done) return markDone($, Number(done[1]))
    const edit = args.match(/^edit\s+(\d+)\s*([\s\S]*)$/)
    if (edit) return editMemo($, Number(edit[1]), edit[2])
    if (!args) {
      await openPane($)
      return {}
    }
    await addMemo($, args)
    return {}
  })

  on('command.run', { command: 'pins' }, async ($) => {
    await openPane($)
    return {}
  })

  on('command.run', { command: 'unpin' }, async ($, e) => unpin($, String(e.args || '').trim()))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // 끝낸 메모까지 그리면 띠가 비지 않아 엔진의 [-] 도 계속 남는다. 끝낸 것은 /pins 화면에서 본다.
    if (!memos.some((item) => !item.done)) return next(e)
    const ui = $.ui.resolve(e)
    const { value: hosted = false } = await $.state.get(HOST_STATE).catch(() => ({}))
    // 다른 mod 가 같은 띠에 그린 것을 같이 담는다.
    return renderBand($, ui, await next(e), hosted)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    return renderPane($, $.ui.resolve(e))
  })
}
