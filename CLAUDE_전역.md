# CLAUDE.md (전역)

이 PC에서 Claude Code로 하는 **모든 프로젝트**에 적용하는 규칙입니다. 실제 위치는 `C:\Users\지유\.claude\CLAUDE.md`이고, 이 저장소의 `CLAUDE_전역.md`는 그 사본입니다. 프로젝트의 `CLAUDE.md`가 다르게 정하면 프로젝트 쪽을 따릅니다.

## 언어

- 답변, 질문, 선택지, 요약은 모두 한국어로 씁니다.
- 새 코드는 변수·함수·클래스 이름과 주석을 한글로 씁니다(예: `모델_불러오기`, `전처리`). 파일 이름은 영어로 씁니다. 웹 주소나 도구에서 한글 파일 이름이 깨지는 것을 피하기 위해서입니다.
- 커밋 메시지는 한국어로 씁니다.

## 작업 방식

- 새 기능이나 구조 변경은 바로 코드를 쓰지 않습니다. 먼저 요구사항을 정리해 확인받고, 설계 → 구현 계획 순서로 진행합니다. Superpowers 스킬이 있으면 그 절차(brainstorming → writing-plans → 실행)를 따릅니다.
- 질문은 한 번에 하나씩, 가능하면 선택지로 묻습니다.
- "완료"라고 말하기 전에 실제로 실행해서 확인합니다. 확인하지 못한 부분은 확인하지 못했다고 그대로 알립니다.

## Git

- `main`에서 바로 구현하지 않습니다. 작업을 시작할 때 같은 폴더에서 작업 브랜치를 새로 만듭니다(`git switch -c <브랜치>`). 별도 워크트리는 만들지 않습니다.
- 커밋은 의미 있는 단위로 나눕니다.
- `main` 병합, 푸시, 배포처럼 저장소 밖에 영향을 주는 일은 사용자가 요청했을 때만 합니다.

## 실행 환경 (Windows)

- Python 3.13이 `%LOCALAPPDATA%\Programs\Python\Python313\`에 있습니다. `python`이 Windows 스토어 바로가기로 연결되어 실행되지 않을 수 있으니 전체 경로로 실행합니다.
  - PowerShell: `& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" <스크립트>`
  - Git Bash: `"$LOCALAPPDATA/Programs/Python/Python313/python.exe" <스크립트>`
- 한글 출력이 깨지지 않도록 `PYTHONIOENCODING=utf-8`을 설정합니다.
- Node.js와 `gh`(GitHub CLI)는 설치되어 있지 않습니다. 웹 페이지는 `python -m http.server`로 띄워 브라우저에서 확인합니다.
