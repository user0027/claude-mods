"""pinboard·noti README 의 띠 GIF(<플러그인>/docs/band.gif)를 그린다.

사람이 녹화하지 않고 Claude Code 화면을 Pillow 로 재현한다. 실제 기록이 화면에 나오지 않게 장면 문구는 지어낸 것이다.
Windows 와 D2Coding 글꼴(사용자 글꼴 폴더)이 필요하다. 인자로 출력할 루트를 주면 거기에 쓰고, 없으면 이 저장소에 쓴다.
"""
import os
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

USER_FONTS = Path(os.environ['LOCALAPPDATA']) / 'Microsoft/Windows/Fonts'
SYS_FONTS = Path('C:/Windows/Fonts')
PX = 15
REGULAR = ImageFont.truetype(str(next(USER_FONTS.glob('D2Coding-Ver*.ttf'))), PX)
BOLD = ImageFont.truetype(str(next(USER_FONTS.glob('D2CodingBold-Ver*.ttf'))), PX)
SYMBOL = ImageFont.truetype(str(SYS_FONTS / 'seguisym.ttf'), PX)
EMOJI = ImageFont.truetype(str(SYS_FONTS / 'seguiemj.ttf'), PX)
EMOJI_CHARS = set('📌🤔👀😊💡✅')

# 터미널 설정의 cellHeight 1.2 와 맞춘다.
CELL_W = round(REGULAR.getlength('M'))
CELL_H = round(PX * 1.2)
PAD = 16
COLS = 66
ROWS = 15

BG = (12, 12, 12)
COLORS = {
    'n': (204, 204, 204),
    'd': (118, 118, 118),
    'b': (250, 250, 250),
    'r': (231, 72, 86),
    'o': (215, 119, 87),
    'g': (22, 198, 12),
    'y': (193, 156, 0),
    'line': (90, 90, 90),
}


@lru_cache(None)
def has_glyph(font, ch):
    return bytes(font.getmask(ch)) != bytes(font.getmask('\U000F0000'))


def width(ch):
    return 2 if ch in EMOJI_CHARS or unicodedata.east_asian_width(ch) in 'WF' else 1


def font_for(ch, style):
    if ch in EMOJI_CHARS:
        return EMOJI
    base = BOLD if style == 'b' else REGULAR
    return base if has_glyph(base, ch) else SYMBOL


def draw_line(draw, row, segments):
    col = 0
    y = PAD + row * CELL_H + CELL_H / 2
    for text, style in segments:
        for ch in text:
            cx = PAD + (col + width(ch) / 2) * CELL_W
            font = font_for(ch, style)
            if font is EMOJI:
                draw.text((cx, y), ch, font=font, anchor='mm', embedded_color=True)
            elif ch != ' ':
                draw.text((cx, y), ch, font=font, fill=COLORS[style], anchor='mm')
            col += width(ch)


BOX = [('', 'box')]
SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
STAR = '·✢✳✶✻✽✻✶✳✢'
# register.js 의 INDENT 와 맞춘다.
INDENT = '  '


