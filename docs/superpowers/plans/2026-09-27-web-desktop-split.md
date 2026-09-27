# 웹 버전 / 데스크톱 버전 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 PyTorch·tkinter 코드를 `desktop_version/`으로 옮기고, 같은 가중치를 외부 라이브러리 없이 순수 자바스크립트로 추론하는 그림판 웹 앱 `web_version/`을 만들어 GitHub Pages에 배포한다.

**Architecture:** `desktop_version/export_web.py`가 `mnist_cnn.pt`의 배치정규화를 합성곱에 합쳐 `web_version/model/`(model.json + weights.bin)로 내보낸다. 검사 데이터(test_cases.json)도 함께 만든다. 웹은 ES 모듈 세 개로 나뉜다: `preprocess.js`(데스크톱 `전처리()`를 PIL LANCZOS까지 그대로 재현), `cnn.js`(층 실행), `app.js`(그림판 화면). `test.html`은 JS 결과를 PyTorch 정답과 대조한다.

**Tech Stack:** Python 3.13 + PyTorch 2.14(CPU) + Pillow 12.3 + NumPy 2.5 (데스크톱·내보내기), 순수 HTML/CSS/JS ES 모듈 (웹), GitHub Actions + GitHub Pages (배포)

**Spec:** `docs/superpowers/specs/2026-09-27-web-desktop-split-design.md`

## Global Constraints

- 코드 속 변수·함수·클래스 이름과 주석은 한글로 쓴다. `model.json` 키, HTML id, CSS 클래스도 한글로 쓴다.
- 파일 이름은 영어로 쓴다.
- 웹 버전은 외부 라이브러리·CDN·빌드 도구·npm을 쓰지 않는다. 브라우저 내장 기능만 쓴다.
- 웹의 모든 파일 주소는 상대 경로로 쓴다(사이트가 `https://joykimus0423-dotcom.github.io/Study01_MNIST/` 하위 경로에 배포되므로 `/`로 시작하면 안 된다).
- 기존 데스크톱 파일(`model.py`, `train.py`, `draw_app.py`, `requirements.txt`, `mnist_cnn.pt`)은 `git mv`로 옮기기만 하고 내용은 바꾸지 않는다.
- 웹 전처리 결과(28×28)는 데스크톱과 모든 픽셀이 같아야 하고, 확률은 PyTorch와 차이가 1e-4 이하여야 한다.
- 파이썬은 전체 경로로 실행한다. Bash에서는 `PY="$LOCALAPPDATA/Programs/Python/Python313/python.exe"`로 두고 `PYTHONIOENCODING=utf-8 "$PY" ...`로 실행한다(PATH의 `python`은 Windows 스토어 바로가기다).
- Node.js가 없다. JS 검사는 `python -m http.server`로 띄운 페이지를 브라우저로 열어 확인한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙인다.

## Review Focus

1. **하위 경로 배포**: 사이트가 `/Study01_MNIST/` 아래에 있어도 `model/` 파일을 찾아야 한다. 모든 검사를 저장소 루트에서 띄운 서버의 `/web_version/...` 주소로 열어 하위 경로 상황을 재현한다(Task 3~5).
2. **좁은 화면**: 캔버스가 280px보다 작게 보일 때 획이 손가락·마우스 위치에 그대로 그려져야 한다. Task 5에서 폭 300px 화면으로 그려 보고 스크린샷으로 확인한다.
3. **캔버스 밖으로 나가는 획**: 그리다가 캔버스 밖으로 나가도 오류 없이 경계에서 잘리고, 손을 떼면 인식해야 한다. Task 5에서 확인한다.
4. **탭 한 번**: 움직이지 않고 한 번 누르면 점이 찍히고 인식 결과가 나와야 한다. Task 5에서 확인한다.
5. **`file://`로 직접 열기**: 모듈이 막혀도 빈 화면이 아니라 `python -m http.server` 안내가 보여야 한다. Task 5에서 확인한다.

---

### Task 1: 데스크톱 버전을 desktop_version으로 옮기기

**Files:**
- Move: `model.py`, `train.py`, `draw_app.py`, `requirements.txt`, `mnist_cnn.pt` → `desktop_version/`
- Move: `CLAUDE.md` → `desktop_version/CLAUDE.md` (내용 수정)
- Create: `CLAUDE.md` (루트, 임시 개요. Task 6에서 최종본으로 바꿈)
- Modify: `.gitignore`
- 로컬 전용(git에 없음): `data/` → `desktop_version/data/`, 루트 `__pycache__/` 삭제

**Interfaces:**
- Produces: `desktop_version/draw_app.py`의 `모델_불러오기()`, `전처리(그림)`, `캔버스_크기`, `펜_굵기`, `MNIST_평균`, `MNIST_표준편차` (내용은 기존과 같고, `desktop_version`을 현재 폴더로 두고 실행해야 한다)

- [ ] **Step 1: 옮기기 전에 기준 동작 확인**

저장소 루트에서 실행:

```bash
PY="$LOCALAPPDATA/Programs/Python/Python313/python.exe"
PYTHONIOENCODING=utf-8 "$PY" -c "
from PIL import Image, ImageDraw
from draw_app import 모델_불러오기, 전처리, 펜_굵기
모델 = 모델_불러오기()
그림 = Image.new('L', (280, 280), 0)
ImageDraw.Draw(그림).line([140, 40, 140, 240], fill=255, width=펜_굵기)
텐서, _ = 전처리(그림)
print('예측:', 모델(텐서).argmax(1).item())
"
```

Expected: `예측: 1`

- [ ] **Step 2: 파일 옮기기**

```bash
mkdir -p desktop_version
git mv model.py train.py draw_app.py requirements.txt mnist_cnn.pt desktop_version/
git mv CLAUDE.md desktop_version/CLAUDE.md
mv data desktop_version/data
rm -rf __pycache__
```

- [ ] **Step 3: 루트에서는 더 이상 실행되지 않는지 확인**

Step 1과 같은 명령을 저장소 루트에서 다시 실행한다.

Expected: `ModuleNotFoundError: No module named 'draw_app'`

- [ ] **Step 4: desktop_version에서 같은 결과가 나오는지 확인**

```bash
cd desktop_version
PYTHONIOENCODING=utf-8 "$PY" -c "
from PIL import Image, ImageDraw
from draw_app import 모델_불러오기, 전처리, 펜_굵기
모델 = 모델_불러오기()
그림 = Image.new('L', (280, 280), 0)
ImageDraw.Draw(그림).line([140, 40, 140, 240], fill=255, width=펜_굵기)
텐서, _ = 전처리(그림)
print('예측:', 모델(텐서).argmax(1).item())
"
PYTHONIOENCODING=utf-8 "$PY" -c "import train; print('train.py 불러오기 성공', train.MNIST_평균)"
cd ..
```

Expected: `예측: 1`, `train.py 불러오기 성공 0.1307`

- [ ] **Step 5: `desktop_version/CLAUDE.md`를 데스크톱 전용으로 고치기**

파일 전체를 아래 내용으로 바꾼다.

````markdown
# CLAUDE.md (desktop_version)

이 폴더는 PyTorch로 MNIST CNN을 학습하고, tkinter 그림판에 마우스로 그린 숫자를 인식하는 데스크톱 버전입니다. 프로젝트 전체 규칙(한글 작성 규칙, 실행 환경)은 루트 `CLAUDE.md`를 보세요.

## 명령어

**모든 명령은 이 폴더(`desktop_version`)에서 실행합니다.** `mnist_cnn.pt`와 `./data`를 현재 폴더 기준 상대 경로로 찾기 때문입니다.

```bash
python -m pip install -r requirements.txt   # 패키지 설치
python train.py                              # 학습 → mnist_cnn.pt 저장 (MNIST는 ./data에 자동으로 내려받음)
python draw_app.py                           # 그림판 GUI 실행 (mnist_cnn.pt가 있어야 함)
```

- 학습은 CPU에서 에폭당 약 2.5분, 5에폭에 약 13분이 걸립니다. 도구 제한 시간(10분)을 넘기므로 백그라운드로 실행하세요. 테스트 정확도는 약 99.4%입니다.
- GUI는 창이 닫힐 때까지 끝나지 않으므로 `pythonw.exe`와 `Start-Process`로 따로 띄웁니다.
- 테스트와 린터는 없습니다. 인식 과정을 GUI 없이 확인하려면 `from draw_app import 모델_불러오기, 전처리`로 불러온 뒤, PIL로 검은 바탕 280×280 `L` 이미지에 흰 선(굵기 `펜_굵기`)을 그려 `전처리()` 결과를 모델에 넣어 보세요. tkinter 창은 `main()`에서만 만들어지므로 import만 해서는 창이 뜨지 않습니다.

## 구조와 주의할 점

- `model.py`의 `MnistCNN`은 학습과 추론에서 함께 씁니다. 모델 구조를 바꾸면 이미 저장된 `mnist_cnn.pt`(`state_dict`)를 불러올 수 없으니 `train.py`로 다시 학습해야 합니다.
- **정규화 상수(`MNIST_평균=0.1307`, `MNIST_표준편차=0.3081`)가 `train.py`와 `draw_app.py`에 각각 따로 정의되어 있습니다.** 한쪽을 바꾸면 다른 쪽도 반드시 똑같이 바꿔야 합니다.
- `draw_app.py`는 화면용 tk 캔버스와, 메모리 속 PIL 이미지(검은 바탕에 흰 글씨 = MNIST 형식)에 같은 획을 동시에 그립니다. 인식에는 PIL 이미지만 씁니다.
- `전처리()`는 MNIST 원본을 만든 방식을 그대로 따릅니다. 글씨가 있는 영역만 잘라 긴 변을 20px로 줄이고 28×28 가운데에 놓은 뒤, 무게중심이 (14, 14)에 오도록 옮깁니다. 이 단계를 빼거나 바꾸면 실제 손글씨 인식률이 크게 떨어집니다.
- `train.py`는 `RandomAffine`(회전·이동·확대)로 데이터를 늘려서 삐뚤빼뚤한 손글씨에도 잘 맞도록 학습합니다. 테스트 정확도가 가장 높았던 에폭의 가중치만 저장합니다.
````

