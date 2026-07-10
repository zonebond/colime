/**
 * Board backend adapter selection.
 *
 * Board's UI code goes through the single `adapter` object exported here.
 * Which concrete backend answers is decided in this file — today it's
 * always ravens; a future pi-agent (or any other backend) plugs in the
 * same way and this file becomes the one line that changes per product.
 */
import { ravensAdapter, streamSessionEvents as ravensStreamSessionEvents } from './ravens'

export const adapter = ravensAdapter
export const streamSessionEvents = ravensStreamSessionEvents
