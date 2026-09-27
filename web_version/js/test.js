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
