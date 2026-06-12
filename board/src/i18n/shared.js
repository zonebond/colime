import { createContext } from 'react'
import { en } from './en'
import { zh } from './zh'

export const MESSAGES = { en, zh }

export const LanguageContext = createContext(null)
