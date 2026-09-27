# -*- coding: utf-8 -*-
"""
마우스로 숫자를 그리면 학습된 CNN(mnist_cnn.pt)이 어떤 숫자인지 인식하는 프로그램

실행 방법:
    python draw_app.py

사용법:
    - 왼쪽 흰 캔버스에 마우스로 숫자(0~9)를 하나 그립니다.
    - 마우스 버튼을 떼면 자동으로 인식 결과가 표시됩니다.
    - [지우기] 버튼 또는 오른쪽 클릭으로 캔버스를 비웁니다.
"""
import os
import tkinter as tk
from tkinter import messagebox

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageOps

from model import MnistCNN

가중치_파일 = "mnist_cnn.pt"
캔버스_크기 = 280    # 화면에 보이는 그림판 크기(픽셀)
펜_굵기 = 20         # 붓 두께
MNIST_평균 = 0.1307
MNIST_표준편차 = 0.3081
글꼴 = "맑은 고딕"


def 모델_불러오기():
    """저장된 가중치를 불러와 추론용 모델을 준비합니다."""
    if not os.path.exists(가중치_파일):
        raise FileNotFoundError(
            f"'{가중치_파일}' 파일이 없습니다. 먼저 'python train.py'로 학습해 주세요.")
    모델 = MnistCNN()
    모델.load_state_dict(torch.load(가중치_파일, map_location="cpu"))
    모델.eval()  # 드롭아웃·배치정규화를 추론 모드로 전환
    return 모델


