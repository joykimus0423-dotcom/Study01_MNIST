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
            if 모듈.bias is None:
                raise ValueError(f"웹 버전은 편향(bias)이 있는 합성곱만 지원합니다: {모듈}")
            if 모듈.groups != 1:
                raise ValueError(f"웹 버전은 groups=1인 합성곱만 지원합니다: {모듈}")
            if 모듈.dilation != (1, 1):
                raise ValueError(f"웹 버전은 dilation=1인 합성곱만 지원합니다: {모듈}")
            if 모듈.padding[0] != 모듈.padding[1]:
                raise ValueError(f"웹 버전은 가로세로 패딩이 같은 합성곱만 지원합니다: {모듈}")
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
            if not isinstance(모듈.kernel_size, int):
                raise ValueError(f"웹 버전은 정수 크기(정사각형)의 최대풀링만 지원합니다: {모듈}")
            if 모듈.stride != 모듈.kernel_size or 모듈.padding != 0:
                raise ValueError(f"웹 버전은 보폭이 크기와 같은 최대풀링만 지원합니다: {모듈}")
            if 모듈.dilation != 1:
                raise ValueError(f"웹 버전은 dilation=1인 최대풀링만 지원합니다: {모듈}")
            if 모듈.ceil_mode:
                raise ValueError(f"웹 버전은 ceil_mode=False인 최대풀링만 지원합니다: {모듈}")
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
