# Grove

**[English](README.md)** | **[한국어](README_ko.md)**

Git worktree 워크플로우를 위한 터미널 매니저. 여러 worktree의 터미널을 나란히 실행하세요.

## 주요 기능

- **Worktree 관리** — 사이드바에서 디렉토리 추가, 브랜치별 worktree 생성 및 관리
- **멀티 세션 터미널** — 디렉토리마다 여러 터미널 세션을 탭처럼 관리
- **분할 패널** — 세션 내에서 터미널을 수직/수평으로 분할
- **워크스페이스 분할** — 세션을 드래그하여 여러 세션을 동시에 표시
- **브로드캐스트 모드** — 한 번 입력으로 모든 터미널에 동시 전송
- **Git 상태 표시** — 브랜치명, 변경 파일 수, ahead/behind 한눈에 확인
- **터미널 검색** — `Cmd+F`로 터미널 출력에서 텍스트 검색
- **커맨드 팔레트** — `Cmd+P`로 모든 기능에 빠르게 접근
- **파일 경로 클릭** — `파일:줄:열` 패턴 클릭 시 VS Code에서 열기
- **URL 클릭** — 터미널 출력의 URL 클릭 시 브라우저에서 열기
- **세션 복제** — 클릭 한 번으로 세션 복제
- **드래그 앤 드롭 정렬** — 세션과 디렉토리를 드래그하여 순서 변경
- **스니펫** — 자주 사용하는 명령어 저장 및 실행
- **커스터마이징** — 폰트, 테마 (Catppuccin, Dracula, Nord 등) 설정
- **세션 자동 복원** — 앱 재시작 시 이전 세션 자동 복원
- **자동 업데이트** — 새 버전 출시 시 알림 및 업데이트

## 키보드 단축키

| 단축키 | 기능 |
|--------|------|
| `Cmd+P` | 커맨드 팔레트 |
| `Cmd+T` | 최근 닫은 세션 목록 |
| `Cmd+W` | 현재 세션 닫기 |
| `Cmd+F` | 터미널 내 검색 |
| `Cmd+1-9` | n번째 세션으로 전환 |

## 다운로드

| OS | 아키텍처 | 다운로드 |
|----|----------|----------|
| macOS | Apple Silicon (M1/M2/M3/M4) | [Grove-0.1.7-arm64.dmg](https://github.com/djatjdwns28/grove/releases/download/v0.1.7/Grove-0.1.7-arm64.dmg) |
| macOS | Intel | [Grove-0.1.7.dmg](https://github.com/djatjdwns28/grove/releases/download/v0.1.7/Grove-0.1.7.dmg) |
| Windows | x64 | [Grove-Setup-0.1.7.exe](https://github.com/djatjdwns28/grove/releases/download/v0.1.7/Grove-Setup-0.1.7.exe) |
| Linux | x64 | [Grove-0.1.7.AppImage](https://github.com/djatjdwns28/grove/releases/download/v0.1.7/Grove-0.1.7.AppImage) |

전체 파일은 [Releases](https://github.com/djatjdwns28/grove/releases/latest) 페이지에서 확인하세요.

### macOS — "악성 코드 확인 불가" 경고

Apple Developer 인증서로 서명되지 않은 앱이라 처음 실행 시 경고가 표시됩니다. 다음 방법으로 열 수 있습니다:

1. 앱을 실행합니다 (경고 창이 나타남)
2. **Apple 메뉴 → 시스템 설정 → 개인정보 보호 및 보안** 으로 이동
3. **보안** 섹션까지 아래로 스크롤
4. **그래도 열기** 클릭 (경고 발생 후 약 1시간 동안 사용 가능)
5. **열기** 클릭
6. 로그인 암호를 입력하고 **확인** 클릭

최초 한 번만 하면 됩니다. 이후에는 정상적으로 실행됩니다.

## 개발

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 배포용 빌드
npm run dist
```

### 요구사항

- Node.js 18+
- macOS / Windows / Linux

## 기술 스택

- [Electron](https://www.electronjs.org/) — 데스크톱 프레임워크
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) — UI
- [xterm.js](https://xtermjs.org/) — 터미널 에뮬레이터
- [node-pty](https://github.com/nicedoc/node-pty) — 의사 터미널
- [Zustand](https://github.com/pmndrs/zustand) — 상태 관리

## 라이선스

[MIT](LICENSE) - Copyright (c) 2026 djatjdwns28
