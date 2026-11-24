# rules.md — AI 작업 규칙

이 프로젝트에서 AI(코딩 도구)는 항상 아래 규칙을 지킨다.

## 작업 방식
1. 작업을 시작할 때마다 docs/prd.md, docs/design.md, docs/tasks.md, docs/rules.md를 먼저 읽을 것
2. 작업은 tasks.md에서 한 번에 하나만 하고, 끝나면 [x]로 표시한 뒤 멈출 것
3. [고정] 표시가 된 부분은 내 허락 없이 바꾸지 말 것. 꼭 바꿔야 하면 이유를 먼저 설명하고 허락을 받을 것
4. 새 프로그램 부품(라이브러리)을 설치하기 전에는 먼저 물어볼 것
5. 답변과 설명은 비개발자도 이해할 수 있는 한국어로 쓸 것
6. 오류가 나면 코드를 고치기 전에 원인 후보부터 설명할 것 (프롬프트 3-9)
7. 코드를 고친 뒤에는 반드시 `python test_logic.py`를 다시 돌려 통과를 확인할 것

## 고치면 안 되는 부분
- [고정] logic.py의 계산 규칙(prd.md 3.4 C1~C11)과 상태 전이(3.3)
- [고정] logic.py는 tkinter·sqlite3를 import하지 않는다 (화면 없이 시험할 수 있게)
- [고정] 화면(ui.py)은 logic.py 함수를 불러다 쓰기만 하고 계산을 직접 하지 않는다
- [고정] 테이블 이름·컬럼 이름은 design.md 2장과 같게 한다

## 기술 조건
- [고정] Python + SQLite + Tkinter(차트 matplotlib)만 사용. 클라우드·웹 서버·외부 DB·Streamlit 사용 금지. 인터넷 없이 동작
- [고정] DB는 exe와 같은 폴더의 `data/app.db`. 경로는 exe(또는 main.py) 위치 기준으로 계산. 파일이 없으면 첫 실행 때 테이블과 AQL 기준표를 만든다
- [고정] exe는 `pyinstaller --onefile --noconsole` 로 만들고 DB를 exe 안에 넣지 않는다
- 폴더 경로는 영문(예: C:\ie_app), OneDrive 폴더 사용 금지, python.org Python의 venv 사용

## PWA 작업 규칙
- 기존 기능 · DB 코드는 수정하지 않는다
- 오프라인 캐시는 넣지 않는다
