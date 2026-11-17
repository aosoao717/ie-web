/* db.js — Supabase(클라우드 DB) 연결과 데이터 읽기·쓰기
 *
 * 데스크톱 앱의 db.py와 같은 이름·같은 역할의 함수를 모았습니다.
 *   - 화면(ui.js)은 이 파일의 함수만 부르고, SQL이나 Supabase를 직접 다루지 않습니다.
 *   - 판정·엄격도 계산은 logic.js [고정] 함수를 불러서 씁니다.
 *   - 여러 표를 한 번에 바꾸는 저장·취소는 DB 함수(save_inspection, cancel_inspection)로 처리합니다.
 */
(function (root) {
  "use strict";
  var Logic = root.Logic;
  var sb = null;
  var PAGE = 1000;  // Supabase는 한 번에 최대 1000행까지 돌려주므로 나눠서 받는다

  function connect(url, key) {
    sb = root.supabase.createClient(url, key);
    return sb;
  }

  // ---------------------------------------------------------------------------
  // 공통 도우미
  // ---------------------------------------------------------------------------
  function friendlyError(err) {
    var msg = (err && err.message) || String(err);
    if (err && err.code === "23505") return "이미 등록된 번호(코드)입니다. 다른 값을 입력하세요.";
    if (err && err.code === "23514") return "데이터 규칙에 맞지 않습니다: " + msg;
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return "Supabase에 연결하지 못했습니다. 인터넷 연결과 js/config.js의 주소·키를 확인하세요.";
    }
    if (/Invalid API key|No API key/i.test(msg)) return "Supabase 키가 올바르지 않습니다. js/config.js의 SUPABASE_KEY를 확인하세요.";
    if (/relation .* does not exist|Could not find the (table|function)/i.test(msg)) {
      return "DB에 표가 없습니다. Supabase SQL Editor에서 01_schema.sql을 먼저 실행하세요. (" + msg + ")";
    }
    return msg;
  }

  function fail(error) {
    var e = new Error(friendlyError(error));
    e.code = error && error.code;
    throw e;
  }

  async function run(query) {
    var res = await query;
    if (res.error) fail(res.error);
    return res.data;
  }

  /** 1000행이 넘어도 전부 받기. makeQuery()는 매번 새 쿼리를 만들어야 한다. */
  async function fetchAll(makeQuery) {
    var out = [];
    for (var from = 0; ; from += PAGE) {
      var rows = await run(makeQuery().range(from, from + PAGE - 1));
      out = out.concat(rows);
      if (rows.length < PAGE) return out;
    }
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  /** 지금 시각 'YYYY-MM-DD HH:MM:SS' (사용자 PC의 현지 시간) */
  function nowStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  /** DB가 돌려준 시각 '2026-11-10T21:52:16' → '2026-11-10 21:52:16' */
  function ts(x) {
    return x ? String(x).replace("T", " ").slice(0, 19) : x;
  }

  function nextDay(dateStr) {
    var p = dateStr.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2] + 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function num(x) { return x === null || x === undefined ? x : Number(x); }

  // ---------------------------------------------------------------------------
  // 기준정보
  // ---------------------------------------------------------------------------
  function listSuppliers() {
    return run(sb.from("supplier").select("*").order("name"));
  }

  async function listParts() {
    var rows = await run(sb.from("v_part").select("*").order("part_no"));
    rows.forEach(function (r) { r.aql = num(r.aql); r.resumed_at = ts(r.resumed_at); });
    return rows;
  }

  function listDefectTypes() {
    return run(sb.from("defect_type").select("*").order("code"));
  }

  function listInspectors() {
    return run(sb.from("inspector").select("*").order("name"));
  }

  function addSupplier(code, name, contactPerson, phone) {
    return run(sb.from("supplier").insert({
      code: code.trim(), name: name.trim(), contact_person: contactPerson || null, phone: phone || null
    }));
  }

  function addPart(partNo, name, supplierId, aql) {
    aql = Number(aql);
    if (Logic.ALLOWED_AQLS.indexOf(aql) < 0) throw new Error("AQL은 " + Logic.ALLOWED_AQLS.join(", ") + " 중 하나여야 합니다.");
    return run(sb.from("part").insert({ part_no: partNo.trim(), name: name.trim(), supplier_id: supplierId, aql: aql }));
  }

  function addDefectType(code, name) {
    return run(sb.from("defect_type").insert({ code: code.trim(), name: name.trim() }));
  }

  function addInspector(name) {
    return run(sb.from("inspector").insert({ name: name.trim() }));
  }

  // ---------------------------------------------------------------------------
  // 로트·엄격도·샘플링 계획
  // ---------------------------------------------------------------------------
  /** 다음 로트번호 제안 (v1.1 의견 반영): L+오늘(yymmdd)-(기존 최대 일련번호+1, 3자리) */
  async function nextLotNo() {
    var rows = await fetchAll(function () { return sb.from("lot").select("lot_no").order("lot_id"); });
    var maxSeq = 0;
    rows.forEach(function (r) {
      var tail = r.lot_no.split("-").pop();
      if (/^\d+$/.test(tail)) maxSeq = Math.max(maxSeq, parseInt(tail, 10));
    });
    var t = Logic.todayStr();
    return "L" + t.slice(2, 4) + t.slice(5, 7) + t.slice(8, 10) + "-" + String(maxSeq + 1).padStart(3, "0");
  }

  /** 로트 등록. receivedDate: 'YYYY-MM-DD'. 상태는 항상 '대기'. 반환: lot_id */
  async function addLot(lotNo, partId, receivedDate, lotQty) {
    Logic.codeLetter(lotQty);                          // 3.2-2 범위 확인
    var errors = Logic.validateDates(receivedDate, null);
    if (errors.length) throw new Error(errors.join(" "));
    var row = await run(sb.from("lot").insert({
      lot_no: lotNo.trim(), part_id: partId, received_date: receivedDate, lot_qty: lotQty
    }).select("lot_id").single());
    return row.lot_id;
  }

  /** 엄격도 계산용: 재개 이후, 취소되지 않은 검사의 판정을 시간순으로 */
  async function partResults(partId) {
    var part = await run(sb.from("part").select("resumed_at").eq("part_id", partId).maybeSingle());
    var resumedAt = part ? ts(part.resumed_at) : null;
    var rows = await fetchAll(function () {
      var q = sb.from("v_inspection").select("result").eq("part_id", partId).eq("is_cancelled", false);
      if (resumedAt) q = q.gt("inspected_at", resumedAt);
      return q.order("inspected_at").order("inspection_id");
    });
    return {
      results: rows.map(function (r) { return r.result; }),
      start: resumedAt ? Logic.SEVERITY_TIGHT : Logic.SEVERITY_NORMAL
    };
  }

  async function currentSeverity(partId) {
    var pr = await partResults(partId);
    return Logic.severityState(pr.results, pr.start).state;
  }

  /** 로트의 현재 샘플링 계획. AQL 기준표(aql_code_letter, aql_plan)를 DB에서 조회하고 전수검사 여부를 반영 */
  async function planForLot(lotId) {
    var lot = await run(sb.from("lot").select("lot_id, part_id, lot_qty, received_date, status").eq("lot_id", lotId).maybeSingle());
    if (!lot) throw new Error("로트를 찾을 수 없습니다.");
    var part = await run(sb.from("part").select("aql").eq("part_id", lot.part_id).single());
    var aql = num(part.aql);
    var sev = await currentSeverity(lot.part_id);
    if (sev === Logic.SEVERITY_STOP) return { severity: sev, blocked: true, lot: lot };
    var code = await run(sb.from("aql_code_letter").select("code_letter")
      .lte("lot_min", lot.lot_qty).gte("lot_max", lot.lot_qty).single());
    var row = await run(sb.from("aql_plan").select("plan_letter, sample_size, ac, re")
      .eq("code_letter", code.code_letter).eq("aql", aql).eq("severity", sev).single());
    return {
      severity: sev, blocked: false, code_letter: code.code_letter, plan_letter: row.plan_letter,
      n: Math.min(row.sample_size, lot.lot_qty), ac: row.ac, re: row.re,
      full_inspection: row.sample_size >= lot.lot_qty, lot_qty: lot.lot_qty, aql: aql, lot: lot
    };
  }

  // ---------------------------------------------------------------------------
  // 검사 저장·취소·재개
  // ---------------------------------------------------------------------------
  /** defects: {defect_type_id: 수량}. 검증 → 판정 → (DB 함수로) 검사·불량내역 저장 + 로트 상태 변경을 한 번에.
   *  반환: {inspection_id, result, defective_qty, severity_before, severity_after, plan} */
  async function saveInspection(lotId, inspectorId, defects, remark) {
    var plan = await planForLot(lotId);
    var lot = plan.lot;
    if (lot.status !== "대기") throw new Error("'대기' 상태인 로트만 검사할 수 있습니다. (현재: " + lot.status + ")");
    if (plan.blocked) throw new Error("이 부품은 검사 중지 상태입니다. 기준정보 탭에서 관리자가 재개해야 합니다.");
    var inspectedAt = nowStr();
    var errors = Logic.validateDates(lot.received_date, inspectedAt.slice(0, 10));
    var v = Logic.validateDefects(defects, plan.n);
    errors = errors.concat(v.errors);
    if (errors.length) throw new Error(errors.join(" "));
    var result = Logic.judge(v.total, plan.ac, plan.re);
    var defectList = Object.keys(defects).map(function (id) { return { defect_type_id: Number(id), qty: defects[id] }; });
    var iid = await run(sb.rpc("save_inspection", {
      p_lot_id: lotId, p_inspector_id: inspectorId, p_inspected_at: inspectedAt,
      p_severity: plan.severity, p_code_letter: plan.code_letter, p_sample_qty: plan.n,
      p_ac: plan.ac, p_re: plan.re, p_defective_qty: v.total, p_result: result,
      p_remark: remark || "", p_defects: defectList
    }));
    var after = await currentSeverity(lot.part_id);
    return { inspection_id: iid, result: result, defective_qty: v.total,
      severity_before: plan.severity, severity_after: after, plan: plan };
  }

  /** 판정 취소: 사유 필수, 기록은 남기고 로트는 '대기'로 */
  async function cancelInspection(inspectionId, reason) {
    if (!reason || !reason.trim()) throw new Error("판정 취소 사유를 입력해야 합니다.");
    await run(sb.rpc("cancel_inspection", { p_inspection_id: inspectionId, p_reason: reason.trim(), p_cancelled_at: nowStr() }));
  }

  /** 중지 부품 재개: 재개 일시 이후 검사만으로 엄격도를 다시 계산 (시작은 '까다로운') */
  async function resumePart(partId) {
    if ((await currentSeverity(partId)) !== Logic.SEVERITY_STOP) throw new Error("검사 중지 상태인 부품만 재개할 수 있습니다.");
    await run(sb.from("part").update({ resumed_at: nowStr() }).eq("part_id", partId));
  }

  // ---------------------------------------------------------------------------
  // 조회
  // ---------------------------------------------------------------------------
  async function pendingLots() {
    var rows = await fetchAll(function () {
      return sb.from("v_pending_lot").select("*").order("received_date").order("lot_no");
    });
    rows.forEach(function (r) { r.aql = num(r.aql); });
    return rows;
  }

  function applyFilters(q, dateFrom, dateTo, supplierId, partId) {
    if (dateFrom) q = q.gte("inspected_at", dateFrom);
    if (dateTo) q = q.lt("inspected_at", nextDay(dateTo));
    if (supplierId) q = q.eq("supplier_id", supplierId);
    if (partId) q = q.eq("part_id", partId);
    return q;
  }

  async function searchInspections(dateFrom, dateTo, supplierId, partId, result, includeCancelled) {
    var rows = await fetchAll(function () {
      var q = applyFilters(sb.from("v_inspection").select("*"), dateFrom, dateTo, supplierId, partId);
      if (result) q = q.eq("result", result);
      if (!includeCancelled) q = q.eq("is_cancelled", false);
      return q.order("inspected_at", { ascending: false }).order("inspection_id", { ascending: false });
    });
    rows.forEach(function (r) { r.inspected_at = ts(r.inspected_at); r.cancelled_at = ts(r.cancelled_at); });
    return rows;
  }

  /** 파레토용 {불량유형명: 수량} (취소 제외) */
  async function defectCounts(dateFrom, dateTo, supplierId, partId) {
    var rows = await fetchAll(function () {
      return applyFilters(sb.from("v_inspection_defect").select("defect_name, qty"), dateFrom, dateTo, supplierId, partId)
        .eq("is_cancelled", false).order("inspection_id").order("defect_type_id");
    });
    var counts = {};
    rows.forEach(function (r) { counts[r.defect_name] = (counts[r.defect_name] || 0) + r.qty; });
    return counts;
  }

  /** 협력사 등급 표: 검사 완료 로트·불합격·LRR·ppm·등급, C9 순서 */
  async function supplierSummary(dateFrom, dateTo) {
    var suppliers = await listSuppliers();
    var rows = await fetchAll(function () {
      return applyFilters(sb.from("v_inspection").select("supplier_id, result, defective_qty, sample_qty"), dateFrom, dateTo, null, null)
        .eq("is_cancelled", false).order("inspection_id");
    });
    var agg = {};
    suppliers.forEach(function (s) { agg[s.supplier_id] = { n: 0, rej: 0, def: 0, sam: 0 }; });
    rows.forEach(function (r) {
      var a = agg[r.supplier_id];
      if (!a) return;
      a.n += 1;
      if (r.result === "불합격") a.rej += 1;
      a.def += r.defective_qty;
      a.sam += r.sample_qty;
    });
    var out = suppliers.map(function (s) {
      var a = agg[s.supplier_id];
      var st = Logic.supplierStats(a.n, a.rej, a.def, a.sam);
      return { supplier_id: s.supplier_id, name: s.name, n_lots: a.n, n_rejected: a.rej,
        lrr: st.lrr, defect_rate: st.defect_rate, ppm: st.ppm, grade: st.grade };
    });
    return Logic.rankSuppliers(out);
  }

  /** 부품별 현재 엄격도 (한 번에 모든 검사를 받아 부품별로 계산) */
  async function severityOverview() {
    var parts = await listParts();
    var rows = await fetchAll(function () {
      return sb.from("v_inspection").select("part_id, result, inspected_at")
        .eq("is_cancelled", false).order("inspected_at").order("inspection_id");
    });
    return parts.map(function (p) {
      var results = rows.filter(function (r) {
        return r.part_id === p.part_id && (!p.resumed_at || ts(r.inspected_at) > p.resumed_at);
      }).map(function (r) { return r.result; });
      var start = p.resumed_at ? Logic.SEVERITY_TIGHT : Logic.SEVERITY_NORMAL;
      return { part_id: p.part_id, part_no: p.part_no, name: p.name, supplier_name: p.supplier_name,
        aql: p.aql, severity: Logic.severityState(results, start).state };
    });
  }

  var DB = {
    connect: connect, friendlyError: friendlyError, nowStr: nowStr,
    listSuppliers: listSuppliers, listParts: listParts, listDefectTypes: listDefectTypes, listInspectors: listInspectors,
    addSupplier: addSupplier, addPart: addPart, addDefectType: addDefectType, addInspector: addInspector,
    nextLotNo: nextLotNo, addLot: addLot, partResults: partResults, currentSeverity: currentSeverity,
    planForLot: planForLot, saveInspection: saveInspection, cancelInspection: cancelInspection, resumePart: resumePart,
    pendingLots: pendingLots, searchInspections: searchInspections, defectCounts: defectCounts,
    supplierSummary: supplierSummary, severityOverview: severityOverview
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DB;
  root.DB = DB;
})(typeof window !== "undefined" ? window : globalThis);
