const ENTRY_GUARD_ID = 'fanxiulu-vue-entry-guard'

/** 只补充小屏登录页的可滚动性；不读取、映射或改写任何游戏文本。 */
export function applyLegacyFrameSafeguards(frame: HTMLIFrameElement): () => void {
  let documentRef: Document
  try {
    const candidate = frame.contentDocument ?? frame.contentWindow?.document
    if (!candidate?.head) return () => undefined
    documentRef = candidate
  } catch {
    return () => undefined
  }

  if (!documentRef.getElementById(ENTRY_GUARD_ID)) {
    const style = documentRef.createElement('style')
    style.id = ENTRY_GUARD_ID
    style.textContent = `
      #screen-login.active {
        align-items: flex-start !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
      }
      #screen-login .login-card {
        margin-block: auto;
      }
      #login-news-v160 .v16-news-list {
        max-height: min(240px, 32dvh);
        overflow-y: auto;
        overscroll-behavior: contain;
      }
    `
    documentRef.head.appendChild(style)
  }

  return () => undefined
}