- [ ] **Step 6: 루트 `CLAUDE.md` 임시 개요 만들기**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

MNIST로 학습한 CNN으로 손글씨 숫자를 인식하는 학습용 프로젝트입니다.

- `desktop_version/`: PyTorch로 학습하고 tkinter 그림판에서 인식합니다. 자세한 내용은 `desktop_version/CLAUDE.md`를 보세요.

**작성 규칙:** 코드, 주석, 변수·함수·클래스 이름을 모두 한글로 작성합니다(예: `모델_불러오기`, `전처리`, `숫자인식앱`). 사용자 요청이니 새 코드도 같은 방식을 따르세요. 파일 이름만 영어로 씁니다.

## 실행 환경 (Windows)

- Python 3.13이 `%LOCALAPPDATA%\Programs\Python\Python313\`에 설치되어 있고, CPU 전용 PyTorch를 씁니다(CUDA 없음).
- 오래 열려 있던 셸에서는 `python`이 Windows 스토어 바로가기(`WindowsApps\python.exe`)로 연결되어 실행되지 않을 수 있습니다. 이럴 때는 전체 경로로 실행하세요: `& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" <스크립트>`
- PowerShell에서 한글 출력이 깨지지 않도록 `$env:PYTHONIOENCODING = "utf-8"`을 먼저 설정하세요.
```

- [ ] **Step 7: `.gitignore` 고치기**

파일 전체를 아래 내용으로 바꾼다. `data/`는 어느 폴더에 있어도 무시되므로 `desktop_version/data/`도 그대로 걸러진다.

```gitignore
# MNIST 데이터셋 (desktop_version/train.py 실행 시 자동으로 내려받음)
data/

# 파이썬 캐시
__pycache__/
*.pyc

# 로컬 미리보기 서버 설정 (컴퓨터마다 파이썬 경로가 다름)
.claude/launch.json
```

- [ ] **Step 8: 상태 확인 후 커밋**

```bash
git status --short
```

Expected: `R` 표시로 다섯 파일과 CLAUDE.md가 옮겨졌고, 루트 `CLAUDE.md`(새 파일)와 `.gitignore`가 바뀌었다. `data/`는 목록에 없다.

```bash
git add -A
git commit -m "기존 데스크톱 코드를 desktop_version 폴더로 이동" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 웹용 가중치와 검사 데이터 내보내기 (export_web.py)

**Files:**
- Create: `desktop_version/export_web.py`
- Create(생성물): `web_version/model/model.json`, `web_version/model/weights.bin`, `web_version/model/test_cases.json`
- Create: `.gitattributes`
- Modify: `desktop_version/CLAUDE.md` (내보내기 안내 추가)

**Interfaces:**
- Consumes: `draw_app.py`의 `모델_불러오기()`, `전처리(그림) -> (텐서(1,1,28,28), PIL 28×28 이미지) | None`, `캔버스_크기`, `펜_굵기`, `MNIST_평균`, `MNIST_표준편차`
- Produces:
  - `model.json`: `{"형식": 1, "입력모양": [1, 28, 28], "정규화": {"평균", "표준편차"}, "전체개수": 870634, "층": [...]}`. 층 종류: `합성곱`(`입력채널`, `출력채널`, `커널`, `패딩`, `가중치`, `편향`), `ReLU`, `최대풀링`(`크기`), `펼치기`, `완전연결`(`입력`, `출력`, `가중치`, `편향`). `가중치`·`편향`은 `{"위치", "개수"}`(float32 원소 단위)다.
  - `weights.bin`: float32 리틀엔디언, 870,634개 = 3,482,536바이트
  - `test_cases.json`: `{"너비": 280, "높이": 280, "경우들": [{"이름", "입력"(280×280 바이트 base64), "작은그림"(28×28 바이트 base64), "확률"(숫자 10개), "예측"(정수)}]}`

- [ ] **Step 1: 내보내기가 아직 없음을 확인**

```bash
ls web_version/model 2>&1
```

Expected: `No such file or directory`

- [ ] **Step 2: `desktop_version/export_web.py` 작성**

```python
# -*- coding: utf-8 -*-
"""
학습된 가중치(mnist_cnn.pt)를 웹 버전(web_version)이 읽을 수 있는 파일로 내보냅니다.

만드는 파일 (../web_version/model/):
    model.json       층 구성, 가중치 위치·개수, 정규화 상수
    weights.bin      float32 리틀엔디언 가중치 (배치정규화는 합성곱에 합친 상태)
    test_cases.json  웹 버전 검사(test.html)용 입력과 PyTorch 정답

실행 방법 (desktop_version 폴더에서):
    python export_web.py
"""
import base64
import json
import math
import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageDraw

from draw_app import 모델_불러오기, 전처리, 캔버스_크기, 펜_굵기, MNIST_평균, MNIST_표준편차

이_폴더 = Path(__file__).resolve().parent
내보낼_폴더 = 이_폴더.parent / "web_version" / "model"
허용_오차 = 1e-4


def 층_목록_만들기(모델):
    """
    모델의 층을 차례로 훑어 웹에서 쓸 층 목록을 만듭니다.
    배치정규화는 바로 앞 합성곱에 합치고, 드롭아웃은 추론 때 쓰지 않으므로 뺍니다.
    돌려주는 값: [(층 정보 dict, [가중치 텐서, 편향 텐서] 또는 []), ...]
    """
    모듈들 = list(모델.features) + list(모델.classifier)
    층들 = []
    i = 0
    while i < len(모듈들):
        모듈 = 모듈들[i]
        if isinstance(모듈, nn.Conv2d):
            if 모듈.stride != (1, 1) or 모듈.kernel_size[0] != 모듈.kernel_size[1]:
                raise ValueError(f"웹 버전은 보폭 1, 정사각형 커널 합성곱만 지원합니다: {모듈}")
            가중치 = 모듈.weight.detach().double()
            편향 = 모듈.bias.detach().double()
            다음 = 모듈들[i + 1] if i + 1 < len(모듈들) else None
            if isinstance(다음, nn.BatchNorm2d):
                # BN(conv(x)) = γ·(w·x + b − μ)/√(σ²+ε) + β 이므로 w, b에 미리 곱해 둡니다.
                배율 = 다음.weight.detach().double() / torch.sqrt(다음.running_var.double() + 다음.eps)
                가중치 = 가중치 * 배율.view(-1, 1, 1, 1)
                편향 = (편향 - 다음.running_mean.double()) * 배율 + 다음.bias.detach().double()
                i += 1  # 합친 배치정규화 층은 건너뜀
            층들.append(({"종류": "합성곱", "입력채널": 모듈.in_channels, "출력채널": 모듈.out_channels,
                         "커널": 모듈.kernel_size[0], "패딩": 모듈.padding[0]},
                        [가중치.float(), 편향.float()]))
        elif isinstance(모듈, nn.ReLU):
            층들.append(({"종류": "ReLU"}, []))
        elif isinstance(모듈, nn.MaxPool2d):
            if 모듈.stride != 모듈.kernel_size or 모듈.padding != 0:
                raise ValueError(f"웹 버전은 보폭이 크기와 같은 최대풀링만 지원합니다: {모듈}")
            층들.append(({"종류": "최대풀링", "크기": 모듈.kernel_size}, []))
        elif isinstance(모듈, nn.Flatten):
            층들.append(({"종류": "펼치기"}, []))
        elif isinstance(모듈, nn.Linear):
            층들.append(({"종류": "완전연결", "입력": 모듈.in_features, "출력": 모듈.out_features},
                        [모듈.weight.detach().float(), 모듈.bias.detach().float()]))
        elif isinstance(모듈, nn.Dropout):
            pass  # 추론 때는 아무 일도 하지 않음
        else:
            raise ValueError(f"웹 버전이 지원하지 않는 층입니다: {모듈}")
        i += 1
    return 층들


@torch.no_grad()
def 합친_층으로_계산(층들, 입력):
    """내보낼 층 목록만으로 계산합니다. 원래 모델과 결과가 같은지 확인하는 데 씁니다."""
    x = 입력
    for 정보, 텐서들 in 층들:
        종류 = 정보["종류"]
        if 종류 == "합성곱":
            x = F.conv2d(x, 텐서들[0], 텐서들[1], padding=정보["패딩"])
        elif 종류 == "ReLU":
            x = F.relu(x)
        elif 종류 == "최대풀링":
            x = F.max_pool2d(x, 정보["크기"])
        elif 종류 == "펼치기":
            x = torch.flatten(x, 1)
        elif 종류 == "완전연결":
            x = F.linear(x, 텐서들[0], 텐서들[1])
    return x


def 가중치_파일_쓰기(층들, 폴더):
    """model.json과 weights.bin을 쓰고, 저장한 가중치 개수를 돌려줍니다."""
    조각들 = []
    위치 = 0
    층_설명 = []
    for 정보, 텐서들 in 층들:
        정보 = dict(정보)
        for 이름, 텐서 in zip(["가중치", "편향"], 텐서들):
            배열 = 텐서.numpy().astype("<f4").ravel()
            정보[이름] = {"위치": 위치, "개수": int(배열.size)}
            조각들.append(배열)
            위치 += int(배열.size)
        층_설명.append(정보)
    설명 = {
        "형식": 1,
        "입력모양": [1, 28, 28],
        "정규화": {"평균": MNIST_평균, "표준편차": MNIST_표준편차},
        "전체개수": 위치,
        "층": 층_설명,
    }
    (폴더 / "weights.bin").write_bytes(np.concatenate(조각들).tobytes())
    (폴더 / "model.json").write_text(json.dumps(설명, ensure_ascii=False, indent=2), encoding="utf-8")
    return 위치


def 획으로_그리기(획들):
    """draw_app.py와 같은 방식(굵기 펜_굵기인 선 + 점마다 원)으로 280×280 그림을 그립니다."""
    그림 = Image.new("L", (캔버스_크기, 캔버스_크기), 0)
    붓 = ImageDraw.Draw(그림)
    r = 펜_굵기 // 2
    for 점들 in 획들:
        for x, y in 점들:
            붓.ellipse([x - r, y - r, x + r, y + r], fill=255)
        for (x0, y0), (x1, y1) in zip(점들, 점들[1:]):
            붓.line([x0, y0, x1, y1], fill=255, width=펜_굵기)
    return 그림


def 타원_점들(중심_x, 중심_y, 반지름_x, 반지름_y, 개수=24):
    """타원 둘레를 따라가는 점들 (숫자 0 모양)"""
    return [(중심_x + 반지름_x * math.cos(2 * math.pi * k / 개수),
             중심_y + 반지름_y * math.sin(2 * math.pi * k / 개수)) for k in range(개수 + 1)]


def 작은_사각형():
    """펜보다 작은 5×5 사각형: 크기 변경이 축소가 아니라 확대로 일어나는 경우"""
    그림 = Image.new("L", (캔버스_크기, 캔버스_크기), 0)
    ImageDraw.Draw(그림).rectangle([140, 140, 144, 144], fill=255)
    return 그림


def 한쪽이_무거운_모양():
    """왼쪽에 큰 덩어리, 오른쪽에 가는 선: 무게중심 이동 뒤 오른쪽 끝이 28×28 밖으로 잘리는 경우"""
    그림 = Image.new("L", (캔버스_크기, 캔버스_크기), 0)
    붓 = ImageDraw.Draw(그림)
    붓.rectangle([20, 40, 79, 239], fill=255)
    붓.line([80, 140, 270, 140], fill=255, width=1)
    return 그림


def 검사_그림들():
    """웹 버전 검사에 쓸 (이름, 280×280 그림) 목록"""
    return [
        ("세로 선 (1)", 획으로_그리기([[(140, 40), (140, 240)]])),
        ("꺾인 선 (7)", 획으로_그리기([[(70, 50), (210, 50), (120, 240)]])),
        ("타원 (0)", 획으로_그리기([타원_점들(140, 140, 60, 90)])),
        ("두 획 (4)", 획으로_그리기([[(180, 40), (70, 170), (220, 170)], [(180, 40), (180, 250)]])),
        ("작은 사각형 (확대)", 작은_사각형()),
        ("긴 가로 선 (높이 1~2px)", 획으로_그리기([[(10, 140), (270, 140)]])),
        ("한쪽이 무거운 모양 (잘림)", 한쪽이_무거운_모양()),
    ]


def 바이트_base64(이미지):
    return base64.b64encode(np.array(이미지, dtype=np.uint8).tobytes()).decode("ascii")


@torch.no_grad()
def 검사_데이터_쓰기(모델, 폴더):
    """검사 그림마다 입력, 데스크톱 전처리 결과, PyTorch 확률을 test_cases.json에 저장합니다."""
    경우들 = []
    for 이름, 그림 in 검사_그림들():
        텐서, 작은_그림 = 전처리(그림)
        확률 = torch.softmax(모델(텐서), dim=1)[0]
        경우들.append({
            "이름": 이름,
            "입력": 바이트_base64(그림),
            "작은그림": 바이트_base64(작은_그림),
            "확률": [float(p) for p in 확률],
            "예측": int(확률.argmax()),
        })
    내용 = {"너비": 캔버스_크기, "높이": 캔버스_크기, "경우들": 경우들}
    (폴더 / "test_cases.json").write_text(json.dumps(내용, ensure_ascii=False), encoding="utf-8")
    return 경우들


def main():
    os.chdir(이_폴더)  # draw_app.py는 mnist_cnn.pt를 현재 폴더에서 찾습니다.
    모델 = 모델_불러오기()
    층들 = 층_목록_만들기(모델)

    # 배치정규화를 합친 층만으로 계산한 결과가 원래 모델과 같은지 확인
    torch.manual_seed(0)
    확인_입력 = torch.randn(16, 1, 28, 28)
    with torch.no_grad():
        원래 = torch.softmax(모델(확인_입력), dim=1)
        합친 = torch.softmax(합친_층으로_계산(층들, 확인_입력), dim=1)
    오차 = (원래 - 합친).abs().max().item()
    print(f"배치정규화를 합친 모델과 원래 모델의 확률 최대 오차: {오차:.2e}")
    if 오차 > 허용_오차:
        raise SystemExit(f"오차가 허용 범위({허용_오차})를 넘었습니다. 내보내기를 중단합니다.")

    내보낼_폴더.mkdir(parents=True, exist_ok=True)
    전체개수 = 가중치_파일_쓰기(층들, 내보낼_폴더)
    print(f"가중치 {전체개수:,}개 저장: {내보낼_폴더 / 'weights.bin'}")
    경우들 = 검사_데이터_쓰기(모델, 내보낼_폴더)
    for 경우 in 경우들:
        print(f"  검사 그림 '{경우['이름']}' → 예측 {경우['예측']}")
    print(f"검사 데이터 {len(경우들)}개 저장: {내보낼_폴더 / 'test_cases.json'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: 내보내기 실행**

```bash
cd desktop_version && PYTHONIOENCODING=utf-8 "$PY" export_web.py; cd ..
```

Expected:
```
배치정규화를 합친 모델과 원래 모델의 확률 최대 오차: (1e-4 이하인 값)
가중치 870,634개 저장: ...\web_version\model\weights.bin
  검사 그림 '세로 선 (1)' → 예측 1
  검사 그림 '꺾인 선 (7)' → 예측 7
  검사 그림 '타원 (0)' → 예측 0
  검사 그림 '두 획 (4)' → 예측 4
  ... (나머지 세 개는 어떤 숫자여도 됨)
