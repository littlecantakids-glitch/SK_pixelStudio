import { useOpenStore } from '../store/openStore'

/** 파일 열기 관련 동작을 노출하는 훅 (메뉴/최근 파일 등에서 사용) */
export function useOpenFile() {
  const { triggerPicker, openFiles, openRecent, recentFiles, clearRecent } =
    useOpenStore()
  return { triggerPicker, openFiles, openRecent, recentFiles, clearRecent }
}
