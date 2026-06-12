import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const CircuitState = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
})

function createCircuitBreaker(threshold = 5, resetMs = 100) {
  const states = new Map()

  function getState(toolName) {
    if (!states.has(toolName)) {
      states.set(toolName, { state: CircuitState.CLOSED, failureCount: 0, lastFailureTime: 0, halfOpenProbe: false })
    }
    return states.get(toolName)
  }

  return {
    recordFailure(toolName) {
      const s = getState(toolName)
      s.failureCount++
      s.lastFailureTime = Date.now()

      if (s.state === CircuitState.HALF_OPEN) {
        s.state = CircuitState.OPEN
        s.halfOpenProbe = false
      } else if (s.failureCount >= threshold) {
        s.state = CircuitState.OPEN
      }
    },

    recordSuccess(toolName) {
      const s = getState(toolName)
      s.failureCount = 0
      s.state = CircuitState.CLOSED
      s.halfOpenProbe = false
    },

    isOpen(toolName) {
      const s = getState(toolName)

      switch (s.state) {
        case CircuitState.CLOSED:
          return false

        case CircuitState.OPEN:
          if (Date.now() - s.lastFailureTime > resetMs) {
            s.state = CircuitState.HALF_OPEN
            s.halfOpenProbe = false
            return false
          }
          return true

        case CircuitState.HALF_OPEN:
          if (s.halfOpenProbe) {
            return true
          }
          s.halfOpenProbe = true
          return false
      }

      return false
    },

    getState(toolName) {
      return getState(toolName).state
    },

    getOpenCircuits() {
      const open = []
      for (const [name, s] of states) {
        if (s.state === CircuitState.OPEN) open.push(name)
      }
      return open
    },
  }
}

describe('CircuitBreaker', () => {
  let breaker

  beforeEach(() => {
    breaker = createCircuitBreaker(5, 100)
  })

  it('initial state is CLOSED', () => {
    assert.equal(breaker.getState('tool'), CircuitState.CLOSED)
    assert.equal(breaker.isOpen('tool'), false)
  })

  it('failure threshold opens circuit: 5 failures → OPEN', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure('bash')
    }

    assert.equal(breaker.getState('bash'), CircuitState.OPEN)
    assert.equal(breaker.isOpen('bash'), true)
  })

  it('OPEN fast-fails: requests are rejected', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure('bash')
    }

    assert.equal(breaker.isOpen('bash'), true)
    assert.equal(breaker.isOpen('bash'), true)
    assert.equal(breaker.isOpen('bash'), true)
  })

  it('timeout transitions to HALF_OPEN: after resetMs → isOpen returns false (one probe allowed)', async () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure('bash')
    }

    assert.equal(breaker.getState('bash'), CircuitState.OPEN)

    await new Promise(resolve => setTimeout(resolve, 150))

    assert.equal(breaker.isOpen('bash'), false)
    assert.equal(breaker.getState('bash'), CircuitState.HALF_OPEN)
  })

  it('HALF_OPEN probe success → CLOSED', async () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure('bash')
    }

    await new Promise(resolve => setTimeout(resolve, 150))

    breaker.isOpen('bash')
    breaker.recordSuccess('bash')

    assert.equal(breaker.getState('bash'), CircuitState.CLOSED)
    assert.equal(breaker.isOpen('bash'), false)
  })

  it('HALF_OPEN probe failure → OPEN', async () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure('bash')
    }

    await new Promise(resolve => setTimeout(resolve, 150))

    breaker.isOpen('bash')
    breaker.recordFailure('bash')

    assert.equal(breaker.getState('bash'), CircuitState.OPEN)
    assert.equal(breaker.isOpen('bash'), true)
  })

  it('different tools have independent circuits', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure('bash')
    }

    assert.equal(breaker.getState('bash'), CircuitState.OPEN)
    assert.equal(breaker.getState('read'), CircuitState.CLOSED)
    assert.equal(breaker.isOpen('bash'), true)
    assert.equal(breaker.isOpen('read'), false)
  })

  it('getOpenCircuits returns all OPEN circuits', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure('bash')
      breaker.recordFailure('write')
    }

    const openCircuits = breaker.getOpenCircuits()
    assert.equal(openCircuits.length, 2)
    assert.ok(openCircuits.includes('bash'))
    assert.ok(openCircuits.includes('write'))
    assert.ok(!openCircuits.includes('read'))
  })
})