검사 데이터 7개 저장: ...\web_version\model\test_cases.json
```

숫자 모양 네 개 중 기대와 다르게 예측된 것이 있으면, 그림 좌표만 조금 고쳐 다시 실행한다(모델 문제가 아니라 검사 그림 모양 문제다).

- [ ] **Step 4: 생성물 확인**

```bash
PYTHONIOENCODING=utf-8 "$PY" -c "
import json, os, base64, numpy as np
from PIL import Image
설명 = json.load(open('web_version/model/model.json', encoding='utf-8'))
크기 = os.path.getsize('web_version/model/weights.bin')
print('전체개수', 설명['전체개수'], '파일 크기', 크기, '일치', 크기 == 설명['전체개수'] * 4)
print('층', [층['종류'] for 층 in 설명['층']])
검사 = json.load(open('web_version/model/test_cases.json', encoding='utf-8'))
경우 = [c for c in 검사['경우들'] if c['이름'].startswith('한쪽이')][0]
작은 = np.frombuffer(base64.b64decode(경우['작은그림']), np.uint8).reshape(28, 28)
print('잘림 경우 오른쪽 끝 열 합계(0보다 커야 잘린 것)', int(작은[:, 27].sum()))
"
```

Expected: `전체개수 870634 파일 크기 3482536 일치 True`, 층 목록이 `['합성곱', 'ReLU', '합성곱', 'ReLU', '최대풀링', '합성곱', 'ReLU', '합성곱', 'ReLU', '최대풀링', '펼치기', '완전연결', 'ReLU', '완전연결']`, 잘림 경우 오른쪽 끝 열 합계가 0보다 크다(가는 선이 오른쪽 가장자리까지 밀려났다는 뜻). 0이면 `한쪽이_무거운_모양()`의 사각형을 더 크게(예: `[20, 40, 99, 239]`) 해서 다시 내보낸다.

- [ ] **Step 5: `.gitattributes` 작성**

Windows 줄바꿈 변환이 바이너리 가중치를 건드리지 않도록 한다.

```gitattributes
# 가중치 파일은 줄바꿈 변환 없이 그대로 저장
*.bin binary
*.pt binary
```

- [ ] **Step 6: `desktop_version/CLAUDE.md`에 내보내기 안내 추가**

`## 명령어`의 코드 블록 안 `python draw_app.py` 줄 다음에 한 줄을 넣는다.

```bash
python export_web.py                         # mnist_cnn.pt → ../web_version/model/ (웹 버전 가중치 + 검사 데이터)
```

파일 끝(`## 구조와 주의할 점` 목록 마지막)에 항목을 추가한다.

```markdown
- `export_web.py`는 배치정규화를 합성곱에 합쳐 `../web_version/model/`에 `model.json`, `weights.bin`, `test_cases.json`을 씁니다. 합친 결과가 원래 모델과 다르면(확률 오차 1e-4 초과) 저장하지 않고 멈춥니다. `draw_app.py`의 `전처리()`와 상수를 그대로 불러다 쓰므로, 모델을 다시 학습하거나 `전처리()`를 바꿨다면 반드시 다시 실행하세요. 웹 버전이 모르는 층을 모델에 넣으면 `층_목록_만들기()`가 오류를 냅니다.
```

- [ ] **Step 7: 커밋**

```bash
git add .gitattributes desktop_version/export_web.py desktop_version/CLAUDE.md web_version/model
git commit -m "웹 버전용 가중치·검사 데이터 내보내기 스크립트 추가" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 전처리 모듈 (preprocess.js)과 검사 페이지

**Files:**
- Create: `web_version/test.html`
- Create: `web_version/js/test.js`
- Create: `web_version/js/preprocess.js`
- Create(로컬 전용, 커밋 안 함): `.claude/launch.json`

**Interfaces:**
- Consumes: `web_version/model/model.json`의 `정규화`, `web_version/model/test_cases.json`
- Produces (`js/preprocess.js`):
  - `파이썬_반올림(값: number) -> number`: .5는 짝수 쪽으로
  - `경계상자(이미지) -> {왼쪽, 위, 오른쪽, 아래} | null`: 오른쪽·아래는 포함하지 않는 경계
  - `란초스_크기변경(이미지, 새너비, 새높이) -> 이미지`
  - `정규화하기(작은그림: Uint8Array, 정규화: {평균, 표준편차}) -> Float32Array`
  - `전처리(그림, 정규화) -> {입력: Float32Array(784), 작은그림: Uint8Array(784)} | null`
  - "이미지"는 `{데이터: Uint8Array, 너비, 높이}` 형태이고, 데이터는 한 줄씩 이어 붙인 흑백 값(0~255)이다.

- [ ] **Step 1: 미리보기 서버 설정 만들기**

`.claude/launch.json` (저장소 루트에서 서버를 띄워 `/web_version/` 하위 경로로 접속한다. 이렇게 해야 GitHub Pages 하위 경로 배포와 같은 상황이 된다):

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "web",
      "runtimeExecutable": "C:\\Users\\지유\\AppData\\Local\\Programs\\Python\\Python313\\python.exe",
      "runtimeArgs": ["-m", "http.server", "8000"],
      "port": 8000
    }
  ]
}
```

