# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

MNIST로 학습한 CNN으로 손글씨 숫자를 인식하는 학습용 프로젝트입니다. 두 버전으로 나뉘고, 각 폴더에 자세한 CLAUDE.md가 있습니다.

- `desktop_version/`: PyTorch로 학습하고 tkinter 그림판에서 인식합니다. 웹용 가중치를 내보내는 `export_web.py`도 여기 있습니다.
- `web_version/`: 같은 가중치를 외부 라이브러리 없이 순수 자바스크립트로 추론하는 그림판 웹 앱입니다. GitHub Pages에 정적으로 배포합니다.
- `CLAUDE_전역.md`: 이 루트 `CLAUDE.md`를 그대로 복사한 파일. `CLAUDE.md`를 바꾸면 다시 복사해 둘을 같게 유지합니다.

**작성 규칙:** 코드, 주석, 변수·함수·클래스 이름을 모두 한글로 작성합니다(예: `모델_불러오기`, `전처리`, `숫자인식앱`). 사용자 요청이니 새 코드도 같은 방식을 따르세요. 파일 이름만 영어로 씁니다(웹 주소에서 한글 인코딩 문제를 피하기 위해서).

## 실행 환경 (Windows)

- Python 3.13이 `%LOCALAPPDATA%\Programs\Python\Python313\`에 설치되어 있고, CPU 전용 PyTorch를 씁니다(CUDA 없음).
- 오래 열려 있던 셸에서는 `python`이 Windows 스토어 바로가기(`WindowsApps\python.exe`)로 연결되어 실행되지 않을 수 있습니다. 이럴 때는 전체 경로로 실행하세요: `& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" <스크립트>`
- PowerShell에서 한글 출력이 깨지지 않도록 `$env:PYTHONIOENCODING = "utf-8"`을 먼저 설정하세요.
- Node.js는 없습니다. 웹 버전은 `python -m http.server`로 띄워 브라우저에서 확인합니다.

## 두 버전을 잇는 규칙

웹 버전은 데스크톱 버전과 같은 결과를 내야 합니다. 아래를 바꿨다면 이어지는 작업까지 하세요.

- **모델을 다시 학습했거나 `model.py`를 바꿨을 때**: `desktop_version`에서 `python export_web.py` → `web_version/test.html`이 모두 통과하는지 확인 → `web_version/model/`을 함께 커밋합니다. 웹이 모르는 층을 추가했다면 `export_web.py`의 `층_목록_만들기()`와 `web_version/js/cnn.js`에 그 층을 더해야 합니다.
- **`draw_app.py`의 `전처리()`나 정규화 상수를 바꿨을 때**: `web_version/js/preprocess.js`를 똑같이 고치고, `export_web.py`로 검사 데이터를 다시 만든 뒤 `test.html`로 확인합니다.
- **`draw_app.py`의 `캔버스_크기`·`펜_굵기`를 바꿨을 때**: `web_version/js/app.js`의 같은 이름 상수도 반드시 똑같이 바꿉니다. 붓 굵기가 캔버스 크기에 비례해야 28×28로 줄인 뒤의 글씨 굵기가 데스크톱과 같아지기 때문입니다.

## 배포

main 브랜치에 `web_version/`이 바뀌어 푸시되면 `.github/workflows/pages.yml`이 `web_version` 폴더만 GitHub Pages에 배포합니다. 주소는 `https://joykimus0423-dotcom.github.io/Study01_MNIST/`입니다. 저장소 Settings → Pages → Source가 "GitHub Actions"여야 합니다.