def 전처리(그림: Image.Image):
    """
    사용자가 그린 이미지를 MNIST와 같은 형태의 28x28 텐서로 바꿉니다.
    MNIST 원본 데이터는 숫자를 20x20 상자 안에 넣고, 무게중심이
    28x28 이미지의 가운데에 오도록 배치되어 있으므로 똑같이 맞춰 줍니다.
    그린 내용이 없으면 None을 돌려줍니다.
    """
    영역 = 그림.getbbox()  # 글씨(흰색)가 있는 부분의 경계 상자
    if 영역 is None:
        return None

    # 1) 글씨 부분만 잘라내기
    잘린 = 그림.crop(영역)

    # 2) 가로세로 비율을 유지하며 긴 변이 20픽셀이 되도록 축소
    너비, 높이 = 잘린.size
    배율 = 20.0 / max(너비, 높이)
    새_크기 = (max(1, round(너비 * 배율)), max(1, round(높이 * 배율)))
    잘린 = 잘린.resize(새_크기, Image.LANCZOS)

    # 3) 28x28 검은 바탕 가운데에 붙이기
    결과 = Image.new("L", (28, 28), 0)
    결과.paste(잘린, ((28 - 새_크기[0]) // 2, (28 - 새_크기[1]) // 2))

    # 4) 무게중심이 정중앙(14, 14)에 오도록 평행이동
    배열 = np.array(결과, dtype=np.float32)
    전체 = 배열.sum()
    if 전체 > 0:
        세로좌표, 가로좌표 = np.indices(배열.shape)
        중심_y = (세로좌표 * 배열).sum() / 전체
        중심_x = (가로좌표 * 배열).sum() / 전체
        이동_x = int(round(14 - 중심_x))
        이동_y = int(round(14 - 중심_y))
        결과 = 결과.transform(결과.size, Image.AFFINE, (1, 0, -이동_x, 0, 1, -이동_y), fillcolor=0)
        배열 = np.array(결과, dtype=np.float32)

    # 5) 0~1 범위로 바꾸고 학습 때와 같은 방식으로 정규화
    배열 = 배열 / 255.0
    배열 = (배열 - MNIST_평균) / MNIST_표준편차
    텐서 = torch.from_numpy(배열).unsqueeze(0).unsqueeze(0)  # (1, 1, 28, 28)
    return 텐서, 결과


class 숫자인식앱:
    """tkinter로 만든 손글씨 숫자 인식 그림판"""

    def __init__(self, 창, 모델):
        self.창 = 창
        self.모델 = 모델
        self.이전_좌표 = None

        창.title("손글씨 숫자 인식기 (MNIST CNN)")
        창.resizable(False, False)

        # ----- 왼쪽: 그림판 -----
        왼쪽 = tk.Frame(창, padx=10, pady=10)
        왼쪽.pack(side=tk.LEFT)
        tk.Label(왼쪽, text="여기에 숫자를 그려 주세요", font=(글꼴, 12)).pack()
        self.캔버스 = tk.Canvas(왼쪽, width=캔버스_크기, height=캔버스_크기,
                              bg="white", cursor="pencil",
                              highlightthickness=2, highlightbackground="#888")
        self.캔버스.pack(pady=5)

        버튼줄 = tk.Frame(왼쪽)
        버튼줄.pack(fill=tk.X)
        tk.Button(버튼줄, text="인식하기", font=(글꼴, 11), width=10,
                  command=self.인식).pack(side=tk.LEFT, expand=True)
        tk.Button(버튼줄, text="지우기", font=(글꼴, 11), width=10,
                  command=self.지우기).pack(side=tk.LEFT, expand=True)

        # ----- 오른쪽: 결과 표시 -----
        오른쪽 = tk.Frame(창, padx=10, pady=10)
        오른쪽.pack(side=tk.LEFT, fill=tk.Y)
        tk.Label(오른쪽, text="인식 결과", font=(글꼴, 12)).pack()
        self.결과_라벨 = tk.Label(오른쪽, text="?", font=(글꼴, 60, "bold"), fg="#1a5fb4", width=3)
        self.결과_라벨.pack()
        self.확신도_라벨 = tk.Label(오른쪽, text="", font=(글꼴, 10))
        self.확신도_라벨.pack()

        # 각 숫자별 확률 막대그래프
        self.막대_캔버스 = tk.Canvas(오른쪽, width=200, height=200, bg="white", highlightthickness=0)
        self.막대_캔버스.pack(pady=5)

        # 모델이 실제로 보는 28x28 이미지 미리보기
        tk.Label(오른쪽, text="모델 입력(28x28)", font=(글꼴, 9)).pack()
        self.미리보기 = tk.Canvas(오른쪽, width=84, height=84, bg="black", highlightthickness=0)
        self.미리보기.pack()

        # 화면과 똑같은 그림을 메모리 위 이미지에도 그려 둡니다(검은 바탕, 흰 글씨 = MNIST 형식).
        self.그림 = Image.new("L", (캔버스_크기, 캔버스_크기), 0)
        self.붓 = ImageDraw.Draw(self.그림)

        # 마우스 이벤트 연결
        self.캔버스.bind("<Button-1>", self.그리기_시작)
        self.캔버스.bind("<B1-Motion>", self.그리기)
        self.캔버스.bind("<ButtonRelease-1>", lambda 이벤트: self.인식())
        self.캔버스.bind("<Button-3>", lambda 이벤트: self.지우기())

        self.막대그래프_그리기(np.zeros(10))

    def 그리기_시작(self, 이벤트):
        self.이전_좌표 = (이벤트.x, 이벤트.y)
        self.점_찍기(이벤트.x, 이벤트.y)

    def 그리기(self, 이벤트):
        x, y = 이벤트.x, 이벤트.y
        if self.이전_좌표 is not None:
            px, py = self.이전_좌표
            # 화면 캔버스에 선 그리기
            self.캔버스.create_line(px, py, x, y, width=펜_굵기, fill="black",
                                  capstyle=tk.ROUND, smooth=True)
            # 메모리 이미지에도 같은 선 그리기
            self.붓.line([px, py, x, y], fill=255, width=펜_굵기)
        self.점_찍기(x, y)
        self.이전_좌표 = (x, y)

    def 점_찍기(self, x, y):
        """선의 끝부분이 둥글게 이어지도록 원을 찍습니다."""
        r = 펜_굵기 // 2
        self.캔버스.create_oval(x - r, y - r, x + r, y + r, fill="black", outline="black")
        self.붓.ellipse([x - r, y - r, x + r, y + r], fill=255)

    def 지우기(self):
        self.캔버스.delete("all")
        self.미리보기.delete("all")
        self.붓.rectangle([0, 0, 캔버스_크기, 캔버스_크기], fill=0)
        self.이전_좌표 = None
        self.결과_라벨.config(text="?")
        self.확신도_라벨.config(text="")
        self.막대그래프_그리기(np.zeros(10))

    @torch.no_grad()
    def 인식(self):
        self.이전_좌표 = None
        처리결과 = 전처리(self.그림)
        if 처리결과 is None:
            return
        텐서, 작은_그림 = 처리결과

        # 모델 추론 후 소프트맥스로 확률 계산
        확률 = torch.softmax(self.모델(텐서), dim=1)[0].numpy()
        예측 = int(확률.argmax())

        self.결과_라벨.config(text=str(예측))
        self.확신도_라벨.config(text=f"확신도: {확률[예측] * 100:.1f}%")
        self.막대그래프_그리기(확률)
        self.미리보기_그리기(작은_그림)

    def 막대그래프_그리기(self, 확률):
        """0~9 각 숫자의 확률을 가로 막대로 보여 줍니다."""
        c = self.막대_캔버스
        c.delete("all")
        최대 = int(np.argmax(확률)) if 확률.sum() > 0 else -1
        for 숫자 in range(10):
            y = 숫자 * 20 + 3
            c.create_text(10, y + 7, text=str(숫자), font=(글꼴, 9))
            길이 = 확률[숫자] * 140
            색 = "#1a5fb4" if 숫자 == 최대 else "#99c1f1"
            c.create_rectangle(22, y, 22 + 길이, y + 14, fill=색, outline="")
            c.create_text(170, y + 7, text=f"{확률[숫자] * 100:.0f}%", font=(글꼴, 8), anchor="w")

    def 미리보기_그리기(self, 작은_그림):
        """모델에 들어가는 28x28 이미지를 3배 확대해서 보여 줍니다."""
        self.미리보기.delete("all")
        픽셀 = np.array(작은_그림)
        for y in range(28):
            for x in range(28):
                값 = int(픽셀[y, x])
                if 값 > 0:
                    색 = f"#{값:02x}{값:02x}{값:02x}"
                    self.미리보기.create_rectangle(x * 3, y * 3, x * 3 + 3, y * 3 + 3,
                                                 fill=색, outline="")


def main():
    창 = tk.Tk()
    try:
        모델 = 모델_불러오기()
    except FileNotFoundError as 오류:
        창.withdraw()
        messagebox.showerror("가중치 파일 없음", str(오류))
        return
    숫자인식앱(창, 모델)
    창.mainloop()


if __name__ == "__main__":
    main()