- [ ] **Step 2: 검사 페이지 `web_version/test.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>웹 버전 검사</title>
  <style>
    body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; margin: 16px; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
    .통과 { color: #1a7f37; }
    .실패 { color: #c62828; font-weight: bold; }
  </style>
</head>
<body>
  <h1>웹 버전 검사</h1>
  <p>자바스크립트 결과가 데스크톱(PyTorch)과 같은지 확인합니다. 검사 데이터는 <code>desktop_version/export_web.py</code>가 만듭니다.</p>
  <p id="요약">검사 중…</p>
  <table>
    <thead><tr><th>검사</th><th>결과</th><th>내용</th></tr></thead>
    <tbody id="결과표"></tbody>
  </table>
  <script type="module" src="js/test.js"></script>
</body>
</html>
```

- [ ] **Step 3: 검사 코드 `web_version/js/test.js` 작성 (전처리 검사까지)**

```js
// 웹 버전 검사: 자바스크립트 결과가 데스크톱(PyTorch) 결과와 같은지 확인합니다.
// test_cases.json은 desktop_version/export_web.py가 만듭니다.
import { 전처리, 파이썬_반올림 } from "./preprocess.js";

const 결과표 = document.getElementById("결과표");
const 요약 = document.getElementById("요약");
const 집계 = { 통과: 0, 실패: 0 };

function 기록(이름, 통과, 내용 = "") {
  집계[통과 ? "통과" : "실패"] += 1;
  const 줄 = 결과표.insertRow();
  줄.insertCell().textContent = 이름;
  const 칸 = 줄.insertCell();
  칸.textContent = 통과 ? "통과" : "실패";
  칸.className = 통과 ? "통과" : "실패";
  줄.insertCell().textContent = 내용;
}

function 바이트로(base64) {
  const 이진 = atob(base64);
  const 배열 = new Uint8Array(이진.length);
  for (let i = 0; i < 이진.length; i++) 배열[i] = 이진.charCodeAt(i);
  return 배열;
}

function 다른_픽셀_수(가, 나) {
  let 수 = Math.abs(가.length - 나.length);
  for (let i = 0; i < Math.min(가.length, 나.length); i++) if (가[i] !== 나[i]) 수 += 1;
  return 수;
}

function 반올림_검사() {
  const 기대값들 = [[0.5, 0], [1.5, 2], [2.5, 2], [-0.5, 0], [-1.5, -2], [2.4, 2], [2.6, 3], [-2.6, -3], [7, 7]];
  for (const [값, 기대] of 기대값들) {
    const 결과 = 파이썬_반올림(값);
    기록(`파이썬_반올림(${값})`, 결과 === 기대, `결과 ${결과}, 기대 ${기대}`);
  }
}

function 빈_그림_검사(너비, 높이, 정규화) {
  const 결과 = 전처리({ 데이터: new Uint8Array(너비 * 높이), 너비, 높이 }, 정규화);
  기록("전처리: 빈 그림이면 null", 결과 === null, `결과 ${결과}`);
}

function 전처리_검사(검사, 정규화) {
  for (const 경우 of 검사.경우들) {
    const 그림 = { 데이터: 바이트로(경우.입력), 너비: 검사.너비, 높이: 검사.높이 };
    const 결과 = 전처리(그림, 정규화);
    const 기대 = 바이트로(경우.작은그림);
    const 다름 = 결과 ? 다른_픽셀_수(결과.작은그림, 기대) : 기대.length;
    기록(`전처리: ${경우.이름}`, 다름 === 0, `다른 픽셀 ${다름}개`);
  }
}

async function JSON_가져오기(주소) {
  const 응답 = await fetch(주소);
  if (!응답.ok) throw new Error(`${주소}을(를) 불러오지 못했습니다 (HTTP ${응답.status})`);
  return 응답.json();
}

async function 실행() {
  const 기준 = new URL("model/", document.baseURI);
  const 설명 = await JSON_가져오기(new URL("model.json", 기준));
  const 검사 = await JSON_가져오기(new URL("test_cases.json", 기준));

  반올림_검사();
  빈_그림_검사(검사.너비, 검사.높이, 설명.정규화);
  전처리_검사(검사, 설명.정규화);
}

실행()
  .catch((오류) => 기록("검사 실행", false, 오류.message))
  .finally(() => {
    const 전체 = 집계.통과 + 집계.실패;
    요약.textContent = 집계.실패 === 0 ? `모두 통과 (${전체}개)` : `실패 ${집계.실패}개 / 전체 ${전체}개`;
    요약.className = 집계.실패 === 0 ? "통과" : "실패";
    document.title = `${집계.실패 === 0 ? "통과" : "실패"} - 웹 버전 검사`;
  });
```

- [ ] **Step 4: 검사가 실패하는지 확인**

`preview_start`로 `web` 서버를 띄우고(또는 저장소 루트에서 `"$PY" -m http.server 8000`) 브라우저로 `http://localhost:8000/web_version/test.html`을 연다.

Expected: `preprocess.js`가 없어 모듈을 불러오지 못한다. 요약은 `검사 중…`에 머물고, 콘솔에 `preprocess.js` 404 오류가 보인다.

- [ ] **Step 5: `web_version/js/preprocess.js` 작성**

