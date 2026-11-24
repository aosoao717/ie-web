# design.md — 설계서

- 버전: v0.2 (prd.md v0.2 기준) / 작성 도구: Claude (프롬프트 3-4, 3-5 점검 후 수정)

## 1. 파일 구성
```
ie_app/
├─ main.py            프로그램 시작: DB 확인(없으면 생성) → 화면 띄우기
├─ db.py              DB 경로·연결, 테이블 생성, AQL 기준표 채우기, 모든 SQL
├─ logic.py           핵심 계산 [고정] — tkinter·sqlite3를 import하지 않는 순수 함수
├─ ui.py              Tkinter 화면 (탭 5개), 차트는 matplotlib
├─ seed_sample.py     시연용 샘플 데이터 생성 (협력사 4, 부품 8, 로트 약 120)
├─ test_logic.py      핵심 기능 시험 (python test_logic.py 로 실행)
├─ requirements.txt   matplotlib, pyinstaller
├─ build_exe.bat      exe 만들기 명령
├─ data/app.db        데이터 (exe 옆)
└─ docs/              prd.md, design.md, tasks.md, rules.md, CHANGELOG.md
```
- 의존 방향: ui.py → db.py, logic.py / db.py → logic.py (AQL 표 생성) / logic.py → (없음)

## 2. 데이터 표 (SQLite)

| 테이블 | 컬럼 (PK · FK) | 비고 |
|---|---|---|
| supplier | supplier_id PK, code UNIQUE, name, contact_person, phone | 협력사 |
| part | part_id PK, part_no UNIQUE, name, supplier_id FK→supplier, aql, resumed_at | AQL ∈ {0.65, 1.0, 1.5, 2.5, 4.0} |
| defect_type | defect_type_id PK, code UNIQUE, name | 불량유형 |
| inspector | inspector_id PK, name UNIQUE | 검사원 |
| lot | lot_id PK, lot_no UNIQUE, part_id FK→part, received_date, lot_qty, status | lot_qty 2~35000, status ∈ {대기, 합격, 불합격} |
| inspection | inspection_id PK, lot_id FK→lot, inspector_id FK→inspector, inspected_at, severity(보통/까다로운만 — 중지면 검사 불가), code_letter, sample_qty, ac, re, defective_qty, result, remark, is_cancelled, cancel_reason, cancelled_at | 취소되지 않은 검사는 로트당 1건 (부분 UNIQUE 인덱스) |
| inspection_defect | inspection_id FK, defect_type_id FK, qty — PK(inspection_id, defect_type_id) | 검사 N:M 불량유형 연결 표 |
| aql_code_letter | code_letter PK, lot_min, lot_max, sample_size | KS Q ISO 2859-1 표 1, 검사수준 II |
| aql_plan | code_letter FK, aql, severity, plan_letter, sample_size, ac, re — PK(code_letter, aql, severity) | 표 2-A/2-B, 화살표 적용 결과 |

관계: supplier 1:N part, part 1:N lot, lot 1:N inspection, inspection 1:N inspection_defect, defect_type 1:N inspection_defect, inspector 1:N inspection, aql_code_letter 1:N aql_plan

정규화: 이름은 각 마스터 표에만 저장(3NF). inspection의 severity·code_letter·sample_qty·ac·re는 검사 당시 판정 근거를 보존하는 **이력 스냅샷**으로 의도적으로 저장한다. defective_qty는 inspection_defect 합과 같아야 하며 저장 시 logic.validate_defects로 확인한다.

## 3. 핵심 기능의 입력 → 출력 (logic.py)

| 함수 | 입력 | 출력 | prd 규칙 |
|---|---|---|---|
| code_letter(lot_qty) | 입고수량 | (시료문자, 표1 샘플 수) — 범위 밖이면 ValueError | C1, 3.2-2 |
| build_plan_rows() | 없음 | aql_code_letter·aql_plan에 넣을 행 목록 | C2 |
| sampling_plan(lot_qty, aql, severity) | 입고수량, AQL, '보통'/'까다로운' | {code_letter, plan_letter, n, ac, re, full_inspection} | C1, C2, 3.2-3 |
| validate_dates(received, inspected, today) | 입고일, 검사일, 오늘 | 오류 목록 | 3.2-5 |
| validate_defects(defects, sample_qty) | {불량유형: 수량}, n | (불량품수, 오류 목록) | 3.2-4 |
| judge(defective, ac, re) | 불량품수, Ac, Re | '합격' / '불합격' | C3 |
| severity_state(results, start) | 판정 목록(시간순), 시작 상태 | (현재 상태, 전환 기록) | 3.3(2), C4 |
| supplier_stats(n_lots, n_rejected, sum_def, sum_sample) | 집계값 | {lrr, ppm, grade} | C5~C8 |
| rank_suppliers(rows) | 협력사별 통계 목록 | 정렬된 목록 | C9 |
| pareto(counts) | {불량유형명: 수량} | [(유형, 수량, 비율, 누적비율)] | C10 |

db.py 주요 함수: get_db_path(), connect(), init_db(), next_lot_no(), add_lot(), current_severity(part_id), plan_for_lot(lot_id), save_inspection(...), cancel_inspection(...), resume_part(...), search_inspections(...), defect_counts(...), supplier_summary(...)

## 4. 화면 구성 (ui.py, ttk.Notebook 탭 5개)
| 탭 | 구성 |
|---|---|
| ① 입고·검사 | 위: 로트 등록 폼(로트번호 — 다음 번호 자동 제안, 부품, 입고일, 입고수량) / 왼쪽: 대기 로트 목록 / 오른쪽: 선택 로트의 샘플링 계획(엄격도, 시료문자, n, Ac, Re) + 불량유형별 수량 입력 + 비고 + [판정 저장] → 확인창 → 결과 표시 |
| ② 검사 이력 | 필터(기간, 협력사, 부품, 판정, 취소 포함) / 결과 표 / [판정 취소] (사유 입력) / [CSV 저장] |
| ③ 불량 파레토 | 필터(기간, 협력사, 부품) / matplotlib 막대 + 누적 비율선 + 80% 선 / 표 / [CSV 저장] |
| ④ 협력사 등급 | 기간(기본 최근 3개월) / 협력사 랭킹 표(검사 로트, 불합격, LRR, ppm, 등급) / 부품별 엄격도 현황 표 / [CSV 저장] |
| ⑤ 기준정보 | 협력사·부품(AQL)·불량유형·검사원 추가 / 중지 부품 [재개] |

이동 순서: 검사원 ① → (SQE) ② → ③ → (관리자) ④ → ②/⑤
