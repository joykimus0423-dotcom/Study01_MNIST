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