```js
// 손글씨 그림을 MNIST 형식의 28×28 입력으로 바꾸는 전처리
// desktop_version/draw_app.py의 전처리()를 한 단계씩 그대로 옮겼습니다.
// 크기 변경은 PIL Image.LANCZOS와 같은 결과가 나오도록 Pillow(Resample.c)의 계산 방식을 따릅니다.
// "이미지"는 { 데이터: Uint8Array, 너비, 높이 } 형태이고, 데이터는 한 줄씩 이어 붙인 흑백 값(0~255)입니다.

const 결과_크기 = 28;  // MNIST 이미지 한 변
const 글씨_크기 = 20;  // 글씨의 긴 변을 이 크기로 맞춤
const 정밀도_비트 = 22;  // Pillow가 8비트 이미지 크기 변경에 쓰는 고정소수점 자릿수

/** 파이썬 round()처럼 딱 .5일 때는 짝수 쪽으로 반올림합니다. */
export function 파이썬_반올림(값) {
  const 내림 = Math.floor(값);
  const 차이 = 값 - 내림;
  if (차이 > 0.5) return 내림 + 1;
  if (차이 < 0.5) return 내림;
  return 내림 % 2 === 0 ? 내림 : 내림 + 1;
}

/** 0이 아닌 픽셀을 모두 담는 상자를 찾습니다. PIL getbbox처럼 오른쪽·아래 경계는 포함하지 않습니다. */
export function 경계상자(이미지) {
  const { 데이터, 너비, 높이 } = 이미지;
  let 왼쪽 = 너비, 위 = 높이, 오른쪽 = -1, 아래 = -1;
  for (let y = 0; y < 높이; y++) {
    for (let x = 0; x < 너비; x++) {
      if (데이터[y * 너비 + x] !== 0) {
        if (x < 왼쪽) 왼쪽 = x;
        if (x > 오른쪽) 오른쪽 = x;
        if (y < 위) 위 = y;
        아래 = y;
      }
    }
  }
  if (오른쪽 < 0) return null;
  return { 왼쪽, 위, 오른쪽: 오른쪽 + 1, 아래: 아래 + 1 };
}

function 잘라내기(이미지, 상자) {
  const 너비 = 상자.오른쪽 - 상자.왼쪽;
  const 높이 = 상자.아래 - 상자.위;
  const 데이터 = new Uint8Array(너비 * 높이);
  for (let y = 0; y < 높이; y++) {
    const 시작 = (상자.위 + y) * 이미지.너비 + 상자.왼쪽;
    데이터.set(이미지.데이터.subarray(시작, 시작 + 너비), y * 너비);
  }
  return { 데이터, 너비, 높이 };
}

// ----- LANCZOS 크기 변경 (Pillow와 같은 계산) -----

function 싱크(x) {
  if (x === 0.0) return 1.0;
  const 각 = x * Math.PI;
  return Math.sin(각) / 각;
}

function 란초스(x) {
  return -3.0 <= x && x < 3.0 ? 싱크(x) * 싱크(x / 3) : 0.0;
}

/** 길이를 입력길이 → 출력길이로 바꿀 때, 출력 칸마다 읽을 입력 시작 위치와 정수 계수를 구합니다. */
function 계수_구하기(입력길이, 출력길이) {
  const 배율 = 입력길이 / 출력길이;
  const 필터배율 = Math.max(배율, 1.0);  // 축소할 때는 필터를 배율만큼 넓힘
  const 역배율 = 1.0 / 필터배율;
  const 지지범위 = 3.0 * 필터배율;
  const 칸들 = [];
  for (let 출력칸 = 0; 출력칸 < 출력길이; 출력칸++) {
    const 중심 = (출력칸 + 0.5) * 배율;
    const 시작 = Math.max(0, Math.trunc(중심 - 지지범위 + 0.5));
    const 끝 = Math.min(입력길이, Math.trunc(중심 + 지지범위 + 0.5));
    const 실수계수 = [];
    let 합 = 0;
    for (let i = 0; i < 끝 - 시작; i++) {
      const 값 = 란초스((i + 시작 - 중심 + 0.5) * 역배율);
      실수계수.push(값);
      합 += 값;
    }
    const 계수 = 실수계수.map((값) => {
      const k = 합 !== 0 ? 값 / 합 : 값;
      return k < 0 ? Math.trunc(-0.5 + k * 2 ** 정밀도_비트) : Math.trunc(0.5 + k * 2 ** 정밀도_비트);
    });
    칸들.push({ 시작, 계수 });
  }
  return 칸들;
}

/** 고정소수점 합을 0~255 정수로 바꿉니다. */
function 바이트로_자르기(합) {
  if (합 >= 2 ** (정밀도_비트 + 8)) return 255;
  if (합 <= 0) return 0;
  return Math.floor(합 / 2 ** 정밀도_비트);
}

function 가로_바꾸기(이미지, 새너비) {
  const 칸들 = 계수_구하기(이미지.너비, 새너비);
  const 데이터 = new Uint8Array(새너비 * 이미지.높이);
  for (let y = 0; y < 이미지.높이; y++) {
    const 줄 = y * 이미지.너비;
    for (let x = 0; x < 새너비; x++) {
      const { 시작, 계수 } = 칸들[x];
      let 합 = 2 ** (정밀도_비트 - 1);  // 반올림용 절반
      for (let i = 0; i < 계수.length; i++) 합 += 이미지.데이터[줄 + 시작 + i] * 계수[i];
      데이터[y * 새너비 + x] = 바이트로_자르기(합);
    }
  }
  return { 데이터, 너비: 새너비, 높이: 이미지.높이 };
}

function 세로_바꾸기(이미지, 새높이) {
  const 칸들 = 계수_구하기(이미지.높이, 새높이);
  const 너비 = 이미지.너비;
  const 데이터 = new Uint8Array(너비 * 새높이);
  for (let y = 0; y < 새높이; y++) {
    const { 시작, 계수 } = 칸들[y];
    for (let x = 0; x < 너비; x++) {
      let 합 = 2 ** (정밀도_비트 - 1);
      for (let i = 0; i < 계수.length; i++) 합 += 이미지.데이터[(시작 + i) * 너비 + x] * 계수[i];
      데이터[y * 너비 + x] = 바이트로_자르기(합);
    }
  }
  return { 데이터, 너비, 높이: 새높이 };
}

/** PIL의 image.resize((새너비, 새높이), Image.LANCZOS)와 같은 결과를 만듭니다 (가로 먼저, 세로 나중). */
export function 란초스_크기변경(이미지, 새너비, 새높이) {
  let 결과 = 이미지;
  if (새너비 !== 결과.너비) 결과 = 가로_바꾸기(결과, 새너비);
  if (새높이 !== 결과.높이) 결과 = 세로_바꾸기(결과, 새높이);
  return 결과;
}

// ----- 무게중심 맞추기와 정규화 -----

/** 28×28 그림의 무게중심이 (14, 14)에 오도록 정수만큼 평행이동합니다. 밖으로 나간 부분은 버립니다. */
function 무게중심_맞추기(데이터) {
  let 전체 = 0, 합_x = 0, 합_y = 0;
  for (let y = 0; y < 결과_크기; y++) {
    for (let x = 0; x < 결과_크기; x++) {
      const 값 = 데이터[y * 결과_크기 + x];
      전체 += 값;
      합_x += x * 값;
      합_y += y * 값;
    }
  }
  if (전체 === 0) return 데이터;
  const 이동_x = 파이썬_반올림(14 - 합_x / 전체);
  const 이동_y = 파이썬_반올림(14 - 합_y / 전체);
  const 결과 = new Uint8Array(결과_크기 * 결과_크기);
  for (let y = 0; y < 결과_크기; y++) {
    for (let x = 0; x < 결과_크기; x++) {
      const 원래_x = x - 이동_x;
      const 원래_y = y - 이동_y;
      if (원래_x >= 0 && 원래_x < 결과_크기 && 원래_y >= 0 && 원래_y < 결과_크기) {
        결과[y * 결과_크기 + x] = 데이터[원래_y * 결과_크기 + 원래_x];
      }
    }
  }
  return 결과;
}

/** 0~255 값을 학습 때와 같은 방식으로 정규화합니다. */
export function 정규화하기(작은그림, 정규화) {
  const 입력 = new Float32Array(작은그림.length);
  for (let i = 0; i < 작은그림.length; i++) {
    입력[i] = (작은그림[i] / 255 - 정규화.평균) / 정규화.표준편차;
  }
  return 입력;
}

/**
 * 사용자가 그린 그림을 MNIST와 같은 형태로 바꿉니다. 그린 내용이 없으면 null을 돌려줍니다.
 * @returns {{ 입력: Float32Array, 작은그림: Uint8Array } | null}
 */
export function 전처리(그림, 정규화) {
  // 1) 글씨가 있는 부분만 잘라내기
  const 상자 = 경계상자(그림);
  if (상자 === null) return null;
  const 잘린 = 잘라내기(그림, 상자);

  // 2) 가로세로 비율을 유지하며 긴 변이 20픽셀이 되도록 크기 변경
  const 배율 = 글씨_크기 / Math.max(잘린.너비, 잘린.높이);
  const 새너비 = Math.max(1, 파이썬_반올림(잘린.너비 * 배율));
  const 새높이 = Math.max(1, 파이썬_반올림(잘린.높이 * 배율));
  const 줄인 = 란초스_크기변경(잘린, 새너비, 새높이);

  // 3) 28×28 검은 바탕 가운데에 붙이기
  const 가운데 = new Uint8Array(결과_크기 * 결과_크기);
  const 왼쪽 = Math.floor((결과_크기 - 새너비) / 2);
  const 위 = Math.floor((결과_크기 - 새높이) / 2);
  for (let y = 0; y < 새높이; y++) {
    가운데.set(줄인.데이터.subarray(y * 새너비, (y + 1) * 새너비), (위 + y) * 결과_크기 + 왼쪽);
  }

  // 4) 무게중심을 정중앙으로, 5) 정규화
  const 작은그림 = 무게중심_맞추기(가운데);
  return { 입력: 정규화하기(작은그림, 정규화), 작은그림 };
}
```

- [ ] **Step 6: 검사가 통과하는지 확인**

`http://localhost:8000/web_version/test.html`을 새로 고친다(브라우저 도구라면 `navigate` 후 `get_page_text`).

Expected: 요약 `모두 통과 (17개)` (반올림 9개 + 빈 그림 1개 + 전처리 7개). 실패한 전처리가 있으면 `다른 픽셀` 수를 보고 해당 단계를 파이썬 `전처리()`와 비교해 고친다.

- [ ] **Step 7: 커밋**

```bash
git add web_version/test.html web_version/js/test.js web_version/js/preprocess.js
git commit -m "웹 버전 전처리(PIL LANCZOS 재현)와 검사 페이지 추가" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 신경망 추론 모듈 (cnn.js)

**Files:**
- Create: `web_version/js/cnn.js`
- Modify: `web_version/js/test.js` (추론·전체 검사 추가)

**Interfaces:**
- Consumes: `model.json`, `weights.bin` (Task 2), `preprocess.js`의 `전처리`, `정규화하기`, `파이썬_반올림` (Task 3)
- Produces (`js/cnn.js`):
  - `async 모델_불러오기(기준주소: URL) -> 모델`. `모델 = {입력모양: [1,28,28], 정규화: {평균, 표준편차}, 층들: [...]}`. `기준주소`는 `model.json`과 `weights.bin`이 있는 폴더 주소이고 끝이 `/`다. 불러오기에 실패하면 한글 메시지가 담긴 `Error`를 던진다.
  - `추론(모델, 입력: Float32Array(784)) -> Float32Array(10)` (소프트맥스 확률)
  - `가장_큰_번호(값들) -> number`

- [ ] **Step 1: `web_version/js/test.js`에 추론 검사 추가 (파일 전체 교체)**

```js
// 웹 버전 검사: 자바스크립트 결과가 데스크톱(PyTorch) 결과와 같은지 확인합니다.
// test_cases.json은 desktop_version/export_web.py가 만듭니다.
import { 모델_불러오기, 추론, 가장_큰_번호 } from "./cnn.js";
import { 전처리, 정규화하기, 파이썬_반올림 } from "./preprocess.js";

const 확률_허용_오차 = 1e-4;
const 결과표 = document.getElementById("결과표");
const 요약 = document.getElementById("요약");
const 집계 = { 통과: 0, 실패: 0 };

function 기록(이름, 통과, 내용 = "") {
  집계[통과 ? "통과" : "실패"] += 1;
  const 줄 = 결과표.insertRow();
  줄.insertCell().textContent = 이름;
  const 칸 = 줄.insertCell();
  칸.textContent = 통과 ? "통과" : "실패";
  칸.className = 통과 ? "통과" : "실패";
  줄.insertCell().textContent = 내용;
}

function 바이트로(base64) {
  const 이진 = atob(base64);
  const 배열 = new Uint8Array(이진.length);
  for (let i = 0; i < 이진.length; i++) 배열[i] = 이진.charCodeAt(i);
  return 배열;
}

function 다른_픽셀_수(가, 나) {
  let 수 = Math.abs(가.length - 나.length);
  for (let i = 0; i < Math.min(가.length, 나.length); i++) if (가[i] !== 나[i]) 수 += 1;
  return 수;
}

function 최대_차이(가, 나) {
  let 최대 = 0;
  for (let i = 0; i < 가.length; i++) 최대 = Math.max(최대, Math.abs(가[i] - 나[i]));
  return 최대;
}

function 반올림_검사() {
  const 기대값들 = [[0.5, 0], [1.5, 2], [2.5, 2], [-0.5, 0], [-1.5, -2], [2.4, 2], [2.6, 3], [-2.6, -3], [7, 7]];
  for (const [값, 기대] of 기대값들) {
    const 결과 = 파이썬_반올림(값);
    기록(`파이썬_반올림(${값})`, 결과 === 기대, `결과 ${결과}, 기대 ${기대}`);
  }
}

function 빈_그림_검사(너비, 높이, 정규화) {
  const 결과 = 전처리({ 데이터: new Uint8Array(너비 * 높이), 너비, 높이 }, 정규화);
  기록("전처리: 빈 그림이면 null", 결과 === null, `결과 ${결과}`);
}

