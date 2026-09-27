# CLAUDE.md (web_version)

이 폴더는 손글씨 숫자 인식 그림판의 웹 버전입니다. 데스크톱 버전과 같은 CNN 가중치를 **외부 라이브러리 없이 순수 자바스크립트로** 추론하고, GitHub Pages에 정적 파일로 배포합니다. 프로젝트 전체 규칙(한글 작성 규칙 등)은 루트 `CLAUDE.md`를 보세요.

## 반드시 지킬 것

- 외부 라이브러리·CDN·npm·빌드 도구를 쓰지 않습니다. 브라우저 내장 기능과 ES 모듈만 씁니다.
- 모든 파일 주소는 상대 경로로 씁니다. 사이트가 `https://joykimus0423-dotcom.github.io/Study01_MNIST/` 하위 경로에 배포되므로 `/`로 시작하는 주소는 깨집니다. 모델 주소는 `new URL("model/", document.baseURI)`로 만듭니다.
- 코드 속 이름·주석, `model.json` 키, HTML id, CSS 클래스는 한글로 씁니다. 파일 이름만 영어입니다.

## 실행과 검사

`file://`로 직접 열면 브라우저가 모듈과 `fetch`를 막아 동작하지 않습니다. 반드시 로컬 서버로 엽니다.

```bash
python -m http.server 8000     # 이 폴더에서 실행 → http://localhost:8000/ , 검사는 /test.html
```

저장소 루트에서 띄우고 `http://localhost:8000/web_version/`으로 열면 GitHub Pages와 같은 하위 경로 상황을 확인할 수 있습니다(Claude는 `.claude/launch.json`의 `web` 서버를 씁니다. 이 파일은 로컬 전용이라 git에 올리지 않으며(.gitignore 처리), 저장소 루트에서 Python 3.13 인터프리터로 `-m http.server 8000`을 실행하는 `web` 설정 하나만 있으면 됩니다).

- `test.html`: JS 결과를 데스크톱(PyTorch) 결과와 대조합니다. 파이썬 반올림, 빈 그림, 전처리(28×28 모든 픽셀 일치), 추론(확률 차이 1e-4 이하), 전체(예측 숫자 일치)를 검사하고, 요약에 `모두 통과 (N개)`가 나와야 합니다. 코드를 바꾸면 항상 이 페이지로 확인하세요.
- Node.js가 설치되어 있지 않으므로 검사는 브라우저에서 돌립니다.

## 파일 구조

- `index.html`, `style.css`: 그림판 화면. `file://`로 열었을 때 안내 문구를 띄우는 인라인 스크립트가 있습니다.
- `js/app.js`: 그림판. 화면 캔버스와 별도로 메모리의 280×280 `Uint8Array`(검은 바탕 0, 흰 글씨 255)에 같은 획을 그리고, 인식에는 이 배열만 씁니다. 포인터 이벤트로 마우스와 터치를 함께 처리하고, 좌표는 캔버스가 화면에서 몇 px로 보이든 280×280 기준으로 바꿉니다. 손을 떼면 자동으로 인식합니다.
- `js/preprocess.js`: `desktop_version/draw_app.py`의 `전처리()`를 한 단계씩 그대로 옮긴 것입니다. 크기 변경은 Pillow의 LANCZOS 계산(가로→세로 두 단계, 22비트 고정소수점, 단계마다 0~255로 자름)을 그대로 재현하고, 반올림은 파이썬 `round()`처럼 .5를 짝수 쪽으로 합니다. **데스크톱 `전처리()`와 한 픽셀이라도 달라지면 안 됩니다.**
- `js/cnn.js`: `model.json`의 층 목록(`합성곱`, `ReLU`, `최대풀링`, `펼치기`, `완전연결`)을 차례로 실행하고 소프트맥스 확률을 돌려줍니다. 값은 `Float32Array`에 채널·세로·가로 순서로 둡니다.
- `js/test.js`, `test.html`: 대조 검사.
- `model/`: **손으로 고치지 마세요.** `desktop_version`에서 `python export_web.py`로 다시 만듭니다.
  - `model.json`: `형식`, `입력모양`, `정규화`(평균·표준편차), `전체개수`, `층`. 가중치가 있는 층은 `가중치`·`편향`에 `{위치, 개수}`(float32 원소 단위)가 있습니다. 배치정규화는 합성곱에 합쳐져 있고 드롭아웃은 빠져 있습니다.
  - `weights.bin`: float32 리틀엔디언 가중치.
  - `test_cases.json`: 검사 입력(280×280)과 데스크톱 전처리 결과(28×28), PyTorch 확률.

## 배포

main 브랜치에 이 폴더가 바뀌어 푸시되면 `.github/workflows/pages.yml`이 이 폴더만 GitHub Pages에 올립니다. 저장소 Settings → Pages → Source가 "GitHub Actions"로 되어 있어야 합니다.
