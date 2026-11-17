/* ui.js — 화면 (탭 5개). 데스크톱 앱 ui.py와 같은 구성입니다.
 *
 * [고정] 화면은 logic.js / db.js 함수를 불러다 쓰기만 하고 계산을 직접 하지 않는다.
 */
(function () {
  "use strict";
  var L = window.Logic;
  var DB = window.DB;
  var CFG = window.APP_CONFIG || {};
  var SEV_CLASS = { "보통": "sev-보통", "까다로운": "sev-까다로운", "중지": "sev-중지" };

  // ---------------------------------------------------------------------------
  // 공통 도우미
  // ---------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }

  /** AQL 표시: 1 → "1.0", 0.65 → "0.65" (데스크톱 앱과 같게) */
  function aqlText(x) { x = Number(x); return Number.isInteger(x) ? x.toFixed(1) : String(x); }

  function toast(msg, kind) {
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    $("toasts").appendChild(el);
    setTimeout(function () { el.remove(); }, kind === "err" ? 7000 : 3500);
  }

  function errMsg(e) { return (e && e.message) || String(e); }

  /** 버튼을 잠시 잠그고 작업 실행 (두 번 눌러 중복 저장되는 것 방지). 오류는 빨간 알림으로. */
  async function guard(btn, fn) {
    if (btn) btn.disabled = true;
    document.body.classList.add("busy");
    try {
      return await fn();
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      if (btn) btn.disabled = false;
      document.body.classList.remove("busy");
    }
  }

  function toInt(text, field) {
    text = String(text || "").trim().replace(/,/g, "");
    if (text === "") return 0;
    if (!/^-?\d+$/.test(text)) throw new Error("'" + field + "'에는 정수를 입력하세요. (입력값: " + text + ")");
    return parseInt(text, 10);
  }

  function checkDate(text, field) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text || "").trim())) {
      throw new Error("'" + field + "'은(는) 2026-11-10 같은 형식으로 입력하세요.");
    }
    return text.trim();
  }

  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function options(select, items, keep) {
    var prev = keep ? select.value : null;
    select.innerHTML = items.map(function (it) {
      return '<option value="' + esc(it[0]) + '">' + esc(it[1]) + "</option>";
    }).join("");
    if (prev !== null && items.some(function (it) { return String(it[0]) === prev; })) select.value = prev;
  }

  function emptyRow(tbody, cols, text) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="' + cols + '">' + esc(text) + "</td></tr>";
  }

  function sevBadge(sev) { return '<span class="badge ' + SEV_CLASS[sev] + '">' + esc(sev) + "</span>"; }

  function gradeBadge(g) {
    var cls = g === "평가 보류" ? "g-보류" : "g-" + g;
    return '<span class="grade ' + cls + '">' + esc(g) + "</span>";
  }

  /** 표에서 한 행 선택 */
  function selectable(tbody, onSelect) {
    tbody.addEventListener("click", function (ev) {
      var tr = ev.target.closest("tr[data-id]");
      if (!tr) return;
      Array.prototype.forEach.call(tbody.querySelectorAll("tr.selected"), function (x) { x.classList.remove("selected"); });
      tr.classList.add("selected");
      onSelect(tr.getAttribute("data-id"), tr);
    });
  }

  function selectedId(tbody) {
    var tr = tbody.querySelector("tr.selected");
    return tr ? tr.getAttribute("data-id") : null;
  }

  /** CSV 파일로 내려받기 (엑셀에서 한글이 안 깨지게 BOM 포함) */
  function downloadCsv(headers, rows, filename) {
    if (!rows.length) { toast("저장할 내용이 없습니다. 먼저 조회하세요."); return; }
    var q = function (v) {
      v = String(v === null || v === undefined ? "" : v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var text = "﻿" + [headers].concat(rows).map(function (r) { return r.map(q).join(","); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("CSV 파일을 내려받았습니다: " + filename, "ok");
  }

  // ---------------------------------------------------------------------------
  // 기간·협력사·부품 필터 (이력·파레토·등급 탭 공용)
  // ---------------------------------------------------------------------------
  function FilterBar(box, opts) {
    var html = '<label>시작일<input type="date" data-k="from"></label>' +
      '<label>종료일<input type="date" data-k="to"></label>';
    if (opts.supplier) html += '<label>협력사<select data-k="sup"></select></label>';
    if (opts.part) html += '<label class="wide">부품<select data-k="part"></select></label>';
    if (opts.result) html += '<label>판정<select data-k="res"><option value="">(전체)</option><option>합격</option><option>불합격</option></select></label>';
    if (opts.cancel) html += '<label class="check"><input type="checkbox" data-k="cancel">취소 포함</label>';
    html += '<button class="btn primary" type="button" data-k="go">조회</button>';
    if (opts.csv) html += '<button class="btn" type="button" data-k="csv">CSV 저장</button>';
    box.innerHTML = html;
    var el = function (k) { return box.querySelector('[data-k="' + k + '"]'); };
    el("from").value = daysAgo(91);
    el("to").value = L.todayStr();
    el("go").addEventListener("click", function () { opts.onSearch(el("go")); });
    if (opts.csv) el("csv").addEventListener("click", opts.csv);

    this.reload = async function () {
      if (opts.supplier) {
        var s = await DB.listSuppliers();
        options(el("sup"), [["", "(전체)"]].concat(s.map(function (x) { return [x.supplier_id, x.name]; })), true);
      }
      if (opts.part) {
        var p = await DB.listParts();
        options(el("part"), [["", "(전체)"]].concat(p.map(function (x) { return [x.part_id, x.part_no + " " + x.name]; })), true);
      }
    };
    this.values = function () {
      return {
        from: checkDate(el("from").value, "시작일"),
        to: checkDate(el("to").value, "종료일"),
        sup: opts.supplier && el("sup").value ? Number(el("sup").value) : null,
        part: opts.part && el("part").value ? Number(el("part").value) : null,
        res: opts.result ? el("res").value || null : null,
        cancel: opts.cancel ? el("cancel").checked : false
      };
    };
  }

  // ---------------------------------------------------------------------------
  // ① 입고·검사
  // ---------------------------------------------------------------------------
  var Inspect = {
    lotId: null, plan: null, defectInputs: [],

    init: function () {
      $("lot-recv").value = L.todayStr();
      $("lot-form").addEventListener("submit", function (ev) { ev.preventDefault(); Inspect.addLot(ev.submitter); });
      $("insp-form").addEventListener("submit", function (ev) { ev.preventDefault(); Inspect.save(); });
      selectable($("pending-table").tBodies[0], function (id) { Inspect.select(Number(id)); });
    },

    refresh: async function () {
      var parts = await DB.listParts();
      options($("lot-part"), [["", "— 부품 선택 —"]].concat(parts.map(function (p) {
        return [p.part_id, p.part_no + " " + p.name + " (" + p.supplier_name + ")"];
      })), true);
      var ins = await DB.listInspectors();
      options($("insp-inspector"), ins.map(function (i) { return [i.inspector_id, i.name]; }), true);
      var types = await DB.listDefectTypes();
      var grid = $("defect-grid");
      grid.innerHTML = types.map(function (d) {
        return '<label>' + esc(d.name) + '<input inputmode="numeric" value="0" data-id="' + d.defect_type_id +
          '" data-name="' + esc(d.name) + '"></label>';
      }).join("");
      Inspect.defectInputs = Array.prototype.slice.call(grid.querySelectorAll("input"));
      var lotNo = $("lot-no");
      if (!lotNo.value || /-$/.test(lotNo.value)) lotNo.value = await DB.nextLotNo();   // v1.1: 다음 번호 자동 제안
      await Inspect.loadPending();
    },

    loadPending: async function () {
      var rows = await DB.pendingLots();
      var tbody = $("pending-table").tBodies[0];
      if (!rows.length) { emptyRow(tbody, 6, "검사를 기다리는 로트가 없습니다. 위에서 로트를 등록하세요."); return; }
      tbody.innerHTML = rows.map(function (r) {
        return '<tr data-id="' + r.lot_id + '"' + (r.lot_id === Inspect.lotId ? ' class="selected"' : "") + ">" +
          '<td class="mono">' + esc(r.lot_no) + "</td><td>" + esc(r.part_no + " " + r.part_name) + "</td><td>" +
          esc(r.supplier_name) + "</td><td>" + esc(r.received_date) + '</td><td class="num">' + fmt(r.lot_qty) +
          '</td><td class="num">' + esc(aqlText(r.aql)) + "</td></tr>";
      }).join("");
    },

    addLot: function (btn) {
      return guard(btn, async function () {
        var part = $("lot-part").value;
        if (!part) throw new Error("부품을 선택하세요.");
        if (!$("lot-no").value.trim()) throw new Error("로트번호를 입력하세요.");
        var qty = toInt($("lot-qty").value, "입고수량");
        var recv = checkDate($("lot-recv").value, "입고일");
        var lotId = await DB.addLot($("lot-no").value, Number(part), recv, qty);
        toast("로트 " + $("lot-no").value.trim() + "을(를) 등록했습니다.", "ok");
        $("lot-qty").value = "";
        $("lot-no").value = await DB.nextLotNo();                                     // v1.1: 다음 번호 자동 제안
        Inspect.lotId = lotId;
        await Inspect.loadPending();
        await Inspect.select(lotId);
        var tr = $("pending-table").querySelector('tr[data-id="' + lotId + '"]');
        if (tr) tr.scrollIntoView({ block: "nearest" });
      });
    },

    select: function (lotId) {
      return guard(null, async function () {
        Inspect.lotId = lotId;
        $("insp-result").hidden = true;
        var tr = $("pending-table").querySelector('tr[data-id="' + lotId + '"]');
        var label = tr ? tr.cells[0].textContent + " — " + tr.cells[1].textContent : "로트 " + lotId;
        var plan = await DB.planForLot(lotId);
        if (Inspect.lotId !== lotId) return;   // 그 사이 다른 로트를 눌렀으면 무시
        Inspect.plan = plan;
        $("plan-empty").hidden = true;
        $("plan-box").hidden = false;
        $("plan-lot").textContent = "로트 " + label;
        $("plan-sev").className = "badge " + SEV_CLASS[plan.severity];
        $("plan-sev").textContent = plan.severity + " 검사";
        var box = $("plan-text");
        if (plan.blocked) {
          box.className = "plan blocked";
          box.innerHTML = "이 부품은 검사 중지 상태입니다.<br>⑤ 기준정보 탭에서 관리자가 '재개'해야 검사할 수 있습니다.";
          $("btn-save").disabled = true;
        } else {
          box.className = "plan";
          box.innerHTML = '<div>시료문자 <b>' + esc(plan.code_letter) + '</b> → <span class="big">샘플 ' + plan.n + "개</span> 뽑기" +
            (plan.full_inspection ? " <b>(전수검사)</b>" : "") + "</div>" +
            '<div class="acre"><span>합격판정개수 Ac = <b>' + plan.ac + '</b></span><span>불합격판정개수 Re = <b>' + plan.re + "</b></span></div>" +
            '<div class="rule">불량품이 ' + plan.ac + "개 이하면 합격, " + plan.re + "개 이상이면 불합격 (AQL " + aqlText(plan.aql) + ", 입고 " + fmt(plan.lot_qty) + "개)</div>";
          $("btn-save").disabled = false;
        }
        Inspect.defectInputs.forEach(function (i) { i.value = "0"; });
        $("insp-remark").value = "";
      });
    },

    save: function () {
      var btn = $("btn-save");
      return guard(btn, async function () {
        if (!Inspect.lotId || !Inspect.plan) throw new Error("먼저 왼쪽에서 로트를 선택하세요.");
        var inspector = $("insp-inspector").value;
        if (!inspector) throw new Error("검사원을 선택하세요. (⑤ 기준정보에서 추가)");
        var byName = {}, byId = {};
        Inspect.defectInputs.forEach(function (i) {
          var n = toInt(i.value, i.getAttribute("data-name"));
          byName[i.getAttribute("data-name")] = n;
          byId[i.getAttribute("data-id")] = n;
        });
        var v = L.validateDefects(byName, Inspect.plan.n);
        if (v.errors.length) throw new Error(v.errors.join(" "));
        if (!window.confirm("불량 " + v.total + "개 / 샘플 " + Inspect.plan.n + "개로 판정을 저장할까요?\n" +   // v1.1: 저장 전 확인
          "저장 후에는 '판정 취소'(사유 필수)로만 되돌릴 수 있습니다.")) return;
        var r = await DB.saveInspection(Inspect.lotId, Number(inspector), byId, $("insp-remark").value);
        var ok = r.result === "합격";
        var res = $("insp-result");
        res.className = "result " + (ok ? "ok" : "bad");
        var msg = "저장했습니다.";
        if (r.severity_before !== r.severity_after) {
          msg += " 이 판정으로 부품의 검사 엄격도가 '" + r.severity_before + "' → '" + r.severity_after + "'(으)로 바뀌었습니다.";
        }
        res.innerHTML = '<div class="verdict">' + esc(r.result) + "</div>" +
          '<div class="sub">불량 ' + r.defective_qty + "개 / 샘플 " + r.plan.n + "개 (Ac " + r.plan.ac + ", Re " + r.plan.re + ")<br>" + esc(msg) + "</div>";
        res.hidden = false;
        if (r.severity_before !== r.severity_after) toast(msg);
        Inspect.lotId = null;
        Inspect.plan = null;
        $("plan-box").hidden = true;
        $("plan-empty").hidden = false;
        await Inspect.loadPending();
      });
    }
  };

  // ---------------------------------------------------------------------------
  // ② 검사 이력
  // ---------------------------------------------------------------------------
  var History = {
    rows: [], shown: [],
    init: function () {
      History.filters = new FilterBar($("hist-filters"), {
        supplier: true, part: true, result: true, cancel: true, onSearch: History.search
      });
      selectable($("hist-table").tBodies[0], function () {});
      $("btn-cancel").addEventListener("click", function (ev) { History.cancel(ev.currentTarget); });
      $("btn-hist-csv").addEventListener("click", function () {
        downloadCsv(["검사일시", "로트번호", "협력사", "부품", "입고수량", "엄격도", "n / Ac / Re", "불량", "판정", "검사원", "비고 / 취소 사유"],
          History.shown, "검사이력.csv");
      });
    },
    refresh: async function () {
      await History.filters.reload();
      await History.search();
    },
    search: function (btn) {
      return guard(btn, async function () {
        var f = History.filters.values();
        var rows = await DB.searchInspections(f.from, f.to, f.sup, f.part, f.res, f.cancel);
        History.rows = rows;
        History.shown = [];
        var tbody = $("hist-table").tBodies[0];
        if (!rows.length) {
          emptyRow(tbody, 11, "조건에 맞는 검사가 없습니다.");
        } else {
          tbody.innerHTML = rows.map(function (r) {
            var note = r.is_cancelled ? "[취소] " + (r.cancel_reason || "") : (r.remark || "");
            var vals = [r.inspected_at.slice(0, 16), r.lot_no, r.supplier_name, r.part_no, fmt(r.lot_qty), r.severity,
              r.sample_qty + " / " + r.ac + " / " + r.re, r.defective_qty, r.result, r.inspector_name, note];
            History.shown.push(vals);
            var cls = r.is_cancelled ? "cancel" : (r.result === "불합격" ? "rej" : "");
            return '<tr data-id="' + r.inspection_id + '" class="' + cls + '">' +
              "<td>" + esc(vals[0]) + '</td><td class="mono">' + esc(vals[1]) + "</td><td>" + esc(vals[2]) + "</td><td>" +
              esc(vals[3]) + '</td><td class="num">' + esc(vals[4]) + "</td><td>" + esc(vals[5]) + '</td><td class="num">' +
              esc(vals[6]) + '</td><td class="num">' + esc(vals[7]) + "</td><td><b>" + esc(vals[8]) + "</b></td><td>" +
              esc(vals[9]) + '</td><td class="wrap">' + esc(vals[10]) + "</td></tr>";
          }).join("");
        }
        var nRej = rows.filter(function (r) { return r.result === "불합격" && !r.is_cancelled; }).length;
        $("hist-count").textContent = rows.length + "건 (불합격 " + nRej + "건)";
      });
    },
    cancel: function (btn) {
      var id = selectedId($("hist-table").tBodies[0]);
      if (!id) { toast("취소할 검사를 표에서 선택하세요."); return; }
      var row = History.rows.filter(function (r) { return String(r.inspection_id) === id; })[0];
      if (row && row.is_cancelled) { toast("이미 취소된 검사입니다.", "err"); return; }
      var reason = window.prompt("판정 취소 사유를 입력하세요. (필수)\n취소하면 로트가 '대기'로 돌아갑니다." +
        (row ? "\n\n대상: " + row.lot_no + " / " + row.result : ""));
      if (reason === null) return;
      return guard(btn, async function () {
        await DB.cancelInspection(Number(id), reason);
        toast("판정을 취소했습니다. ① 입고·검사 탭에서 다시 검사하세요.", "ok");
        await History.search();
      });
    }
  };

  // ---------------------------------------------------------------------------
  // ③ 불량 파레토
  // ---------------------------------------------------------------------------
  var Pareto = {
    result: [],
    init: function () {
      Pareto.filters = new FilterBar($("par-filters"), {
        supplier: true, part: true, onSearch: Pareto.search,
        csv: function () {
          downloadCsv(["순위", "불량유형", "수량", "비율", "누적 비율"], Pareto.result.map(function (r, k) {
            return [k + 1, r[0], r[1], L.pct(r[2]), L.pct(r[3])];
          }), "불량파레토.csv");
        }
      });
    },
    refresh: async function () {
      await Pareto.filters.reload();
      await Pareto.search();
    },
    search: function (btn) {
      return guard(btn, async function () {
        var f = Pareto.filters.values();
        var counts = await DB.defectCounts(f.from, f.to, f.sup, f.part);
        Pareto.result = L.pareto(counts);
        var tbody = $("par-table").tBodies[0];
        if (!Pareto.result.length) emptyRow(tbody, 5, "불량 기록이 없습니다.");
        else tbody.innerHTML = Pareto.result.map(function (r, k) {
          return '<tr><td class="num">' + (k + 1) + "</td><td>" + esc(r[0]) + '</td><td class="num">' + fmt(r[1]) +
            '</td><td class="num">' + L.pct(r[2]) + '</td><td class="num">' + L.pct(r[3]) + "</td></tr>";
        }).join("");
        $("par-chart").innerHTML = paretoSvg(Pareto.result, f.from + " ~ " + f.to);
      });
    }
  };

  function niceMax(v) {
    if (v <= 5) return 5;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }

  var HALO = 'stroke="#fff" stroke-width="3" paint-order="stroke"';

  /** 파레토 차트 (막대 = 수량, 꺾은선 = 누적 비율, 점선 = 80%) */
  function paretoSvg(rows, period) {
    var W = 720, H = 380, ml = 54, mr = 64, mt = 46, mb = 52;
    var pw = W - ml - mr, ph = H - mt - mb;
    var title = '<text x="' + W / 2 + '" y="22" text-anchor="middle" font-size="15" font-weight="700" fill="#1E3A5F">불량유형 파레토 (' + esc(period) + ")</text>";
    if (!rows.length) {
      return '<svg viewBox="0 0 ' + W + " " + H + '">' + title +
        '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" font-size="14" fill="#627084">선택한 조건에 불량 기록이 없습니다.</text></svg>';
    }
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return r[1]; })));
    var band = pw / rows.length, bw = Math.min(64, band * 0.62);
    var y = function (v) { return mt + ph - (v / max) * ph; };
    var y2 = function (p) { return mt + ph - (p / 105) * ph; };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="불량유형 파레토 차트">' + title;
    for (var t = 0; t <= 5; t++) {                                   // 왼쪽 축(수량) 눈금
      var v = max * t / 5, yy = y(v);
      s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + yy + '" y2="' + yy + '" stroke="#EEF1F5"/>';
      s += '<text x="' + (ml - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#627084">' + fmt(Math.round(v * 10) / 10) + "</text>";
    }
    [0, 20, 40, 60, 80, 100].forEach(function (p) {                  // 오른쪽 축(누적 %) 눈금
      s += '<text x="' + (W - mr + 8) + '" y="' + (y2(p) + 4) + '" font-size="11" fill="#627084">' + p + "%</text>";
    });
    s += '<text transform="translate(14 ' + (mt + ph / 2) + ') rotate(-90)" text-anchor="middle" font-size="11.5" fill="#627084">불량 수량</text>';
    s += '<text transform="translate(' + (W - 10) + " " + (mt + ph / 2) + ') rotate(90)" text-anchor="middle" font-size="11.5" fill="#627084">누적 비율 (%)</text>';
    var pts = [];
    rows.forEach(function (r, i) {
      var cx = ml + band * i + band / 2;
      s += '<rect x="' + (cx - bw / 2) + '" y="' + y(r[1]) + '" width="' + bw + '" height="' + (mt + ph - y(r[1])) + '" rx="3" fill="#1E3A5F"><title>' +
        esc(r[0]) + ": " + r[1] + "개</title></rect>";
      s += '<text x="' + cx + '" y="' + (y(r[1]) - 6) + '" text-anchor="middle" font-size="11" fill="#1E3A5F" font-weight="600" ' + HALO + '>' + fmt(r[1]) + "</text>";
      s += '<text x="' + cx + '" y="' + (mt + ph + 20) + '" text-anchor="middle" font-size="12" fill="#1B2430">' + esc(r[0]) + "</text>";
      pts.push([cx, y2(r[3] * 100), r[3], y(r[1]) - 6]);
    });
    s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y2(80) + '" y2="' + y2(80) + '" stroke="#C53030" stroke-dasharray="5 4" stroke-width="1.2"/>';
    s += '<text x="' + (W - mr - 4) + '" y="' + (y2(80) + 13) + '" text-anchor="end" font-size="10.5" fill="#C53030" ' + HALO + '>80% 기준</text>';
    s += '<polyline fill="none" stroke="#E8742A" stroke-width="2.2" points="' + pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ") + '"/>';
    pts.forEach(function (p) {
      var ly = Math.abs((p[1] - 9) - p[3]) < 14 ? p[1] + 18 : p[1] - 9;   // 막대 위 숫자와 겹치면 점 아래에
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="#fff" stroke="#E8742A" stroke-width="2"/>';
      s += '<text x="' + p[0] + '" y="' + ly + '" text-anchor="middle" font-size="10.5" font-weight="600" fill="#B4541A" ' + HALO + '>' + Math.round(p[2] * 100) + "%</text>";
    });
    s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (mt + ph) + '" y2="' + (mt + ph) + '" stroke="#94A3B8"/>';
    return s + "</svg>";
  }

  // ---------------------------------------------------------------------------
  // ④ 협력사 등급
  // ---------------------------------------------------------------------------
  var Grade = {
    rows: [],
    init: function () {
      Grade.filters = new FilterBar($("grade-filters"), {
        onSearch: Grade.search,
        csv: function () {
          downloadCsv(["순위", "협력사", "검사 로트", "불합격 로트", "로트 불합격률", "불량 ppm", "등급"], Grade.rows.map(function (r, k) {
            return [k + 1, r.name, r.n_lots, r.n_rejected, L.pct(r.lrr), r.ppm, r.grade];
          }), "협력사등급.csv");
        }
      });
    },
    refresh: function () { return Grade.search(); },
    search: function (btn) {
      return guard(btn, async function () {
        var f = Grade.filters.values();
        Grade.rows = await DB.supplierSummary(f.from, f.to);
        var tbody = $("grade-table").tBodies[0];
        if (!Grade.rows.length) emptyRow(tbody, 7, "협력사가 없습니다.");
        else tbody.innerHTML = Grade.rows.map(function (r, k) {
          return '<tr><td class="num">' + (k + 1) + "</td><td><b>" + esc(r.name) + '</b></td><td class="num">' + r.n_lots +
            '</td><td class="num">' + r.n_rejected + '</td><td class="num">' + L.pct(r.lrr) + '</td><td class="num">' + fmt(r.ppm) +
            "</td><td>" + gradeBadge(r.grade) + "</td></tr>";
        }).join("");
        var sev = await DB.severityOverview();
        $("sev-table").tBodies[0].innerHTML = sev.map(function (r) {
          return "<tr><td class=\"mono\">" + esc(r.part_no) + "</td><td>" + esc(r.name) + "</td><td>" + esc(r.supplier_name) +
            '</td><td class="num">' + esc(aqlText(r.aql)) + "</td><td>" + sevBadge(r.severity) + "</td></tr>";
        }).join("");
      });
    }
  };

  // ---------------------------------------------------------------------------
  // ⑤ 기준정보
  // ---------------------------------------------------------------------------
  var Master = {
    init: function () {
      options($("f-part").elements.aql, L.ALLOWED_AQLS.map(function (a) { return [a, aqlText(a)]; }));
      $("f-part").elements.aql.value = "1";
      selectable($("master-table").tBodies[0], function () {});
      Master.form("f-supplier", "협력사를 추가했습니다.", function (f) {
        var code = f.code.value.trim(), name = f.name.value.trim();
        if (!code || !name) throw new Error("코드와 이름은 꼭 입력하세요.");
        return DB.addSupplier(code, name, f.person.value.trim(), f.phone.value.trim());
      });
      Master.form("f-part", "부품을 추가했습니다.", function (f) {
        if (!f.part_no.value.trim() || !f.name.value.trim()) throw new Error("부품번호와 부품명은 꼭 입력하세요.");
        if (!f.supplier.value) throw new Error("협력사를 선택하세요.");
        return DB.addPart(f.part_no.value, f.name.value, Number(f.supplier.value), Number(f.aql.value));
      });
      Master.form("f-defect", "불량유형을 추가했습니다.", function (f) {
        if (!f.code.value.trim() || !f.name.value.trim()) throw new Error("코드와 이름은 꼭 입력하세요.");
        return DB.addDefectType(f.code.value, f.name.value);
      });
      Master.form("f-inspector", "검사원을 추가했습니다.", function (f) {
        if (!f.name.value.trim()) throw new Error("이름을 입력하세요.");
        return DB.addInspector(f.name.value);
      });
      $("btn-resume").addEventListener("click", function (ev) { Master.resume(ev.currentTarget); });
    },
    form: function (id, doneMsg, fn) {
      var form = $(id);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        guard(ev.submitter, async function () {
          await fn(form.elements);
          toast(doneMsg, "ok");
          Array.prototype.forEach.call(form.querySelectorAll("input"), function (i) { i.value = ""; });
          await Master.refresh();
        });
      });
    },
    refresh: async function () {
      var s = await DB.listSuppliers();
      options($("f-part").elements.supplier, [["", "— 선택 —"]].concat(s.map(function (x) { return [x.supplier_id, x.name]; })), true);
      var rows = await DB.severityOverview();
      $("master-table").tBodies[0].innerHTML = rows.map(function (r) {
        return '<tr data-id="' + r.part_id + '"><td class="mono">' + esc(r.part_no) + "</td><td>" + esc(r.name) + "</td><td>" +
          esc(r.supplier_name) + '</td><td class="num">' + esc(aqlText(r.aql)) + "</td><td>" + sevBadge(r.severity) + "</td></tr>";
      }).join("");
    },
    resume: function (btn) {
      var id = selectedId($("master-table").tBodies[0]);
      if (!id) { toast("재개할 부품을 표에서 선택하세요."); return; }
      if (!window.confirm("협력사 개선을 확인했습니까?\n재개하면 '까다로운 검사'부터 다시 시작합니다.")) return;
      return guard(btn, async function () {
        await DB.resumePart(Number(id));
        toast("검사를 재개했습니다. (까다로운 검사부터 시작)", "ok");
        await Master.refresh();
      });
    }
  };

  // ---------------------------------------------------------------------------
  // 탭 전환과 시작
  // ---------------------------------------------------------------------------
  var TABS = { inspect: Inspect, history: History, pareto: Pareto, grade: Grade, master: Master };

  function showTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".panel"), function (p) {
      p.classList.toggle("active", p.id === "tab-" + name);
    });
    guard(null, TABS[name].refresh);
  }

  function setConn(ok, text) {
    $("conn").className = "conn " + (ok ? "ok" : "bad");
    $("conn-text").textContent = text;
  }

  async function start() {
    Object.keys(TABS).forEach(function (k) { TABS[k].init(); });
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
      b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); });
    });
    var url = String(CFG.SUPABASE_URL || "").trim(), key = String(CFG.SUPABASE_KEY || "").trim();
    if (!/^https?:\/\//.test(url) || !key || /여기에/.test(key)) {
      $("setup").hidden = false;
      setConn(false, "연결 정보 없음");
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      setConn(false, "연결 실패");
      toast("Supabase 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.", "err");
      return;
    }
    DB.connect(url.replace(/\/+$/, ""), key);
    try {
      await DB.listSuppliers();
      setConn(true, "Supabase 연결됨");
      $("foot-db").textContent = "Supabase · " + url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    } catch (e) {
      setConn(false, "연결 실패");
      toast(errMsg(e), "err");
      return;
    }
    showTab("inspect");
  }

  start();
})();