class Scene:
    def __init__(self):
        self.transcript = []
        self.band = []
        self.working = None  # 작업 시작 뒤 지난 프레임 수
        self.typed = ''
        self.pane = None
        self.frames = []
        self.tick = 0

    def say(self, *lines):
        if self.transcript:
            self.transcript.append([])
        self.transcript.extend(lines)

    def lines(self):
        body = list(self.transcript)
        if self.working is not None:
            star = STAR[self.tick % len(STAR)]
            secs = self.working // 8
            body += [[], [(star + ' Working… ', 'o'), (f'({secs}s · esc to interrupt)', 'd')]]
        band = [seg(self) if callable(seg) else seg for seg in self.band]
        # 선 문자는 줄 높이보다 짧게 그려져 끊겨 보이므로 테두리는 save 에서 선으로 그린다.
        box = [
            BOX,
            [('  > ', 'n'), (self.typed, 'n'), ('▌' if self.tick % 8 < 5 or self.typed else ' ', 'd')],
            BOX,
            [('  ? for shortcuts', 'd')],
        ]
        if self.pane:
            box = [BOX, *self.pane, BOX, [('  Esc to close', 'd')]]
        tail = band + box
        keep = ROWS - len(tail)
        return body[-keep:] + tail if body else tail

    def hold(self, ms, step=120):
        for _ in range(max(1, ms // step)):
            self.frames.append((self.lines(), step))
            self.tick += 1
            if self.working is not None:
                self.working += 1

    def type(self, text, step=45):
        for i in range(1, len(text) + 1):
            self.typed = text[:i]
            self.frames.append((self.lines(), step))
            self.tick += 1
        self.hold(300)

    def enter(self):
        self.say([('> ' + self.typed, 'd')])
        self.typed = ''


def lead(face, spinning=False):
    def make(scene):
        head = SPIN[scene.tick % len(SPIN)] if spinning and scene.working is not None else '⎿'
        return [(INDENT + head + '  ', 'd'), (face, 'n'), (' : ', 'd')]
    return make


def band_line(face, text, style='d', spinning=False, shimmer=None):
    """띠 한 줄. shimmer 는 (시작 tick, 프레임 수) 이고 그 동안 밝은 세 칸이 문장을 훑는다."""
    def make(scene):
        head = lead(face, spinning)(scene)
        if shimmer is None:
            return head + [(text, style)]
        start, span = shimmer
        chars = list(text)
        pos = round((scene.tick - start + 1) * (len(chars) + 3) / span)
        if pos <= 0 or pos > len(chars) + 3:
            return head + [(text, style)]
        a, b = max(0, pos - 3), min(pos, len(chars))
        return head + [s for s in [(''.join(chars[:a]), style), (''.join(chars[a:b]), 'b'), (''.join(chars[b:]), style)] if s[0]]
    return make


def ai(text):
    return [('⏺ ', 'n'), (text, 'n')]


def tool(name, arg, result):
    return [[('⏺ ', 'g'), (name, 'b'), (f'({arg})', 'n')], [('  ⎿  ', 'd'), (result, 'd')]]


def pinboard():
    s = Scene()
    s.hold(300)
    s.type('/pin !릴리스 노트 쓰기')
    s.enter()
    notes = lambda sc: lead('📌')(sc) + [('★ 릴리스 노트 쓰기', 'r')]
    s.band = [notes]
    s.hold(300)
    s.type('/pin 버전 태그 달기')
    s.enter()
    tag = lambda sc: lead('📌')(sc) + [('버전 태그 달기', 'n')]
    s.band = [notes, tag]
    s.hold(400)
    s.type('릴리스 노트 초안 써 줘')
    s.enter()
    s.working = 0
    s.hold(400)
    s.say(*tool('Bash', 'git log v1.3.1..HEAD --oneline', '12 commits'))
    s.hold(400)
    s.say(*tool('Write', 'CHANGELOG.md', 'Wrote 18 lines to CHANGELOG.md'))
    s.hold(300)
    s.working = None
    s.say(ai('CHANGELOG.md에 1.4.0 초안을 썼어요.'))
    s.hold(500)
    s.type('/pins', step=90)
    s.typed = ''
    s.pane = [
        [('  핀보드', 'b')],
        [('  메모 ', 'n'), ('메모를 적고 Enter. 앞에 ! 를 붙이면 중요 표시', 'd')],
        [],
        [('  [ ] ', 'n'), ('1. ! 릴리스 노트 쓰기', 'y'), (' x', 'd')],
        [('  [ ] ', 'n'), ('2. 버전 태그 달기', 'n'), (' x', 'd')],
    ]
    s.hold(1500)
    s.pane = None
    s.hold(300)
    s.type('/pin 1', step=110)
    s.enter()
    s.transcript.append([('  ⎿  ✅ 끝냈습니다. 릴리스 노트 쓰기', 'd')])
    s.band = [tag]
    s.hold(2500)
    return s.frames


def noti():
    s = Scene()
    s.hold(500)
    s.type('다음 버전 번호 정해 줘')
    s.enter()
    s.working = 0
    s.band = [band_line('👀', '지난 릴리스 뒤 커밋을 살펴보고 있어요', spinning=True, shimmer=(s.tick, 12))]
    s.hold(600)
    s.say(*tool('Bash', 'git log v1.3.1..HEAD --oneline', '12 commits'))
    s.hold(500)
    s.working = None
    s.band = []
    s.say(ai('기능 추가가 있어 1.4.0이 맞아 보여요.'), [('  수정만 담으려면 1.3.2예요. 어느 쪽으로 할까요?', 'n')])
    s.hold(2000)
    s.type('그 전에 CHANGELOG 오타 봐 줘')
    s.enter()
    s.working = 0
    s.band = [band_line('👀', 'CHANGELOG 오타를 고치고 있어요', spinning=True, shimmer=(s.tick, 12))]
    s.hold(600)
    s.say(*tool('Edit', 'CHANGELOG.md', 'Updated CHANGELOG.md with 2 changes'))
    s.hold(500)
    s.working = None
    s.say(ai('오타 두 곳을 고쳤어요.'))
    s.band = [band_line('🤔', '버전을 1.4.0과 1.3.2 중에서 정해 주세요', shimmer=(s.tick, 14))]
    s.hold(3000)
    s.type('1.4.0으로')
    s.enter()
    s.working = 0
    s.band = [band_line('👀', '버전을 1.4.0으로 올리고 있어요', spinning=True, shimmer=(s.tick, 10))]
    s.hold(500)
    s.say(*tool('Edit', 'package.json', 'Updated package.json with 1 change'))
    s.hold(400)
    s.working = None
    s.say(ai('package.json 버전을 1.4.0으로 올렸어요.'), [('  다음은 v1.4.0 태그를 달면 돼요.', 'n')])
    s.band = [band_line('💡', 'v1.4.0 태그를 달아 릴리스를 마무리하세요', shimmer=(s.tick, 12))]
    s.hold(3000)
    return s.frames


def save(frames, path):
    images = []
    for lines, _ in frames:
        img = Image.new('RGB', (PAD * 2 + COLS * CELL_W, PAD * 2 + ROWS * CELL_H), BG)
        draw = ImageDraw.Draw(img)
        shown = lines[-ROWS:]
        top = ROWS - len(shown)
        edges = [top + i for i, segs in enumerate(shown) if segs is BOX]
        for row, segs in enumerate(shown):
            if segs is not BOX:
                draw_line(draw, top + row, segs)
        if edges:
            y0, y1 = (PAD + r * CELL_H + CELL_H / 2 for r in (edges[0], edges[-1]))
            draw.rounded_rectangle((PAD + CELL_W / 2, y0, PAD + (COLS - 0.5) * CELL_W, y1), radius=7, outline=COLORS['line'], width=1)
        images.append(img)
    # 이모지 색은 화면에서 차지하는 칸이 적어 팔레트에서 밀려나므로 크게 그린 이모지 줄을 같이 넣는다.
    picks = images[::5] + [images[-1]]
    strip = Image.new('RGB', (images[0].width, 80), BG)
    ImageDraw.Draw(strip).text((10, 5), ''.join(sorted(EMOJI_CHARS)), font=ImageFont.truetype(str(SYS_FONTS / 'seguiemj.ttf'), 60), embedded_color=True)
    sheet = Image.new('RGB', (images[0].width, images[0].height * len(picks) + strip.height * 6))
    for i, im in enumerate(picks):
        sheet.paste(im, (0, i * im.height))
    for i in range(6):
        sheet.paste(strip, (0, images[0].height * len(picks) + i * strip.height))
    palette = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    quantized = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
    path.parent.mkdir(parents=True, exist_ok=True)
    durations = [ms for _, ms in frames]
    quantized[0].save(path, save_all=True, append_images=quantized[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print(path, f'{path.stat().st_size / 1024:.0f}KB', f'{sum(durations) / 1000:.1f}s', len(frames))


if __name__ == '__main__':
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
    save(pinboard(), root / 'pinboard/docs/band.gif')
    save(noti(), root / 'noti/docs/band.gif')
