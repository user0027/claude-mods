# claude-mods

Claude Code 입력창 위에 한 줄씩 붙는 mod 두 개예요.

| mod | 하는 일 |
| --- | --- |
| [📌 pinboard](pinboard/README.md) | 직접 적은 메모를 입력창 위에 고정해요. |
| [🤔 noti](noti/README.md) | 답하지 않고 넘어간 AI 질문과 지금 하는 일을 한 줄로 알려 줘요. |

## 설치

터미널에서 연 Claude Code 입력창에 쳐요. 둘 다 쓰려면 두 줄 다 치면 돼요.

```
/plugin install pinboard --marketplace user0027/claude-mods
/plugin install noti --marketplace user0027/claude-mods
```

처음 한 번 마켓플레이스를 추가할지 물으면 `y`, 범위는 Enter 로 사용자 범위를 고르세요.
설치한 세션부터 바로 켜져요.

- Claude Code 2.1.287 이상이 필요해요.
- 데스크톱 앱의 Code 탭에서는 설치 명령이 안 돼요. 터미널에서 설치하면 Code 탭에서도 로드되고요.

## 업데이트

새 버전은 저절로 들어오지 않아요. Claude Code 는 직접 추가한 마켓플레이스를 자동 업데이트하지 않거든요.
대신 새 버전이 나오면 세션을 열 때 화면 오른쪽 위에 받는 명령을 알려 드려요. 하루에 한 번만 확인하고,
`/pin updates off` · `/noti updates off` 로 끌 수 있어요.

자동으로 받으려면 처음 한 번만 켜 두세요. `/plugin` 을 열고 Marketplaces 탭에서 `claude-mods` 를 골라
Enable auto-update 를 켜면 돼요.

손으로 받을 때는 터미널에서 이렇게 쳐요.

```
claude plugin marketplace update claude-mods
claude plugin update pinboard@claude-mods
claude plugin update noti@claude-mods
```

어느 쪽이든 이미 열려 있는 세션은 `/reload-plugins` 를 치거나 새 세션을 열어야 새 버전으로 돌아요.
