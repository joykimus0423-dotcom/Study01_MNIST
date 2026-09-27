# 웹 버전 / 데스크톱 버전 분리 설계

작성일: 2026-09-27

## 목표

손글씨 숫자 인식 프로그램을 두 버전으로 나눈다.

- **desktop_version/**: 기존 PyTorch + tkinter 코드를 그대로 옮긴다.
- **web_version/**: 외부 라이브러리 없이 순수 자바스크립트로 추론하는 그림판 웹 앱을 새로 만들고, GitHub Pages에 정적으로 배포한다.
- 루트와 각 폴더에 CLAUDE.md를 둔다.

### 성공 기준

1. `desktop_version`에서 `python draw_app.py`, `python train.py`가 이동 전과 똑같이 동작한다.
2. 웹 버전이 데스크톱과 **같은 28×28 입력**(픽셀 단위 일치)과 **같은 확률**(오차 1e-4 이하)을 만든다. `test.html`로 확인한다.
3. 웹 버전은 마우스와 터치 모두로 그릴 수 있고, 인식 결과·확신도·0~9 확률 막대그래프·28×28 미리보기를 보여 준다.
4. main에 푸시하면 GitHub Actions가 `web_version` 폴더만 GitHub Pages에 배포한다.

### 정한 사항

| 항목 | 결정 |
|------|------|
| 배포 | GitHub Actions로 `web_version`만 사이트 루트로 배포 |
| 가중치 | 기존 `mnist_cnn.pt`를 float32로 변환 (배치정규화는 합성곱에 합침) |
| 화면 | 데스크톱과 같은 기능 + 터치 지원 |
| 구현 | 역할별 ES 모듈, PIL LANCZOS를 JS로 재현, PyTorch 정답과 대조 검사 |

### 작성 규칙

- 코드 속 변수·함수·클래스 이름과 주석은 한글로 쓴다(기존 규칙). `model.json`의 키도 한글로 쓴다.
- **파일 이름은 영어로 쓴다.** 기존 파일 이름이 영어이고, 웹 주소에서 한글 인코딩 문제를 피하기 위해서다.

## 폴더 구조

```
study01_MNIST/
├── CLAUDE.md                   전체 개요 + 두 버전 안내
├── .gitignore                  desktop_version/data/ 등 경로 반영
├── .github/workflows/pages.yml web_version만 GitHub Pages로 배포
├── desktop_version/
│   ├── CLAUDE.md
│   ├── model.py  train.py  draw_app.py  requirements.txt  mnist_cnn.pt   (git mv, 내용 그대로)
│   └── export_web.py           mnist_cnn.pt → ../web_version/model/ 내보내기 + 검사 데이터 생성
└── web_version/
    ├── CLAUDE.md
    ├── index.html  style.css
    ├── test.html
    ├── js/
    │   ├── cnn.js              가중치 불러오기, 층 실행(합성곱·ReLU·최대풀링·펼치기·완전연결), 소프트맥스
    │   ├── preprocess.js       데스크톱 전처리()를 그대로 재현
    │   ├── app.js              그림판(포인터 이벤트), 결과 표시
    │   └── test.js             test_cases.json과 대조 검사
    └── model/
        ├── model.json          층 구성, 가중치 위치·개수, 정규화 상수
        ├── weights.bin         float32 리틀엔디언 가중치 (약 3.4MB)
        └── test_cases.json     검사 입력과 PyTorch 정답
```

- 로컬 MNIST 데이터(`data/`, git에 없음)는 `desktop_version/data/`로 옮긴다.
- 변환된 `model/` 파일은 git에 커밋한다. Actions에서는 PyTorch를 설치하지 않는다.

## 데이터 흐름

### 그리기 (app.js)

- 화면 캔버스와 별도로 메모리에 280×280 `Uint8Array`(검은 바탕 0, 흰 글씨 255)를 두고 같은 획을 그린다. 인식에는 이 배열만 쓴다.
- 획은 선분에서 거리 10(`펜_굵기`/2) 이내인 픽셀을 255로 채운다. 데스크톱의 선 + 끝점 원과 같은 모양이다.
- `pointerdown`/`pointermove`/`pointerup`으로 마우스와 터치를 함께 처리하고, 캔버스에 `touch-action: none`을 준다.
- 캔버스가 화면에서 작아져도 좌표는 280×280 기준으로 바꿔서 그린다.
- 손을 떼면 자동으로 인식한다. [인식하기]·[지우기] 버튼을 두고, 오른쪽 클릭으로도 지운다.

### 전처리 (preprocess.js)

`전처리(그림배열, 너비, 높이, 정규화)` → `null`(빈 그림) 또는 `{ 입력: Float32Array(784), 작은그림: Uint8Array(784) }`

1. 0이 아닌 픽셀의 경계상자를 구한다. 오른쪽·아래 끝은 PIL `getbbox`처럼 제외 경계다.
2. 잘라낸 뒤 긴 변이 20px이 되도록 크기를 바꾼다. 새 크기는 `max(1, round(변 × 배율))`이고, `round`는 파이썬처럼 .5를 짝수 쪽으로 반올림한다.
3. 크기 변경은 PIL `Image.LANCZOS`를 그대로 구현한다.
   - 필터: `sinc(x)·sinc(x/3)`, 지지 범위 3이다. 축소일 때는 배율만큼 넓힌다.
   - 가로 → 세로 순서의 분리형 두 단계로 처리한다.
   - 계수는 22비트 정수 고정소수점이다. 각 단계 결과를 반올림하고 0~255로 자른다.
4. 28×28 검은 바탕의 `((28-w)//2, (28-h)//2)`에 붙인다.
5. 무게중심을 구해 `이동 = round(14 - 중심)`만큼 정수 평행이동하고, 밖은 0으로 채운다.
6. `(값/255 - 평균) / 표준편차`로 정규화한다. 평균과 표준편차는 `model.json`에서 가져온다.

### 추론 (cnn.js)

- `모델_불러오기(기준주소)`는 `model.json`과 `weights.bin`을 `fetch`해 모델 객체를 돌려준다.
- `추론(모델, 입력)`은 층 목록을 차례로 실행한 뒤 소프트맥스 확률 `Float32Array(10)`을 돌려준다.
- 데이터 배치는 채널·세로·가로(CHW) 순서다. PyTorch `Flatten`과 순서가 같다.
- 층 종류: `합성곱`(패딩 있음, 편향 포함), `ReLU`, `최대풀링`, `펼치기`, `완전연결`.
- 드롭아웃은 추론 때 쓰지 않으므로 내보내지 않는다. 배치정규화는 내보낼 때 합성곱에 합친다.

### 가중치 형식

`weights.bin`에는 모든 텐서를 float32 리틀엔디언으로 이어 붙인다. `model.json` 예:

```json
{
  "형식": 1,
  "정규화": {"평균": 0.1307, "표준편차": 0.3081},
  "층": [
    {"종류": "합성곱", "입력채널": 1, "출력채널": 32, "커널": 3, "패딩": 1,
     "가중치": {"위치": 0, "개수": 288}, "편향": {"위치": 288, "개수": 32}},
    {"종류": "ReLU"},
    {"종류": "최대풀링", "크기": 2},
    {"종류": "펼치기"},
    {"종류": "완전연결", "입력": 3136, "출력": 256,
     "가중치": {"위치": 0, "개수": 802816}, "편향": {"위치": 0, "개수": 256}}
  ]
}
```

`위치`와 `개수`는 float32 원소 단위다(위 예의 위치 값은 모양만 보여 주기 위한 것이다).

### export_web.py

1. `mnist_cnn.pt`를 불러오고, 배치정규화를 합성곱에 합친다: `w' = w·γ/√(σ²+ε)`, `b' = (b−μ)·γ/√(σ²+ε) + β`.
2. 합친 층만으로 계산한 출력이 원래 모델(eval)과 같은지 확인한다. 최대 오차가 1e-4를 넘으면 중단한다.
3. `model.json`과 `weights.bin`을 쓴다. 정규화 상수는 `draw_app.py`의 값을 가져온다.
4. 검사 데이터 `test_cases.json`을 만든다. PIL로 280×280 그림을 그리고(굵기 20인 선 + 원), 각 경우마다 다음을 저장한다.
   - `입력`: 280×280 원본 바이트의 base64
   - `작은그림`: 데스크톱 `전처리()`가 만든 28×28 바이트의 base64
   - `확률`: PyTorch 확률 10개
   - 검사할 경우: 일반 숫자 모양 여러 개, 아주 작은 점(확대), 가로로 긴 선(높이 약 1px), 가장자리에 치우친 글씨(이동 후 잘림)

## 오류 처리

- 모델을 불러오는 동안에는 "모델 불러오는 중…"을 보여 주고 그리기를 막는다.
- 불러오기에 실패하면 화면에 오류를 보여 준다. `file://`로 열었을 때는 "`python -m http.server`로 실행하세요"라고 안내한다.
- 빈 그림으로 인식하면 아무것도 하지 않는다(데스크톱과 같음).

## 검사

- **test.html**은 경우마다 세 가지를 확인하고 통과/실패 표로 보여 준다.
  1. 전처리: JS 28×28 결과가 파이썬 `작은그림`과 모든 픽셀에서 같은지
  2. 추론만 따로: 파이썬 `작은그림`을 정규화해 JS 신경망에 넣었을 때 확률 오차가 1e-4 이하인지
  3. 전체: JS 전처리 + JS 추론의 예측 숫자가 파이썬과 같은지
- Node.js가 없으므로 `web_version`에서 `python -m http.server`를 띄우고 브라우저로 확인한다.
- 수동 확인: `index.html`에서 마우스로 숫자를 그려 인식되는지, 휴대폰 크기 화면에서 레이아웃이 깨지지 않는지 본다.
- 데스크톱: 이동 후 `desktop_version`에서 `모델_불러오기` + `전처리` 인식 과정과 `export_web.py`가 도는지 확인한다.

## 배포

`.github/workflows/pages.yml`:

- 실행 조건: main에 `web_version/**` 또는 워크플로 파일이 바뀌어 푸시될 때, 그리고 `workflow_dispatch`
- 권한: `pages: write`, `id-token: write`, `contents: read`
- 단계: `actions/checkout` → `actions/configure-pages` → `actions/upload-pages-artifact`(path: `web_version`) → `actions/deploy-pages`
- 사용자가 저장소 **Settings → Pages → Source**를 "GitHub Actions"로 한 번 바꿔야 한다.

## CLAUDE.md

- **루트**: 개요, 두 버전 안내, 한글 작성 규칙, Windows 실행 환경을 적는다. 연결 규칙도 적는다: 모델 재학습이나 `전처리()` 변경 → `export_web.py` 재실행(필요하면 `preprocess.js` 수정) → `test.html` 확인 → `model/` 커밋.
- **desktop_version**: 기존 CLAUDE.md의 명령어·주의점, 이 폴더에서 실행해야 한다는 점, `export_web.py` 사용법.
- **web_version**: 외부 라이브러리 금지, 파일 역할, 로컬 실행·검사 방법, `model.json` 형식, `model/`은 손으로 고치지 말 것, 배포 방법.

## 범위 밖

- 웹 워커, float16 양자화, 특징 맵 시각화, 웹용 모델 재학습
- JS 빌드 도구·번들러·npm