function 전처리_검사(검사, 정규화) {
  for (const 경우 of 검사.경우들) {
    const 그림 = { 데이터: 바이트로(경우.입력), 너비: 검사.너비, 높이: 검사.높이 };
    const 결과 = 전처리(그림, 정규화);
    const 기대 = 바이트로(경우.작은그림);
    const 다름 = 결과 ? 다른_픽셀_수(결과.작은그림, 기대) : 기대.length;
    기록(`전처리: ${경우.이름}`, 다름 === 0, `다른 픽셀 ${다름}개`);
  }
}

// 파이썬이 만든 28×28을 그대로 넣어 신경망만 따로 검사합니다(전처리 오류와 구분하기 위해).
function 추론_검사(모델, 검사) {
  for (const 경우 of 검사.경우들) {
    const 확률 = 추론(모델, 정규화하기(바이트로(경우.작은그림), 모델.정규화));
    const 차이 = 최대_차이(확률, 경우.확률);
    기록(`추론: ${경우.이름}`, 차이 <= 확률_허용_오차, `확률 최대 차이 ${차이.toExponential(2)}`);
  }
}

// 280×280 입력부터 JS 전처리 + JS 추론까지 한 번에 돌립니다.
function 전체_검사(모델, 검사) {
  for (const 경우 of 검사.경우들) {
    const 그림 = { 데이터: 바이트로(경우.입력), 너비: 검사.너비, 높이: 검사.높이 };
    const 결과 = 전처리(그림, 모델.정규화);
    const 예측 = 결과 ? 가장_큰_번호(추론(모델, 결과.입력)) : -1;
    기록(`전체: ${경우.이름}`, 예측 === 경우.예측, `예측 ${예측}, 기대 ${경우.예측}`);
  }
}

async function JSON_가져오기(주소) {
  const 응답 = await fetch(주소);
  if (!응답.ok) throw new Error(`${주소}을(를) 불러오지 못했습니다 (HTTP ${응답.status})`);
  return 응답.json();
}

async function 실행() {
  const 기준 = new URL("model/", document.baseURI);
  const 모델 = await 모델_불러오기(기준);
  const 검사 = await JSON_가져오기(new URL("test_cases.json", 기준));

  반올림_검사();
  빈_그림_검사(검사.너비, 검사.높이, 모델.정규화);
  전처리_검사(검사, 모델.정규화);
  추론_검사(모델, 검사);
  전체_검사(모델, 검사);
}

실행()
  .catch((오류) => 기록("검사 실행", false, 오류.message))
  .finally(() => {
    const 전체 = 집계.통과 + 집계.실패;
    요약.textContent = 집계.실패 === 0 ? `모두 통과 (${전체}개)` : `실패 ${집계.실패}개 / 전체 ${전체}개`;
    요약.className = 집계.실패 === 0 ? "통과" : "실패";
    document.title = `${집계.실패 === 0 ? "통과" : "실패"} - 웹 버전 검사`;
  });
```

- [ ] **Step 2: 검사가 실패하는지 확인**

`http://localhost:8000/web_version/test.html`을 새로 고친다.

Expected: `cnn.js`가 없어 모듈을 불러오지 못한다. 요약은 `검사 중…`에 머물고, 콘솔에 `cnn.js` 404 오류가 보인다.

- [ ] **Step 3: `web_version/js/cnn.js` 작성**

```js
// 순수 자바스크립트로 만든 CNN 추론기
// desktop_version/export_web.py가 만든 model.json과 weights.bin을 읽어
// PyTorch 모델(MnistCNN)과 같은 계산을 합니다. 외부 라이브러리를 쓰지 않습니다.
// 값은 Float32Array에 채널·세로·가로(CHW) 순서로 담습니다. PyTorch Flatten과 순서가 같습니다.

async function 파일_가져오기(주소) {
  const 응답 = await fetch(주소);
  if (!응답.ok) throw new Error(`${주소.pathname}을(를) 불러오지 못했습니다 (HTTP ${응답.status})`);
  return 응답;
}

/**
 * model.json과 weights.bin을 불러와 추론에 쓸 모델을 만듭니다.
 * @param {URL} 기준주소 두 파일이 있는 폴더 주소 (끝에 / 포함)
 */
export async function 모델_불러오기(기준주소) {
  const 설명 = await (await 파일_가져오기(new URL("model.json", 기준주소))).json();
  // weights.bin은 리틀엔디언 float32입니다. 브라우저가 도는 기기는 사실상 모두 리틀엔디언입니다.
  const 버퍼 = await (await 파일_가져오기(new URL("weights.bin", 기준주소))).arrayBuffer();
  if (버퍼.byteLength !== 설명.전체개수 * 4) {
    throw new Error(`weights.bin 크기가 맞지 않습니다 (기대 ${설명.전체개수 * 4}바이트, 실제 ${버퍼.byteLength}바이트)`);
  }
  const 가중치 = new Float32Array(버퍼);
  const 조각 = (위치정보) => 가중치.subarray(위치정보.위치, 위치정보.위치 + 위치정보.개수);
  const 층들 = 설명.층.map((층) => ({
    ...층,
    가중치: 층.가중치 ? 조각(층.가중치) : null,
    편향: 층.편향 ? 조각(층.편향) : null,
  }));
  return { 입력모양: 설명.입력모양, 정규화: 설명.정규화, 층들 };
}

function 합성곱(층, 값) {
  const { 입력채널, 출력채널, 커널, 패딩, 가중치, 편향 } = 층;
  const { 데이터, 높이, 너비 } = 값;
  if (값.채널 !== 입력채널) throw new Error(`합성곱 입력 채널이 맞지 않습니다 (${값.채널} ≠ ${입력채널})`);
  const 출력높이 = 높이 + 2 * 패딩 - 커널 + 1;
  const 출력너비 = 너비 + 2 * 패딩 - 커널 + 1;
  const 출력 = new Float32Array(출력채널 * 출력높이 * 출력너비);
  for (let o = 0; o < 출력채널; o++) {
    for (let y = 0; y < 출력높이; y++) {
      for (let x = 0; x < 출력너비; x++) {
        let 합 = 편향[o];
        for (let c = 0; c < 입력채널; c++) {
          for (let ky = 0; ky < 커널; ky++) {
            const 입력y = y + ky - 패딩;
            if (입력y < 0 || 입력y >= 높이) continue;
            for (let kx = 0; kx < 커널; kx++) {
              const 입력x = x + kx - 패딩;
              if (입력x < 0 || 입력x >= 너비) continue;
              합 += 데이터[(c * 높이 + 입력y) * 너비 + 입력x] * 가중치[((o * 입력채널 + c) * 커널 + ky) * 커널 + kx];
            }
          }
        }
        출력[(o * 출력높이 + y) * 출력너비 + x] = 합;
      }
    }
  }
  return { 데이터: 출력, 채널: 출력채널, 높이: 출력높이, 너비: 출력너비 };
}

function 활성화(값) {
  const 출력 = new Float32Array(값.데이터.length);
  for (let i = 0; i < 출력.length; i++) 출력[i] = Math.max(0, 값.데이터[i]);
  return { ...값, 데이터: 출력 };
}

function 최대풀링(층, 값) {
  const { 크기 } = 층;
  const { 데이터, 채널, 높이, 너비 } = 값;
  const 출력높이 = Math.floor(높이 / 크기);
  const 출력너비 = Math.floor(너비 / 크기);
  const 출력 = new Float32Array(채널 * 출력높이 * 출력너비);
  for (let c = 0; c < 채널; c++) {
    for (let y = 0; y < 출력높이; y++) {
      for (let x = 0; x < 출력너비; x++) {
        let 최대 = -Infinity;
        for (let dy = 0; dy < 크기; dy++) {
          for (let dx = 0; dx < 크기; dx++) {
            최대 = Math.max(최대, 데이터[(c * 높이 + y * 크기 + dy) * 너비 + x * 크기 + dx]);
          }
        }
        출력[(c * 출력높이 + y) * 출력너비 + x] = 최대;
      }
    }
  }
  return { 데이터: 출력, 채널, 높이: 출력높이, 너비: 출력너비 };
}

function 완전연결(층, 값) {
  const { 입력, 출력: 출력수, 가중치, 편향 } = 층;
  if (값.데이터.length !== 입력) throw new Error(`완전연결 입력 크기가 맞지 않습니다 (${값.데이터.length} ≠ ${입력})`);
  const 출력 = new Float32Array(출력수);
  for (let o = 0; o < 출력수; o++) {
    let 합 = 편향[o];
    const 줄 = o * 입력;
    for (let i = 0; i < 입력; i++) 합 += 가중치[줄 + i] * 값.데이터[i];
    출력[o] = 합;
  }
  return { 데이터: 출력, 채널: 출력수, 높이: 1, 너비: 1 };
}

function 층_실행(층, 값) {
  switch (층.종류) {
    case "합성곱": return 합성곱(층, 값);
    case "ReLU": return 활성화(값);
    case "최대풀링": return 최대풀링(층, 값);
    case "펼치기": return { 데이터: 값.데이터, 채널: 값.데이터.length, 높이: 1, 너비: 1 };
    case "완전연결": return 완전연결(층, 값);
    default: throw new Error(`알 수 없는 층 종류입니다: ${층.종류}`);
  }
}

function 소프트맥스(점수) {
  const 최대 = Math.max(...점수);
  const 지수 = Array.from(점수, (값) => Math.exp(값 - 최대));
  const 합 = 지수.reduce((가, 나) => 가 + 나, 0);
  return Float32Array.from(지수, (값) => 값 / 합);
}

/** 가장 큰 값의 위치(= 예측한 숫자)를 돌려줍니다. */
export function 가장_큰_번호(값들) {
  let 최대 = 0;
  for (let i = 1; i < 값들.length; i++) if (값들[i] > 값들[최대]) 최대 = i;
  return 최대;
}

/**
 * 정규화된 28×28 입력으로 0~9 각 숫자의 확률을 계산합니다.
 * @param {Float32Array} 입력 길이 784
 * @returns {Float32Array} 길이 10
 */
export function 추론(모델, 입력) {
  const [채널, 높이, 너비] = 모델.입력모양;
  let 값 = { 데이터: 입력, 채널, 높이, 너비 };
  for (const 층 of 모델.층들) 값 = 층_실행(층, 값);
  return 소프트맥스(값.데이터);
}
```

