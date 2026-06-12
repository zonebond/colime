import styles from './WelcomeLogo.module.css'

// Pixel-art letter definitions (4-wide x 6-tall grid)
// Each letter = array of 6 rows, each row = 4 bits (1=filled)
const LETTERS = {
  R: [
    0b1110,
    0b1001,
    0b1110,
    0b1010,
    0b1001,
    0b1001,
  ],
  A: [
    0b0110,
    0b1001,
    0b1001,
    0b1111,
    0b1001,
    0b1001,
  ],
  V: [
    0b1001,
    0b1001,
    0b1001,
    0b1001,
    0b0110,
    0b0000,
  ],
  E: [
    0b1111,
    0b1000,
    0b1110,
    0b1000,
    0b1000,
    0b1111,
  ],
  N: [
    0b1001,
    0b1101,
    0b1011,
    0b1001,
    0b1001,
    0b1001,
  ],
  S: [
    0b0111,
    0b1000,
    0b0110,
    0b0001,
    0b0001,
    0b1110,
  ],
}

const BLOCK = 6
const COLS = 4
const ROWS = 6

function Letter({ pattern }) {
  const blocks = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (pattern[row] & (1 << (COLS - 1 - col))) {
        blocks.push({ row, col })
      }
    }
  }

  return (
    <svg
      width={COLS * BLOCK + BLOCK}
      height={ROWS * BLOCK + BLOCK}
      viewBox={`0 0 ${COLS * BLOCK + BLOCK} ${ROWS * BLOCK + BLOCK}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {blocks.map((b) => (
        <rect
          key={`s-${b.row}-${b.col}`}
          x={b.col * BLOCK + BLOCK}
          y={b.row * BLOCK}
          width={BLOCK}
          height={BLOCK}
          rx={1}
          className={styles.blockShadow}
        />
      ))}
      {blocks.map((b) => (
        <rect
          key={`m-${b.row}-${b.col}`}
          x={b.col * BLOCK}
          y={b.row * BLOCK}
          width={BLOCK}
          height={BLOCK}
          rx={1}
          className={styles.blockMain}
        />
      ))}
    </svg>
  )
}

export default function WelcomeLogo({ text = 'RAVENS' }) {
  return (
    <div className={styles.logo}>
      {[...text].map((ch, i) => {
        const pattern = LETTERS[ch.toUpperCase()]
        if (!pattern) return null
        return (
          <span key={i} className={styles.letterWrap} style={{ animationDelay: `${200 + i * 80}ms` }}>
            <Letter pattern={pattern} />
          </span>
        )
      })}
    </div>
  )
}
