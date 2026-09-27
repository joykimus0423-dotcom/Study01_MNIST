# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

PyTorch CNN으로 MNIST를 학습하고, tkinter 그림판에 마우스로 그린 손글씨 숫자를 인식하는 학습용 프로젝트입니다.

**작성 규칙:** 코드, 주석, 변수·함수·클래스 이름을 모두 한글로 작성합니다(예: `모델_불러오기`, `전처리`, `숫자인식앱`). 사용자 요청이니 새 코드도 같은 방식을 따르세요.

## 실행 환경 (Windows)

- Python 3.13이 `%LOCALAPPDATA%\Programs\Python\Python313\`에 설치되어 있고, CPU 전용 PyTorch를 씁니다(CUDA 없음).
- 오래 열려 있던 셸에서는 `python`이 Windows 스토어 바로가기(`WindowsApps\python.exe`)로 연결되어 실행되지 않을 수 있습니다. 이럴 때는 전체 경로로 실행하세요: `& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" <스크립트>`
- PowerShell에서 한글 출력이 깨지지 않도록 `$env:PYTHONIOENCODING = "utf-8"`을 먼저 설정하세요.

## 명령어

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