- [ ] **Step 4: 검사가 통과하는지 확인**

`http://localhost:8000/web_version/test.html`을 새로 고친다.

Expected: 요약 `모두 통과 (31개)` (반올림 9 + 빈 그림 1 + 전처리 7 + 추론 7 + 전체 7). `추론` 줄의 확률 최대 차이는 1e-6 안팎이다.

- [ ] **Step 5: 커밋**

```bash
git add web_version/js/cnn.js web_version/js/test.js
git commit -m "순수 자바스크립트 CNN 추론 모듈 추가" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 그림판 화면 (index.html, style.css, app.js)

**Files:**
- Create: `web_version/index.html`
- Create: `web_version/style.css`
- Create: `web_version/js/app.js`

**Interfaces:**
- Consumes: `cnn.js`의 `모델_불러오기`, `추론`, `가장_큰_번호`; `preprocess.js`의 `전처리`
- Produces: 없음 (최종 화면)

- [ ] **Step 1: `web_version/index.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>손글씨 숫자 인식기</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h1>손글씨 숫자 인식기 <small>MNIST CNN · 순수 자바스크립트</small></h1>
    <p id="상태">모델 불러오는 중…</p>
    <div class="화면">
      <section class="왼쪽">
        <p class="안내">여기에 숫자를 그려 주세요</p>
        <canvas id="그림판" class="잠김" width="280" height="280"></canvas>
        <div class="버튼줄">
          <button id="인식하기" type="button">인식하기</button>
          <button id="지우기" type="button">지우기</button>
        </div>
        <p class="도움말">손을 떼면 자동으로 인식합니다. 오른쪽 클릭으로도 지울 수 있습니다.</p>
      </section>
      <section class="오른쪽">
        <p class="안내">인식 결과</p>
        <div id="결과">?</div>
        <p id="확신도"></p>
        <div id="막대들"></div>
        <p class="도움말">모델 입력(28×28)</p>
        <canvas id="미리보기" width="28" height="28"></canvas>
      </section>
    </div>
  </main>
  <script>
    // 파일을 직접 열면(file://) 브라우저가 모듈과 fetch를 막아 app.js가 실행되지 않습니다.
    if (location.protocol === "file:") {
      const 상태 = document.getElementById("상태");
      상태.textContent = "파일을 직접 열면 동작하지 않습니다. web_version 폴더에서 'python -m http.server'를 실행한 뒤 http://localhost:8000 으로 접속하세요.";
      상태.classList.add("오류");
    }
  </script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `web_version/style.css` 작성**

```css
* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
  background: #f4f5f7;
  color: #222;
}

main { max-width: 640px; margin: 0 auto; padding: 16px; }

h1 { font-size: 1.3rem; margin: 0 0 8px; }
h1 small { display: block; font-size: 0.8rem; font-weight: normal; color: #666; }

#상태 { margin: 0 0 12px; color: #555; }
#상태:empty { display: none; }
#상태.오류 { color: #c62828; font-weight: bold; }

.화면 { display: flex; flex-wrap: wrap; gap: 24px; justify-content: center; }
.왼쪽, .오른쪽 { display: flex; flex-direction: column; align-items: center; }
.왼쪽 { width: 100%; max-width: 280px; }
.오른쪽 { width: 220px; }

.안내 { margin: 0 0 6px; font-size: 1rem; }
.도움말 { margin: 6px 0; font-size: 0.8rem; color: #666; text-align: center; }

#그림판 {
  width: 100%;
  height: auto;
  background: white;
  box-shadow: 0 0 0 2px #888;
  cursor: crosshair;
  touch-action: none;  /* 그리는 동안 화면이 스크롤·확대되지 않게 함 */
}
#그림판.잠김 { opacity: 0.5; pointer-events: none; }

.버튼줄 { display: flex; gap: 8px; width: 100%; margin-top: 10px; }
.버튼줄 button {
  flex: 1;
  padding: 8px;
  font: inherit;
  border: 1px solid #888;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}
.버튼줄 button:hover { background: #eef3fb; }

#결과 { font-size: 72px; font-weight: bold; line-height: 1.1; color: #1a5fb4; }
#확신도 { min-height: 1.2em; margin: 0 0 8px; font-size: 0.9rem; }

#막대들 { display: grid; gap: 4px; width: 100%; }
.막대줄 { display: grid; grid-template-columns: 16px 1fr 40px; gap: 6px; align-items: center; font-size: 0.85rem; }
.막대틀 { height: 14px; background: #e8ecf2; border-radius: 3px; overflow: hidden; }
.막대 { display: block; width: 0; height: 100%; background: #99c1f1; }
.막대줄.최대 .막대 { background: #1a5fb4; }
.퍼센트 { text-align: right; }

#미리보기 { width: 84px; height: 84px; background: black; image-rendering: pixelated; }
```

- [ ] **Step 3: `web_version/js/app.js` 작성**

```js
// 그림판 화면: 마우스나 손가락으로 숫자를 그리면 순수 자바스크립트 CNN으로 인식해 보여 줍니다.
// desktop_version/draw_app.py의 숫자인식앱과 같은 동작을 합니다.
import { 모델_불러오기, 추론, 가장_큰_번호 } from "./cnn.js";
import { 전처리 } from "./preprocess.js";

const 캔버스_크기 = 280;  // 그림판의 논리 크기(픽셀). 화면에서 작게 보여도 좌표는 이 기준입니다.
const 펜_굵기 = 20;

const 캔버스 = document.getElementById("그림판");
const 붓 = 캔버스.getContext("2d");
const 상태_표시 = document.getElementById("상태");
const 결과_표시 = document.getElementById("결과");
const 확신도_표시 = document.getElementById("확신도");
const 막대들 = document.getElementById("막대들");
const 미리보기 = document.getElementById("미리보기").getContext("2d");

// 화면과 같은 획을 메모리에도 그려 둡니다(검은 바탕 0, 흰 글씨 255 = MNIST 형식). 인식에는 이것만 씁니다.
const 그림 = { 데이터: new Uint8Array(캔버스_크기 * 캔버스_크기), 너비: 캔버스_크기, 높이: 캔버스_크기 };
let 모델 = null;
let 이전_좌표 = null;

/** 포인터 위치를 280×280 그림판 좌표로 바꿉니다. 캔버스가 화면에서 작게 보여도 맞게 바꿉니다. */
function 좌표(이벤트) {
  const 영역 = 캔버스.getBoundingClientRect();
  return [
    ((이벤트.clientX - 영역.left) / 영역.width) * 캔버스_크기,
    ((이벤트.clientY - 영역.top) / 영역.height) * 캔버스_크기,
  ];
}

/** 선분에서 펜 반지름 안쪽에 있는 픽셀을 모두 흰색으로 칠합니다(선 + 둥근 끝). 캔버스 밖은 버립니다. */
function 메모리에_선_긋기(x0, y0, x1, y1) {
  const 반지름 = 펜_굵기 / 2;
  const 최소_x = Math.max(0, Math.floor(Math.min(x0, x1) - 반지름));
  const 최대_x = Math.min(캔버스_크기 - 1, Math.ceil(Math.max(x0, x1) + 반지름));
  const 최소_y = Math.max(0, Math.floor(Math.min(y0, y1) - 반지름));
  const 최대_y = Math.min(캔버스_크기 - 1, Math.ceil(Math.max(y0, y1) + 반지름));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const 길이제곱 = dx * dx + dy * dy;
  for (let y = 최소_y; y <= 최대_y; y++) {
    for (let x = 최소_x; x <= 최대_x; x++) {
      // 선분 위에서 (x, y)와 가장 가까운 점까지의 거리
      const t = 길이제곱 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / 길이제곱));
      const 거리_x = x - (x0 + t * dx);
      const 거리_y = y - (y0 + t * dy);
      if (거리_x * 거리_x + 거리_y * 거리_y <= 반지름 * 반지름) {
        그림.데이터[y * 캔버스_크기 + x] = 255;
      }
    }
  }
}

function 점_찍기(x, y) {
  붓.beginPath();
  붓.arc(x, y, 펜_굵기 / 2, 0, Math.PI * 2);
  붓.fill();
  메모리에_선_긋기(x, y, x, y);
}

function 선_긋기(x0, y0, x1, y1) {
  붓.beginPath();
  붓.moveTo(x0, y0);
  붓.lineTo(x1, y1);
  붓.stroke();
  메모리에_선_긋기(x0, y0, x1, y1);
}

function 막대그래프_만들기() {
  for (let 숫자 = 0; 숫자 < 10; 숫자++) {
    const 줄 = document.createElement("div");
    줄.className = "막대줄";
    줄.innerHTML = `<span>${숫자}</span><span class="막대틀"><span class="막대"></span></span><span class="퍼센트">0%</span>`;
    막대들.append(줄);
  }
}

/** 0~9 각 숫자의 확률을 가로 막대로 보여 줍니다. 확률이 null이면 모두 0으로 되돌립니다. */
function 막대그래프_그리기(확률) {
  const 최대 = 확률 ? 가장_큰_번호(확률) : -1;
  [...막대들.children].forEach((줄, 숫자) => {
    const 값 = 확률 ? 확률[숫자] : 0;
    줄.querySelector(".막대").style.width = `${값 * 100}%`;
    줄.querySelector(".퍼센트").textContent = `${Math.round(값 * 100)}%`;
    줄.classList.toggle("최대", 숫자 === 최대);
  });
}

/** 모델에 들어가는 28×28 이미지를 보여 줍니다(CSS로 3배 확대). */
function 미리보기_그리기(작은그림) {
  const 이미지 = 미리보기.createImageData(28, 28);
  작은그림.forEach((값, i) => 이미지.data.set([값, 값, 값, 255], i * 4));
  미리보기.putImageData(이미지, 0, 0);
}

function 인식() {
  if (!모델) return;
  const 처리결과 = 전처리(그림, 모델.정규화);
  if (처리결과 === null) return;  // 그린 내용이 없음
  const 확률 = 추론(모델, 처리결과.입력);
  const 예측 = 가장_큰_번호(확률);
  결과_표시.textContent = String(예측);
  확신도_표시.textContent = `확신도: ${(확률[예측] * 100).toFixed(1)}%`;
  막대그래프_그리기(확률);
  미리보기_그리기(처리결과.작은그림);
}

function 지우기() {
  붓.clearRect(0, 0, 캔버스_크기, 캔버스_크기);
  미리보기.clearRect(0, 0, 28, 28);
  그림.데이터.fill(0);
  이전_좌표 = null;
  결과_표시.textContent = "?";
  확신도_표시.textContent = "";
  막대그래프_그리기(null);
}

function 그리기_끝() {
  if (이전_좌표 === null) return;
  이전_좌표 = null;
  인식();
}

function 이벤트_연결() {
  캔버스.addEventListener("pointerdown", (이벤트) => {
    if (!모델 || 이벤트.button !== 0) return;
    캔버스.setPointerCapture(이벤트.pointerId);  // 캔버스 밖으로 나가도 계속 이벤트를 받음
    이전_좌표 = 좌표(이벤트);
    점_찍기(...이전_좌표);
  });
  캔버스.addEventListener("pointermove", (이벤트) => {
    if (이전_좌표 === null) return;
    const 지금_좌표 = 좌표(이벤트);
    선_긋기(...이전_좌표, ...지금_좌표);
    이전_좌표 = 지금_좌표;
  });
  캔버스.addEventListener("pointerup", 그리기_끝);
  캔버스.addEventListener("pointercancel", 그리기_끝);
  캔버스.addEventListener("contextmenu", (이벤트) => {
    이벤트.preventDefault();
    지우기();
  });
  document.getElementById("인식하기").addEventListener("click", 인식);
  document.getElementById("지우기").addEventListener("click", 지우기);
}

async function 시작() {
  붓.lineWidth = 펜_굵기;
  붓.lineCap = "round";
  붓.lineJoin = "round";
  붓.strokeStyle = "black";
  붓.fillStyle = "black";
  막대그래프_만들기();
  지우기();
  이벤트_연결();
  try {
    모델 = await 모델_불러오기(new URL("model/", document.baseURI));
    상태_표시.textContent = "";
    캔버스.classList.remove("잠김");
  } catch (오류) {
    상태_표시.textContent = `모델을 불러오지 못했습니다: ${오류.message}`;
    상태_표시.classList.add("오류");
  }
}

시작();
```

