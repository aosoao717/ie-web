# 수입검사 및 협력사 품질 평가 — 클라우드 버전

데스크톱 앱(Python + SQLite + Tkinter, app.exe)을 **GitHub + Vercel + Supabase** 웹 앱으로 옮긴 버전입니다.
인터넷 주소만 있으면 어느 PC나 휴대폰에서도 같은 데이터를 보고 입력할 수 있습니다.

| 역할 | 데스크톱 앱 | 클라우드 버전 |
| --- | --- | --- |
| 화면 | Tkinter (`ui.py`) | 웹 페이지 (`index.html`, `css/style.css`, `js/ui.js`) |
| 핵심 계산 [고정] | `logic.py` | `js/logic.js` (같은 규칙을 그대로 옮김) |
| DB 연결 | `db.py` → `data/app.db` | `js/db.js` → **Supabase**(클라우드 PostgreSQL) |
| DB 구조 | SQLite 9개 테이블 | `supabase/01_schema.sql` (같은 9개 테이블 + 조회용 뷰 4개 + 저장·취소 함수 2개) |
| 샘플 데이터 | `app.db` 안에 포함 | `supabase/02_sample_data.sql` (app.db 데이터를 그대로 옮김) |
| 배포 | PyInstaller → app.exe | GitHub에 올리기 → **Vercel**이 자동으로 웹 주소 발급 |
| 시험 | `test_logic.py` | `tests/test_logic.js` (같은 시험 사례) |

---

## 전체 순서 한눈에 보기

1. GitHub 가입
2. Supabase 프로젝트 만들고 SQL 2개 실행 (DB 만들기)
3. `js/config.js`에 Supabase 주소·키 넣기 → 내 PC에서 먼저 확인
4. GitHub 저장소에 파일 올리기
5. Vercel에서 GitHub 저장소를 불러와 배포 → **나온 주소를 제출**

처음이면 40분~1시간 정도 걸립니다. 화면 이름은 사이트 업데이트에 따라 조금 다를 수 있습니다.

---

## 0단계. 압축 풀기

1. 받은 `ie_web.zip`을 마우스 오른쪽 버튼 → **압축 풀기** → `C:\ie_web` 같은 곳에 풉니다.
2. `C:\ie_web` 폴더를 열었을 때 `index.html`, `css`, `js`, `supabase`, `tests`, `README.md`가 **바로 보여야** 합니다.

## 1단계. GitHub 가입

1. https://github.com 접속 → 오른쪽 위 **Sign up**.
2. 이메일, 비밀번호, 사용자 이름을 넣고 이메일 인증까지 마칩니다.

> Supabase와 Vercel은 GitHub 계정으로 바로 로그인할 수 있어서 GitHub부터 만듭니다.

## 2단계. Supabase에 DB 만들기

### 2-1. 프로젝트 만들기
1. https://supabase.com 접속 → **Start your project** → **Continue with GitHub** → 승인(Authorize).
2. 처음이면 조직(Organization) 이름을 묻습니다. 아무 이름이나 넣고 **Free** 플랜을 고릅니다.
3. **New project**를 누르고 다음처럼 입력합니다.
   - Project name: `ie-app` (아무거나)
   - Database Password: **Generate a password** 누르고 메모장에 따로 적어 두기
   - Region: **Northeast Asia (Seoul)**
4. **Create new project** → 1~2분 기다립니다. (준비 중 표시가 사라질 때까지)

### 2-2. 테이블 만들기 (SQL 실행)
1. 왼쪽 메뉴에서 **SQL Editor**(`>_` 모양)를 누릅니다.
2. **+ New query**(또는 빈 편집창)를 엽니다.
3. 내 PC의 `C:\ie_web\supabase\01_schema.sql`을 **마우스 오른쪽 → 연결 프로그램 → 메모장**으로 엽니다.
4. 메모장에서 **Ctrl + A**(전체 선택) → **Ctrl + C**(복사) → Supabase 편집창에 **Ctrl + V**(붙여넣기).
5. 오른쪽 아래 **Run** 버튼(또는 Ctrl + Enter).
   - "destructive operation" 같은 경고 창이 뜨면 **Run this query**를 누르세요. (규칙을 다시 만들 때 쓰는 `drop policy if exists` 때문이고, 데이터를 지우지 않습니다.)
   - 아래에 **Success. No rows returned**가 나오면 성공입니다.
6. 다시 **+ New query** → 이번엔 `02_sample_data.sql`을 같은 방법으로 붙여넣고 **Run**. (샘플 데이터 119로트가 들어갑니다)
7. 확인: 왼쪽 메뉴 **Table Editor**에 `supplier`, `part`, `lot`, `inspection` 등 9개 표가 보이고, `lot` 표에 119행이 있으면 됩니다.

### 2-3. 연결 주소와 키 복사하기
1. 프로젝트 화면 위쪽의 **Connect** 버튼을 누르거나, 왼쪽 아래 톱니바퀴 **Project Settings**로 갑니다.
2. 두 가지 값을 메모장에 복사해 둡니다.
   - **Project URL**: `https://영문자.supabase.co` 형태 (Settings → **Data API**에도 있음)
   - **Publishable key**: `sb_publishable_`로 시작 (Settings → **API Keys**)
     - 예전 방식의 **anon public** 키(`eyJ`로 시작)도 아직 동작하지만 2026년 말에 없어질 예정이라, Publishable key를 쓰세요.
   - ⚠️ **secret key**(`sb_secret_`)나 **service_role** 키는 절대 쓰지 마세요. 웹에 공개되면 안 되는 키입니다.

## 3단계. `js/config.js`에 붙여넣고 내 PC에서 확인

