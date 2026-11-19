---
name: pinboard
description: Explain how to add, view, edit, complete, and remove Pinboard notes in a Codex session.
---

Pinboard는 채팅에 입력한 명령을 UserPromptSubmit 훅에서 처리한다. 메모를 바꿔 달라는 일반 문장에는 아래 명령을 안내한다. 훅이 돌려준 처리 결과가 있으면 그대로 전달한다.

- `pin add 문구`로 추가한다. 문구 앞에 `!`를 붙이면 중요 표시가 붙는다.
- `pin list`로 목록과 번호를 본다.
- `pin edit 번호 새 문구`로 문구를 바꾼다.
- `pin done 번호`로 끝낸 메모를 표시한다.
- `pin remove 번호`로 지운다. `pin remove done`은 끝낸 메모를, `pin remove all`은 전체를 지운다.
