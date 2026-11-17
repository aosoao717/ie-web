/* test_logic.js — 화면 없이 핵심 기능 시험 (프롬프트 3-7)
 *
 * 데스크톱 앱 test_logic.py의 핵심 계산 시험 1~14번을 그대로 옮겼습니다.
 * 실행:  node tests/test_logic.js        (Node.js가 설치된 PC에서)
 */
"use strict";
var Logic = require("../js/logic.js");

var RESULTS = [];

function check(cond, msg) {
  if (!cond) throw new Error(msg || "기대 결과와 다름");
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function expectError(fn, contains) {
  try {
    fn();
  } catch (e) {
    check(String(e.message).indexOf(contains || "") >= 0, "오류 문구가 다름: " + e.message);
    return e.message;
  }
  throw new Error("오류가 나야 하는데 나지 않음");
}

function test(no, kind, title, fn) {
  try {
    fn();
    RESULTS.push([no, kind, title, true, ""]);
  } catch (e) {
    RESULTS.push([no, kind, title, false, e.message]);
  }
}

// ---------------------------------------------------------------------------
// 보고서에 싣는 대표 6건 (정상 3 · 예외 3)
// ---------------------------------------------------------------------------
test(1, "정상", "입고 1,000개·AQL 1.0·보통, 불량 2개 → J, n=80, Ac2/Re3, 합격", function () {
  var p = Logic.samplingPlan(1000, 1.0, "보통");
  check(same([p.code_letter, p.n, p.ac, p.re], ["J", 80, 2, 3]), JSON.stringify(p));
  check(Logic.judge(2, p.ac, p.re) === "합격");
});

test(2, "정상", "같은 로트를 까다로운 검사로, 불량 2개 → n=80, Ac1/Re2, 불합격", function () {
  var p = Logic.samplingPlan(1000, 1.0, "까다로운");
  check(same([p.n, p.ac, p.re], [80, 1, 2]), JSON.stringify(p));
  check(Logic.judge(2, p.ac, p.re) === "불합격");
});

test(3, "정상", "보통에서 [합,불,합,불] → 까다로운, 이어서 5로트 연속 합격 → 보통", function () {
  var r = Logic.severityState(["합격", "불합격", "합격", "불합격"]);
  check(r.state === "까다로운" && same(r.history, [[4, "보통", "까다로운"]]), JSON.stringify(r));
  r = Logic.severityState(["합격", "불합격", "합격", "불합격", "합격", "합격", "합격", "합격", "합격"]);
  check(r.state === "보통" && same(r.history[r.history.length - 1], [9, "까다로운", "보통"]), JSON.stringify(r));
});

test(4, "예외", "샘플 13개인데 불량 합계 14개 입력 → 저장 거부 + 안내", function () {
  var r = Logic.validateDefects({ "찍힘": 10, "치수 불량": 4 }, 13);
  check(r.total === 14 && r.errors.length && r.errors[0].indexOf("샘플수량") >= 0, JSON.stringify(r));
});

test(5, "예외", "입고수량 40,000개 / 1개 / 3.5개 → 입력 거부", function () {
  expectError(function () { Logic.codeLetter(40000); }, "35000");
  expectError(function () { Logic.codeLetter(1); }, "이상");
  expectError(function () { Logic.codeLetter(3.5); }, "정수");
});

test(6, "예외", "까다로운 검사 중 불합격 누계 5로트 → 중지, 중지 부품은 검사 거부", function () {
  var seq = ["불합격", "불합격", "불합격", "합격", "불합격", "합격", "불합격", "불합격"];
  check(Logic.severityState(seq).state === "까다로운");
  seq = seq.concat(["불합격"]);
  var r = Logic.severityState(seq);
  check(r.state === "중지" && r.history[r.history.length - 1][2] === "중지", JSON.stringify(r));
  expectError(function () { Logic.samplingPlan(1000, 1.0, "중지"); }, "재개");
});

// ---------------------------------------------------------------------------
// 추가 시험
// ---------------------------------------------------------------------------
test(7, "정상", "보통 검사표(표 2-A) 값이 공개 참고표(시료문자 C~M, AQL 0.65~4.0)와 일치", function () {
  var ref = {
    20: [[20, 0], [13, 0], [8, 0], [5, 0], [3, 0]],
    40: [[20, 0], [13, 0], [8, 0], [5, 0], [13, 1]],
    60: [[20, 0], [13, 0], [8, 0], [20, 1], [13, 1]],
    100: [[20, 0], [13, 0], [32, 1], [20, 1], [20, 2]],
    200: [[20, 0], [50, 1], [32, 1], [32, 2], [32, 3]],
    400: [[80, 1], [50, 1], [50, 2], [50, 3], [50, 5]],
    1000: [[80, 1], [80, 2], [80, 3], [80, 5], [80, 7]],
    2000: [[125, 2], [125, 3], [125, 5], [125, 7], [125, 10]],
    5000: [[200, 3], [200, 5], [200, 7], [200, 10], [200, 14]],
    20000: [[315, 5], [315, 7], [315, 10], [315, 14], [315, 21]]
  };
  Object.keys(ref).forEach(function (qty) {
    Logic.ALLOWED_AQLS.forEach(function (aql, i) {
      var p = Logic.samplingPlan(Number(qty), aql, "보통");
      check(p.n === ref[qty][i][0] && p.ac === ref[qty][i][1], qty + " " + aql + " " + JSON.stringify(p));
    });
  });
});

test(8, "정상", "입고 10개·AQL 0.65 → 표는 n=20이지만 입고수량 이하이므로 전수검사 n=10", function () {
  var p = Logic.samplingPlan(10, 0.65, "보통");
  check(p.full_inspection && p.n === 10 && p.ac === 0, JSON.stringify(p));
});

test(9, "정상", "보통에서 2로트 불합격이 5로트 밖으로 떨어져 있으면 전환 안 됨", function () {
  check(Logic.severityState(["불합격", "합격", "합격", "합격", "합격", "불합격"]).state === "보통");
});

test(10, "정상", "협력사 등급: 20로트 중 1 불합격 → LRR 5% → B / 4로트 → 평가 보류", function () {
  var s = Logic.supplierStats(20, 1, 3, 1000);
  check(Math.abs(s.lrr - 0.05) < 1e-12 && s.grade === "B" && s.ppm === 3000, JSON.stringify(s));
  check(Logic.supplierStats(4, 0, 0, 100).grade === "평가 보류");
  check(Logic.supplierStats(10, 1, 0, 100).grade === "C");
  check(Logic.supplierStats(50, 1, 0, 100).grade === "A");
});

test(11, "정상", "랭킹: LRR↓ → ppm↓ → 이름↑, 평가 보류는 맨 아래", function () {
  var rows = [{ name: "가", lrr: 0.1, ppm: 10, grade: "C" },
    { name: "나", lrr: 0.0, ppm: 0, grade: "평가 보류" },
    { name: "다", lrr: 0.1, ppm: 50, grade: "C" },
    { name: "라", lrr: 0.2, ppm: 5, grade: "D" }];
  check(same(Logic.rankSuppliers(rows).map(function (r) { return r.name; }), ["라", "다", "가", "나"]));
});

test(12, "정상", "파레토: 수량 내림차순, 동률은 이름순, '기타'는 맨 끝, 누적 100%", function () {
  var out = Logic.pareto({ "기타": 9, "찍힘": 5, "녹": 5, "치수 불량": 1, "이물": 0 });
  check(same(out.map(function (x) { return x[0]; }), ["녹", "찍힘", "치수 불량", "기타"]), JSON.stringify(out));
  check(Math.abs(out[out.length - 1][3] - 1.0) < 1e-12);
});

test(13, "예외", "날짜: 미래 입고일, 입고일보다 빠른 검사일 → 거부", function () {
  var today = "2026-11-10";
  check(Logic.validateDates("2026-11-11", null, today).length > 0);
  check(Logic.validateDates("2026-11-05", "2026-11-04", today).length > 0);
  check(Logic.validateDates("2026-11-05", "2026-11-05", today).length === 0);
});

test(14, "예외", "불량 수량 음수·소수 → 거부", function () {
  check(Logic.validateDefects({ "찍힘": -1 }, 13).errors.length > 0);
  check(Logic.validateDefects({ "찍힘": 1.5 }, 13).errors.length > 0);
});

test(15, "정상", "AQL 기준표: 시료문자 12행, 계획 120행(12 × AQL 5 × 엄격도 2)", function () {
  var t = Logic.buildPlanRows();
  check(t.codeRows.length === 12 && t.planRows.length === 120);
});

// ---------------------------------------------------------------------------
console.log("\nNo | 구분 | 시험 내용 | 결과");
RESULTS.forEach(function (r) {
  console.log((r[0] < 10 ? " " : "") + r[0] + " | " + r[1] + " | " + r[2] + " | " + (r[3] ? "통과" : "실패 — " + r[4]));
});
var ok = RESULTS.filter(function (r) { return r[3]; }).length;
console.log("\n" + RESULTS.length + "개 중 " + ok + "개 통과");
process.exit(ok === RESULTS.length ? 0 : 1);
