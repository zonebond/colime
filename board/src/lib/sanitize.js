import DOMPurify from 'dompurify'

export default function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['style'] })
}
