/* logic.js — 핵심 계산 [고정]
 *
 * 데스크톱 앱의 logic.py를 그대로 JavaScript로 옮긴 파일입니다.
 * prd.md 3.3(상태 전이)과 3.4(계산 규칙 C1~C11)를 구현한 순수 함수 모음.
 * 이 파일은 화면(HTML)과 DB(Supabase)를 전혀 모릅니다 → 화면 없이 시험할 수 있습니다.
 *   시험:  node tests/test_logic.js
 */
(function (root) {
  "use strict";

  // -------------------------------------------------------------------------
  // AQL 기준표 (KS Q ISO 2859-1 / MIL-STD-105E 계열, 일반 검사수준 II, 1회 샘플링)
  // -------------------------------------------------------------------------
  var SEVERITY_NORMAL = "보통";
  var SEVERITY_TIGHT = "까다로운";
  var SEVERITY_STOP = "중지";

  var ALLOWED_AQLS = [0.65, 1.0, 1.5, 2.5, 4.0];
  var LOT_MIN = 2, LOT_MAX = 35000;

  // C1: [시료문자, 입고수량 최소, 최대] — 표 1, 검사수준 II (A~M만 사용)
  var CODE_LETTER_RANGES = [
    ["A", 2, 8], ["B", 9, 15], ["C", 16, 25], ["D", 26, 50], ["E", 51, 90],
    ["F", 91, 150], ["G", 151, 280], ["H", 281, 500], ["J", 501, 1200],
    ["K", 1201, 3200], ["L", 3201, 10000], ["M", 10001, 35000]
  ];
  // 시료문자별 샘플 수 (표 2의 행 순서 A..R)
  var LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "Q", "R"];
  var SAMPLE_SIZES = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000];
  var SAMPLE_SIZE = {};
  LETTERS.forEach(function (l, i) { SAMPLE_SIZE[l] = SAMPLE_SIZES[i]; });

  // 표 2의 AQL 열 순서
  var AQL_COLUMNS = [0.010, 0.015, 0.025, 0.040, 0.065, 0.10, 0.15, 0.25, 0.40, 0.65,
    1.0, 1.5, 2.5, 4.0, 6.5, 10, 15, 25, 40, 65, 100, 150, 250, 400, 650, 1000];

  // 표 2-A(보통) 칸의 종류는 '대각선 번호' d = (행 번호) + (AQL 열 번호) - 14 로 정해진다.
  //   d < 0: ↓,  d = 0: Ac 0,  d = 1: ↑,  d = 2: ↓,  d = 3..10: Ac 1,2,3,5,7,10,14,21,  d > 10: ↑
  var NORMAL_AC_SERIES = { 0: 0, 3: 1, 4: 2, 5: 3, 6: 5, 7: 7, 8: 10, 9: 14, 10: 21 };
  // 표 2-B(까다로운): 보통 표에서 AQL을 한 단계 엄격하게 옮긴 위치, Ac 계열은 0,1,2,3,5,8,12,18
  var TIGHT_AC_SERIES = { 0: 0, 3: 1, 4: 2, 5: 3, 6: 5, 7: 8, 8: 12, 9: 18 };

  function isInt(x) {
    return typeof x === "number" && Number.isInteger(x);
  }

  function _cell(row, col, severity) {
    var series, maxD;
    if (severity === SEVERITY_TIGHT) {
      col -= 1;
      series = TIGHT_AC_SERIES;
      maxD = 9;
    } else {
      series = NORMAL_AC_SERIES;
      maxD = 10;
    }
    var d = row + col - 14;
    if (d < 0 || d === 2) return ["down"];
    if (d === 1 || d > maxD) return ["up"];
    return ["plan", series[d]];
  }

  /** 화살표를 따라가 실제로 쓸 계획 [plan_letter, n, Ac, Re]을 찾는다. */
  function _resolve(letter, aql, severity) {
    var row = LETTERS.indexOf(letter);
    var col = AQL_COLUMNS.indexOf(aql);
    var step = 0;
    for (;;) {
      var cell = _cell(row, col, severity);
      if (cell[0] === "plan") {
        var ac = cell[1];
        var planLetter = LETTERS[row];
        return [planLetter, SAMPLE_SIZE[planLetter], ac, ac + 1];
      }
      if (step === 0) step = cell[0] === "down" ? 1 : -1;
      row += step;
      if (row < 0 || row >= LETTERS.length) {
        throw new Error("AQL 표에서 계획을 찾을 수 없음: " + letter + " " + aql + " " + severity);
      }
    }
  }

  /** DB의 aql_code_letter, aql_plan 표에 넣을 행을 만든다. */
  function buildPlanRows() {
    var codeRows = CODE_LETTER_RANGES.map(function (r) { return [r[0], r[1], r[2], SAMPLE_SIZE[r[0]]]; });
    var planRows = [];
    CODE_LETTER_RANGES.forEach(function (r) {
      ALLOWED_AQLS.forEach(function (aql) {
        [SEVERITY_NORMAL, SEVERITY_TIGHT].forEach(function (sev) {
          var p = _resolve(r[0], aql, sev);
          planRows.push([r[0], aql, sev, p[0], p[1], p[2], p[3]]);
        });
      });
    });
    return { codeRows: codeRows, planRows: planRows };
  }

  // -------------------------------------------------------------------------
  // C1~C3: 시료문자, 샘플링 계획, 합부 판정
  // -------------------------------------------------------------------------
  /** C1: 입고수량 → {letter, n}. 범위 밖이면 오류 (입력 규칙 3.2-2). */
  function codeLetter(lotQty) {
    if (!isInt(lotQty)) throw new Error("입고수량은 정수여야 합니다.");
    if (lotQty < LOT_MIN || lotQty > LOT_MAX) {
      throw new Error("입고수량은 " + LOT_MIN + " 이상 " + LOT_MAX + " 이하여야 합니다.");
    }
    for (var i = 0; i < CODE_LETTER_RANGES.length; i++) {
      var r = CODE_LETTER_RANGES[i];
      if (r[1] <= lotQty && lotQty <= r[2]) return { letter: r[0], n: SAMPLE_SIZE[r[0]] };
    }
    throw new Error("시료문자를 찾을 수 없습니다.");
  }

  /** C2: 입고수량·AQL·엄격도 → 샘플링 계획. n이 입고수량 이상이면 전수검사(n = 입고수량). */
  function samplingPlan(lotQty, aql, severity) {
    if (ALLOWED_AQLS.indexOf(aql) < 0) throw new Error("AQL은 " + ALLOWED_AQLS.join(", ") + " 중 하나여야 합니다.");
    if (severity === SEVERITY_STOP) throw new Error("검사 중지 상태인 부품은 관리자가 재개하기 전에는 검사할 수 없습니다.");
    if (severity !== SEVERITY_NORMAL && severity !== SEVERITY_TIGHT) throw new Error("엄격도는 '보통' 또는 '까다로운'이어야 합니다.");
    var letter = codeLetter(lotQty).letter;
    var p = _resolve(letter, aql, severity);
    var n = p[1];
    var full = n >= lotQty;
    if (full) n = lotQty;
    return { code_letter: letter, plan_letter: p[0], n: n, ac: p[2], re: p[3], full_inspection: full };
  }

  /** C3: 불량품수 ≤ Ac → 합격, ≥ Re → 불합격. */
  function judge(defectiveQty, ac, re) {
    if (defectiveQty < 0) throw new Error("불량품수는 0 이상이어야 합니다.");
    if (re !== ac + 1) throw new Error("1회 샘플링에서는 Re = Ac + 1 이어야 합니다.");
    return defectiveQty <= ac ? "합격" : "불합격";
  }

  /** 입력 규칙 3.2-4. defects: {불량유형: 수량}. 반환: {total, errors}. 오류가 있으면 저장하면 안 된다. */
  function validateDefects(defects, sampleQty) {
    var errors = [];
    var total = 0;
    Object.keys(defects).forEach(function (name) {
      var qty = defects[name];
      if (!isInt(qty) || qty < 0) {
        errors.push("'" + name + "' 수량은 0 이상의 정수여야 합니다.");
        return;
      }
      total += qty;
    });
    if (errors.length === 0 && total > sampleQty) {
      errors.push("불량품수(" + total + ")가 샘플수량(" + sampleQty + ")보다 클 수 없습니다.");
    }
    return { total: total, errors: errors };
  }

  /** 오늘 날짜를 'YYYY-MM-DD'로 (사용자 PC의 현지 시간 기준) */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** 입력 규칙 3.2-5. 날짜는 'YYYY-MM-DD' 문자열 (문자열 비교 = 날짜 비교). */
  function validateDates(received, inspected, today) {
    today = today || todayStr();
    var errors = [];
    if (received > today) errors.push("입고일은 미래 날짜일 수 없습니다.");
    if (inspected) {
      if (inspected > today) errors.push("검사일은 미래 날짜일 수 없습니다.");
      if (inspected < received) errors.push("검사일은 입고일보다 빠를 수 없습니다.");
    }
    return errors;
  }

  // -------------------------------------------------------------------------
  // C4: 엄격도 전환 (prd.md 3.3 (2))
  // -------------------------------------------------------------------------
  /** results: 시간순 판정 목록 ['합격'/'불합격', ...] (취소된 검사 제외).
   *  반환: {state: 현재 엄격도, history: [[몇 번째 로트 뒤, 이전, 이후], ...]}
   *  - 보통 → 까다로운: 보통 검사에서 연속 5로트 이내에 불합격 2로트
   *  - 까다로운 → 보통: 까다로운 검사에서 연속 5로트 합격
   *  - 까다로운 → 중지: 까다로운 검사 중 불합격 누계 5로트 */
  function severityState(results, start) {
    var state = start || SEVERITY_NORMAL;
    var window = [];       // 보통 상태의 최근 판정 (최대 5개)
    var streak = 0;        // 까다로운 상태의 연속 합격 수
    var tightRejects = 0;  // 까다로운 상태의 불합격 누계
    var history = [];
    for (var k = 0; k < results.length; k++) {
      var i = k + 1, r = results[k];
      if (state === SEVERITY_STOP) break;  // 중지 후 검사는 재개 전에는 없어야 한다
      if (state === SEVERITY_NORMAL) {
        window.push(r);
        window = window.slice(-5);
        if (window.filter(function (x) { return x === "불합격"; }).length >= 2) {
          history.push([i, state, SEVERITY_TIGHT]);
          state = SEVERITY_TIGHT; streak = 0; tightRejects = 0;
        }
      } else if (state === SEVERITY_TIGHT) {
        if (r === "합격") {
          streak += 1;
          if (streak >= 5) {
            history.push([i, state, SEVERITY_NORMAL]);
            state = SEVERITY_NORMAL; window = [];
          }
        } else {
          streak = 0;
          tightRejects += 1;
          if (tightRejects >= 5) {
            history.push([i, state, SEVERITY_STOP]);
            state = SEVERITY_STOP;
          }
        }
      }
    }
    return { state: state, history: history };
  }

  // -------------------------------------------------------------------------
  // C5~C9: 협력사 통계, 등급, 랭킹
  // -------------------------------------------------------------------------
  /** C5~C8. 검사 완료 로트 수, 불합격 로트 수, Σ불량품수, Σ샘플수량 → {lrr, defect_rate, ppm, grade} */
  function supplierStats(nLots, nRejected, sumDefective, sumSample) {
    if (nLots < 0 || nRejected < 0 || nRejected > nLots) throw new Error("로트 수가 올바르지 않습니다.");
    var lrr = nLots ? nRejected / nLots : 0.0;
    var rate = sumSample ? sumDefective / sumSample : 0.0;
    var ppm = pyRound(rate * 1000000);
    var grade;
    if (nLots < 5) grade = "평가 보류";
    else if (lrr <= 0.02) grade = "A";
    else if (lrr <= 0.05) grade = "B";
    else if (lrr <= 0.10) grade = "C";
    else grade = "D";
    return { lrr: lrr, defect_rate: rate, ppm: ppm, grade: grade };
  }

  /** 파이썬 round()와 같은 '짝수 쪽 반올림' (x.5일 때) */
  function pyRound(x) {
    var f = Math.floor(x), diff = x - f;
    if (diff > 0.5) return f + 1;
    if (diff < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  /** C9. rows: {name, lrr, ppm, grade} 목록. LRR↓, ppm↓, 이름↑, '평가 보류'는 맨 아래. */
  function rankSuppliers(rows) {
    return rows.slice().sort(function (a, b) {
      var ha = a.grade === "평가 보류" ? 1 : 0, hb = b.grade === "평가 보류" ? 1 : 0;
      if (ha !== hb) return ha - hb;
      if (a.lrr !== b.lrr) return b.lrr - a.lrr;
      if (a.ppm !== b.ppm) return b.ppm - a.ppm;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  // -------------------------------------------------------------------------
  // C10~C11: 파레토, 표시
  // -------------------------------------------------------------------------
  /** C10. counts: {불량유형명: 수량} → [[유형, 수량, 비율, 누적비율], ...] (수량 0은 제외) */
  function pareto(counts, otherName) {
    otherName = otherName || "기타";
    var items = Object.keys(counts).map(function (k) { return [k, counts[k]]; }).filter(function (x) { return x[1] > 0; });
    var main = items.filter(function (x) { return x[0] !== otherName; }).sort(function (a, b) {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
    var tail = items.filter(function (x) { return x[0] === otherName; });
    var ordered = main.concat(tail);
    var total = ordered.reduce(function (s, x) { return s + x[1]; }, 0);
    var cum = 0;
    return ordered.map(function (x) {
      cum += x[1];
      return [x[0], x[1], x[1] / total, cum / total];
    });
  }

  /** C11: 소수 → '12.34%' */
  function pct(x) {
    return (x * 100).toFixed(2) + "%";
  }

  var Logic = {
    SEVERITY_NORMAL: SEVERITY_NORMAL, SEVERITY_TIGHT: SEVERITY_TIGHT, SEVERITY_STOP: SEVERITY_STOP,
    ALLOWED_AQLS: ALLOWED_AQLS, LOT_MIN: LOT_MIN, LOT_MAX: LOT_MAX,
    buildPlanRows: buildPlanRows, codeLetter: codeLetter, samplingPlan: samplingPlan, judge: judge,
    validateDefects: validateDefects, validateDates: validateDates, todayStr: todayStr,
    severityState: severityState, supplierStats: supplierStats, rankSuppliers: rankSuppliers,
    pareto: pareto, pct: pct
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Logic;  // node 시험용
  root.Logic = Logic;                                                           // 브라우저용
})(typeof window !== "undefined" ? window : globalThis);
