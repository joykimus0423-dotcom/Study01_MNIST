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
