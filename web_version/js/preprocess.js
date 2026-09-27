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