1. `C:\ie_web\js\config.js`를 메모장으로 엽니다.
2. 따옴표 안의 글자만 바꿉니다. 따옴표(`"`)와 쉼표(`,`)는 지우면 안 됩니다.
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://abcdefghijkl.supabase.co",
     SUPABASE_KEY: "sb_publishable_xxxxxxxxxxxxxxxx"
   };
   ```
3. **Ctrl + S**로 저장합니다.
4. `C:\ie_web\index.html`을 더블클릭해서 크롬이나 엣지로 엽니다.
5. 오른쪽 위에 초록 점과 **Supabase 연결됨**이 보이고, ② 검사 대기 로트에 4개 로트가 보이면 성공입니다.
   - 노란 상자 "연결 정보가 아직 없습니다"가 뜨면 → config.js를 저장했는지 다시 확인
   - "DB에 표가 없습니다"가 뜨면 → 2-2를 다시 실행
   - "키가 올바르지 않습니다"가 뜨면 → 2-3에서 키를 다시 복사

## 4단계. GitHub에 파일 올리기

1. https://github.com 로그인 → 오른쪽 위 **+** → **New repository**.
2. Repository name: `ie-web` → **Public** 선택 → **Create repository**.
3. 새 저장소 화면에서 **uploading an existing file** 링크를 누릅니다.
4. `C:\ie_web` 폴더를 열고, 그 **안에 있는 것 전부**(`index.html`, `README.md`, `css`, `js`, `supabase`, `tests`)를 마우스로 선택해서 브라우저 창에 끌어다 놓습니다.
   - `ie_web` 폴더 자체를 끌어다 놓으면 안 됩니다. 폴더 **안의 내용물**을 끌어다 놓아야 합니다.
5. 올라가는 목록이 다 뜨면 아래 **Commit changes**를 누릅니다.
6. 확인: 저장소 첫 화면에 `index.html`이 **바로** 보여야 합니다. `ie_web` 폴더 안에 들어가 있으면 다시 올리세요.

> config.js의 Publishable key는 원래 웹에 공개되는 용도라서 Public 저장소에 올라가도 괜찮습니다.

## 5단계. Vercel로 배포 → 주소 받기

1. https://vercel.com 접속 → **Sign Up** → **Hobby**(무료) 선택 → 이름 입력 → **Continue with GitHub**.
2. 대시보드에서 **Add New…** → **Project**.
3. **Import Git Repository** 목록에서 `ie-web` 옆의 **Import**를 누릅니다.
   - 목록에 없으면 **Adjust GitHub App Permissions**(또는 Install)을 눌러 `ie-web` 저장소 접근을 허락합니다.
4. 설정 화면에서
   - Framework Preset: **Other**
   - Root Directory: `./` (그대로)
   - 나머지는 건드리지 않고 **Deploy**.
5. 30초쯤 뒤 축하 화면이 나오면 **Continue to Dashboard** → **Domains**에 있는 주소(예: `https://ie-web-abcd.vercel.app`)를 누릅니다.
6. 웹 앱이 열리고 **Supabase 연결됨**이 보이면 끝입니다. **이 주소가 제출할 Vercel 주소**입니다.
   - 휴대폰이나 다른 PC(시크릿 창)에서도 열어 보세요. 같은 데이터가 보여야 합니다.

### 나중에 고치고 싶을 때
GitHub 저장소에서 파일을 열고 ✏️(연필) → 수정 → **Commit changes**를 누르면 Vercel이 1분 안에 자동으로 다시 배포합니다.

---

## 제출 전에 꼭 확인할 것

- [ ] Vercel 주소로 열었을 때 **Supabase 연결됨**(초록 점)이 뜬다
- [ ] 로트 등록 → 로트 선택 → 불량 입력 → **판정 저장**이 된다
- [ ] 새로고침하거나 다른 기기에서 열어도 방금 입력한 데이터가 남아 있다
- [ ] ⚠️ **Supabase 무료 프로젝트는 7일 동안 아무도 안 쓰면 일시정지됩니다.** 채점 기간 전에 Supabase 대시보드에 들어가 프로젝트가 멈춰 있으면 **Resume project**를 눌러 두세요. (멈춰도 데이터는 그대로 남아 있습니다) 웹 주소를 가끔 열어 두면 정지되지 않습니다.

## 알아 둘 점

- **로그인이 없습니다.** 데스크톱 앱처럼 주소만 알면 누구나 보고 입력할 수 있습니다. (삭제는 막아 두었습니다.)
  수업 과제용으로는 괜찮지만, 실제 회사에서 쓰려면 Supabase 로그인(Auth)을 붙여야 합니다.
- 판정 저장과 판정 취소는 DB 함수(`save_inspection`, `cancel_inspection`)가 처리합니다.
  검사 기록·불량내역·로트 상태가 **전부 저장되거나 전부 취소**되므로, 중간에 인터넷이 끊겨도 데이터가 반쯤만 저장되지 않습니다.
- [고정] 규칙 2(불량품수 ≤ Ac → 합격)는 `logic.js`뿐 아니라 DB의 CHECK 제약으로도 한 번 더 지킵니다.
- 시각(검사일시, 재개 일시)은 사용하는 PC·휴대폰의 현지 시간(한국 시간)으로 저장됩니다.
- CSV 저장은 브라우저의 **다운로드** 폴더로 내려받습니다.

## 핵심 계산 시험 (선택)

Node.js가 설치된 PC라면 `C:\ie_web` 폴더에서 명령 프롬프트를 열고 다음을 실행합니다.

```
node tests/test_logic.js
```

데스크톱 앱 test_logic.py의 핵심 계산 사례 14개 + AQL 기준표 행 수 확인 1개, 모두 15개가 "통과"로 나오면 됩니다.
