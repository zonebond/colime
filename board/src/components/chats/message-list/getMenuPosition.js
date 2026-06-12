export default function getMenuPosition(rect, menuWidth, menuHeight) {
  const viewportPadding = 12
  const gap = 4
  const left = Math.max(
    viewportPadding,
    Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
  )
  const openUp = rect.bottom + gap + menuHeight > window.innerHeight - viewportPadding
    && rect.top - gap - menuHeight >= viewportPadding

  return {
    left,
    top: openUp
      ? rect.top - gap - menuHeight
      : Math.min(rect.bottom + gap, window.innerHeight - menuHeight - viewportPadding),
    side: openUp ? 'top' : 'bottom',
  }
}
