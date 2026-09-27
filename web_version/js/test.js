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
