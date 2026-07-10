# Pixel Studio — 전문 이미지 편집기 UI

Adobe Photoshop 스타일의 데스크톱 이미지 편집기 UI를 웹으로 구현한 React + TypeScript 프로젝트입니다.
(Adobe/Photoshop 상표·로고·아이콘은 사용하지 않았으며, 레이아웃·밀도·색상감·패널 구조만 레퍼런스처럼 구성했습니다.)

## 실행 방법

install이 가능한 환경(예: 집)에서:

```bash
npm install
npm run dev
```

터미널에 표시되는 주소(기본 `http://localhost:5173`)를 브라우저에서 엽니다.
1920×1080 데스크톱 화면 기준으로 디자인되어 있어, 브라우저를 전체 화면으로 보는 것을 권장합니다.

프로덕션 빌드:

```bash
npm run build      # dist/ 생성
npm run preview    # 빌드 결과 미리보기
```

## 기술 스택

- **React 18 + TypeScript**
- **Vite** (빌드/개발 서버)
- **lucide-react** (아이콘)
- **일반 CSS** (`src/styles/editor.css`) — 클래스 네이밍은 BEM 스타일

## 폴더 구조

```
src/
  components/
    AppShell.tsx        # 전체 레이아웃 조립
    TopMenuBar.tsx      # 상단 메뉴바 (파일/편집/... 11개)
    MenuDropdown.tsx    # 메뉴 드롭다운 (단축키 우측 정렬)
    OptionsBar.tsx      # 도구 옵션바
    LeftToolbar.tsx     # 좌측 세로 툴바 (11개 툴 + 색상 스와치)
    Workspace.tsx       # 캔버스 + 우측 패널 컨테이너
    CanvasArea.tsx      # 작업영역 (눈금자/스크롤바/상태바/AI바)
    Ruler.tsx           # 가로·세로 눈금자
    FloatingAIBar.tsx   # 캔버스 하단 플로팅 AI 바
    RightPanels.tsx     # 우측 패널 스택
    ColorPanel.tsx      # 색상 (HSV 필드 + Hue 슬라이더)
    PropertiesPanel.tsx # 속성/조정/라이브러리 탭
    ChannelsPanel.tsx   # 채널 (RGB/빨강/녹색/파랑)
    LayersPanel.tsx     # 레이어 패널
    TimelinePanel.tsx   # 하단 타임라인
  styles/
    editor.css          # 전체 스타일
  types.ts              # EditorState 등 타입 정의
  state.tsx             # Context + useReducer 전역 상태
  menuData.ts           # 메뉴/드롭다운 데이터
  main.tsx              # 진입점
```

## 구현된 인터랙션

1. **메뉴 드롭다운** — 클릭 열기/닫기, 열린 상태에서 다른 메뉴로 hover 전환, 바깥 클릭·ESC로 닫기 (초기엔 "파일" 메뉴가 열린 상태)
2. **좌측 툴 선택** — 클릭 시 활성 툴 하이라이트, 옵션바 도구 이름 연동
3. **우측 패널 탭 전환** — 속성/조정/라이브러리
4. **레이어 선택** — 클릭 선택 표시, 눈 아이콘으로 표시/숨김 토글
5. **색상 변경** — HSV 필드 클릭 + Hue 슬라이더로 전경색 변경, 툴바 스와치 반영
6. **줌 표시** — 상태바에 현재 배율(%) 표시
7. **타임라인** — "비디오 타임라인 만들기" → 트랙 표시, 재생/정지 버튼 상태 전환
8. **반응형** — 창 크기 변경 시 눈금자가 스테이지 크기에 맞춰 갱신, 3분할 레이아웃 유지

## 참고

- 전역 상태 스키마는 요청하신 `EditorState` 타입을 그대로 사용합니다 (`src/types.ts`).
- 색상 테마 토큰은 `editor.css` 상단 `:root`에 정의되어 있어 한 곳에서 조정 가능합니다.
