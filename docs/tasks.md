# tasks.md — 작업 순서표

순서: 데이터베이스 → 핵심 기능 → DB 연결 기능 → 샘플 데이터 넣기 → 화면 → 배포. (3-5 점검: 샘플 데이터가 save_inspection()을 써야 해서 DB 연결 기능 뒤로 옮김) 한 작업은 10~20분 크기.
표시: [ ] 할 일 / [x] 완료 / (직접) = Windows PC에서 사용자가 직접 확인해야 하는 작업

## 1. 데이터베이스
- [x] 1.1 db.py: get_db_path() — exe/main.py 위치 기준 data/app.db 경로
- [x] 1.2 db.py: init_db() — design.md 2장의 9개 테이블 생성 (CHECK, UNIQUE, 부분 인덱스 포함)
- [x] 1.3 logic.py: code_letter(), build_plan_rows() — AQL 표 1·2-A·2-B 생성
- [x] 1.4 db.py: AQL 기준표 2개를 첫 실행 때 채우기

## 2. 핵심 기능 (logic.py)
- [x] 2.1 sampling_plan(), judge(), validate_defects(), validate_dates()
- [x] 2.2 severity_state() — 보통/까다로운/중지 전환
- [x] 2.3 supplier_stats(), rank_suppliers(), pareto()
- [x] 2.4 test_logic.py — 정상·예외 시험 사례 작성 후 전부 통과 (프롬프트 3-7)

## 3. DB 연결 기능 (db.py)
- [x] 3.1 add_lot(), plan_for_lot(), current_severity()
- [x] 3.2 save_inspection() — 검증 → 판정 → 로트 상태 변경을 한 트랜잭션으로
- [x] 3.3 cancel_inspection(), resume_part()
- [x] 3.4 search_inspections(), defect_counts(), supplier_summary(), severity_overview()
- [x] 3.5 db 기능 시험을 test_logic.py에 추가 (임시 DB 파일로)

## 4. 샘플 데이터
- [x] 4.1 seed_sample.py: 협력사 4, 부품 8, 불량유형 6, 검사원 2
- [x] 4.2 seed_sample.py: 최근 4개월 로트 약 120건과 검사 결과 (엄격도 전환이 일어나는 협력사 포함)
- [x] 4.3 건수 확인: 로트 수 = 검사 수 + 대기 수

## 5. 화면 (ui.py)
- [x] 5.1 탭 틀과 main.py
- [x] 5.2 ① 입고·검사 탭
- [x] 5.3 ② 검사 이력 탭 (판정 취소, CSV 저장)
- [x] 5.4 ③ 불량 파레토 탭 (matplotlib, CSV 저장)
- [x] 5.5 ④ 협력사 등급 탭 (CSV 저장)
- [x] 5.6 ⑤ 기준정보 탭 (재개 포함)
- [ ] 5.7 (직접) Windows에서 python main.py 실행해 탭 5개 확인, 화면 캡처

## 6. 배포
- [x] 6.1 requirements.txt, build_exe.bat, README.txt
- [ ] 6.2 (직접) pyinstaller로 app.exe 만들기
- [ ] 6.3 (직접) Python 없는 다른 PC에서 실행 → 입력 → 재실행 시 데이터 유지 확인
- [ ] 6.4 (직접) 사용자 의견 2건 받기 → prd.md·tasks.md 먼저 고치고 반영 → CHANGELOG.md

## 7. 의견 반영 (v1.1, 프롬프트 3-12)
- [x] 7.1 prd.md·tasks.md에 의견 2건 먼저 반영
- [x] 7.2 db.py: next_lot_no() — 다음 로트번호 제안 / ui.py: 로트번호 칸에 자동으로 채우기
- [x] 7.3 ui.py: 판정 저장 전 확인창 (불량 수·샘플 수 표시)
- [x] 7.4 test_logic.py 다시 실행 → 19건 통과 확인, CHANGELOG.md v1.1

