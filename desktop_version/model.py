# -*- coding: utf-8 -*-
"""
MNIST 손글씨 숫자 인식을 위한 CNN 모델 정의
학습(train.py)과 인식 프로그램(draw_app.py)에서 함께 사용합니다.
"""
import torch.nn as nn


class MnistCNN(nn.Module):
    """28x28 흑백 이미지를 입력받아 0~9 중 하나로 분류하는 합성곱 신경망"""

    def __init__(self):
        super().__init__()
        # 특징 추출부: 합성곱 → 배치정규화 → 활성화 → 풀링 을 두 번 반복
        self.features = nn.Sequential(
            # 1채널(흑백) → 32채널, 크기 28x28 유지
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.Conv2d(32, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),  # 28x28 → 14x14
            nn.Dropout(0.25),

            # 32채널 → 64채널
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),  # 14x14 → 7x7
            nn.Dropout(0.25),
        )
        # 분류부: 펼친 특징을 완전연결층으로 10개 클래스 점수로 변환
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 256),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, 10),
        )

    def forward(self, x):
        x = self.features(x)
        return self.classifier(x)