- [ ] **Step 4: 기본 동작 확인 (데스크톱 크기)**

브라우저로 `http://localhost:8000/web_version/`을 연다(하위 경로에서 모델을 찾는지도 함께 확인된다).

1. 스크린샷: 상태 문구가 사라지고 그림판이 흐리지 않다. 콘솔(`read_console_messages`, onlyErrors)에 오류가 없다.
2. 그림판 가운데에서 위→아래로 드래그(`left_click_drag`)해 세로 선을 긋는다. Expected: `#결과`가 `1`이고, 확신도와 막대그래프, 28×28 미리보기가 채워진다.
3. [지우기] 버튼을 누른다. Expected: 그림판이 비고 `#결과`가 `?`, 막대가 모두 0%다.
4. "7" 모양(위쪽 가로 드래그 → 왼쪽 아래로 대각선 드래그를 한 획으로 그리기 어렵다면, 두 번 드래그해도 됨. 두 번째 드래그를 끝낸 뒤 결과를 본다)을 그린다. Expected: `#결과`가 `7`.

- [ ] **Step 5: Review Focus 확인**

1. **탭 한 번**: 지운 뒤 그림판을 한 번 클릭한다. Expected: 점이 찍히고 `#결과`가 `?`가 아닌 숫자로 바뀐다. 콘솔 오류 없음.
2. **캔버스 밖으로 나가는 획**: 지운 뒤 그림판 안에서 시작해 그림판 바깥(오른쪽 여백)까지 드래그한다. Expected: 콘솔 오류 없이 결과가 표시된다.
3. **오른쪽 클릭**: 그림판을 오른쪽 클릭한다. Expected: 메뉴가 뜨지 않고 그림판이 지워진다.
4. **좁은 화면**: `resize_window`로 폭 300, 높이 800으로 바꾸고 새로 고친다. 그림판 가운데에서 세로로 드래그한 뒤 스크린샷을 찍는다. Expected: 획이 드래그한 위치에 그려지고 `#결과`가 `1`이며 가로 스크롤이 없다. 확인 뒤 `resize_window` preset `desktop`으로 되돌린다.
5. **`file://`로 직접 열기**: `file:///C:/Users/지유/study01_MNIST/web_version/index.html`을 연다. Expected: 빨간 안내 문구 "파일을 직접 열면 동작하지 않습니다…"가 보인다. 브라우저가 file 주소를 열 수 없다면 이 항목은 건너뛰었다고 보고한다.

- [ ] **Step 6: 검사 페이지가 여전히 통과하는지 확인**

`http://localhost:8000/web_version/test.html` → Expected: `모두 통과 (31개)`

- [ ] **Step 7: 커밋**

```bash
git add web_version/index.html web_version/style.css web_version/js/app.js
git commit -m "웹 버전 그림판 화면 추가 (마우스·터치 지원)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: GitHub Pages 배포 워크플로와 CLAUDE.md 정리

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `web_version/CLAUDE.md`
- Modify: `CLAUDE.md` (루트, 최종본으로 교체)

**Interfaces:**
- Consumes: Task 1~5의 모든 파일 경로와 명령
- Produces: 없음

- [ ] **Step 1: `.github/workflows/pages.yml` 작성**

```yaml
# web_version 폴더만 GitHub Pages에 배포합니다.
# 저장소 Settings → Pages → Source를 "GitHub Actions"로 한 번 바꿔 두어야 합니다.
name: 웹 버전 배포

on:
  push:
    branches: [main]
    paths:
      - "web_version/**"
      - ".github/workflows/pages.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: web_version
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: YAML 문법 확인**

```bash
PYTHONIOENCODING=utf-8 "$PY" -c "
import yaml, sys
설정 = yaml.safe_load(open('.github/workflows/pages.yml', encoding='utf-8'))
print('작업:', list(설정['jobs']), '업로드 경로:', 설정['jobs']['deploy']['steps'][2]['with']['path'])
" 2>&1 || echo "PyYAML이 없으면 이 확인은 건너뛰고 들여쓰기를 눈으로 확인한다"
```

Expected: `작업: ['deploy'] 업로드 경로: web_version` (PyYAML이 없으면 건너뛴다고 보고)

- [ ] **Step 3: `web_version/CLAUDE.md` 작성**

````markdown
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

저장소 루트에서 띄우고 `http://localhost:8000/web_version/`으로 열면 GitHub Pages와 같은 하위 경로 상황을 확인할 수 있습니다(Claude는 `.claude/launch.json`의 `web` 서버를 씁니다).

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
````

- [ ] **Step 4: 루트 `CLAUDE.md` 최종본으로 교체**

````markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

MNIST로 학습한 CNN으로 손글씨 숫자를 인식하는 학습용 프로젝트입니다. 두 버전으로 나뉘고, 각 폴더에 자세한 CLAUDE.md가 있습니다.

- `desktop_version/`: PyTorch로 학습하고 tkinter 그림판에서 인식합니다. 웹용 가중치를 내보내는 `export_web.py`도 여기 있습니다.
- `web_version/`: 같은 가중치를 외부 라이브러리 없이 순수 자바스크립트로 추론하는 그림판 웹 앱입니다. GitHub Pages에 정적으로 배포합니다.
- `docs/superpowers/`: 두 버전으로 나눌 때의 설계 문서와 구현 계획.

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

## 배포

main 브랜치에 `web_version/`이 바뀌어 푸시되면 `.github/workflows/pages.yml`이 `web_version` 폴더만 GitHub Pages에 배포합니다. 주소는 `https://joykimus0423-dotcom.github.io/Study01_MNIST/`입니다. 저장소 Settings → Pages → Source가 "GitHub Actions"여야 합니다.
````

- [ ] **Step 5: 커밋**

```bash
git add .github/workflows/pages.yml web_version/CLAUDE.md CLAUDE.md
git commit -m "GitHub Pages 배포 워크플로와 폴더별 CLAUDE.md 추가" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 최종 확인

**Files:** 없음 (확인만)

- [ ] **Step 1: 데스크톱 버전 확인**

```bash
cd desktop_version
PYTHONIOENCODING=utf-8 "$PY" -c "
from PIL import Image, ImageDraw
from draw_app import 모델_불러오기, 전처리, 펜_굵기
모델 = 모델_불러오기()
그림 = Image.new('L', (280, 280), 0)
ImageDraw.Draw(그림).line([140, 40, 140, 240], fill=255, width=펜_굵기)
텐서, _ = 전처리(그림)
print('예측:', 모델(텐서).argmax(1).item())
"
PYTHONIOENCODING=utf-8 "$PY" export_web.py
cd ..
git status --short web_version/model
```

Expected: `예측: 1`, 내보내기 성공. `git status`에 `web_version/model` 변경이 없다(같은 가중치를 다시 내보내면 같은 파일이 나온다).

- [ ] **Step 2: 웹 검사와 화면 확인**

`http://localhost:8000/web_version/test.html` → `모두 통과 (31개)`. `http://localhost:8000/web_version/`에서 세로 선을 그려 `1`이 나온다.

- [ ] **Step 3: 저장소 구조 확인**

```bash
git ls-files
```

Expected: 루트에는 `.gitattributes`, `.gitignore`, `CLAUDE.md`, `.github/workflows/pages.yml`, `docs/...`만 있고, 나머지는 `desktop_version/`과 `web_version/` 아래에 있다. `.claude/launch.json`과 `data/`는 목록에 없다.
