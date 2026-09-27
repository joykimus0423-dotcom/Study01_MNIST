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
