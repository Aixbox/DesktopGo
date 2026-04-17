import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./scripts/ts-test-loader.mjs', pathToFileURL('./'))
