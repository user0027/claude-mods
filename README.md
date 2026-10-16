# claude-mods

Claude Code 입력창 위에 한 줄씩 붙는 mod 두 개다.

| mod | 하는 일 |
| --- | --- |
| [pinboard](pinboard/README.md) | 직접 적은 메모를 입력창 위에 고정한다. `/pin`, `/unpin` 으로 넣고 지운다. |
| [noti](noti/README.md) | 답하지 않고 넘어간 질문과 지금 할 일 소식을 알림 띠 한 줄로 보여 준다. |

## 설치

터미널에서 연 Claude Code 입력창에 친다. 둘 다 쓰려면 두 줄 다 친다.

```
/plugin install pinboard --marketplace user0027/claude-mods
/plugin install noti --marketplace user0027/claude-mods
```

처음 한 번 마켓플레이스를 추가할지 물으면 `y` 를 누르고, 범위는 Enter 로 사용자 범위를 고른다.
설치한 세션부터 바로 켜진다.

- Claude Code 2.1.287 이상이 필요하다.
- 데스크톱 앱의 Code 탭에서는 설치 명령이 안 된다. 터미널에서 설치하면 Code 탭에서도 로드된다.
